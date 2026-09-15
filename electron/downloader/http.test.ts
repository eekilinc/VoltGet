import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { runMultiPartHttpDownload, runHttpDownload, type HttpDownloadDeps } from './http.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.restoreAllMocks();
});

async function fixture(handler: http.RequestListener) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'voltget-http-'));
  cleanups.push(() => fs.promises.rm(dir, { recursive: true, force: true }));
  const server = http.createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    () =>
      new Promise<void>(resolve => {
        server.closeAllConnections();
        server.close(() => resolve());
      })
  );
  const url = `http://127.0.0.1:${(server.address() as import('net').AddressInfo).port}/file`;
  const deps: HttpDownloadDeps = {
    activeDownloads: new Map(),
    activeOpts: new Map(),
    pausingIds: new Set(),
    cancelledIds: new Set(),
    getSpeedLimitKB: () => 0,
    updatePowerSaveBlocker: vi.fn(),
    processPending: vi.fn(),
    addToHistory: vi.fn(),
    ensureDir: vi.fn(),
    send: vi.fn(),
    notify: vi.fn(),
    getPartsCount: () => 4,
    getRequestTimeoutMs: () => 1000,
  };
  return { dir, url, deps, output: path.join(dir, 'file.bin') };
}
const data = Buffer.from('a'.repeat(256 * 1024) + 'b'.repeat(256 * 1024));
function serveRanges(req: http.IncomingMessage, res: http.ServerResponse) {
  res.setHeader('ETag', '"v1"');
  res.setHeader('Accept-Ranges', 'bytes');
  if (req.method === 'HEAD') {
    res.setHeader('Content-Length', data.length);
    res.end();
    return;
  }
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const start = Number(range[1]),
      end = range[2] ? Number(range[2]) : data.length - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${data.length}`,
      'Content-Length': end - start + 1,
    });
    res.end(data.subarray(start, end + 1));
  } else {
    res.setHeader('Content-Length', data.length);
    res.end(data);
  }
}

describe('HTTP download integrity', () => {
  it('joins verified ranges into the exact original file', async () => {
    const f = await fixture(serveRanges);
    await runMultiPartHttpDownload(f.deps, 'job', { url: f.url }, f.dir, f.output, 'file.bin');
    expect(await fs.promises.readFile(f.output)).toEqual(data);
    expect(f.deps.send).toHaveBeenCalledWith(
      'download-done',
      expect.objectContaining({ size: data.length })
    );
  });
  it.each(['ignored', 'wrong'])('falls back safely when ranges are %s', async mode => {
    const f = await fixture((req, res) => {
      if (req.method === 'HEAD') return serveRanges(req, res);
      if (mode === 'wrong' && req.headers.range) {
        res.writeHead(206, { 'Content-Range': `bytes 0-${data.length - 1}/${data.length}` });
      }
      res.end(data);
    });
    await runMultiPartHttpDownload(f.deps, 'job', { url: f.url }, f.dir, f.output, 'file.bin');
    expect(await fs.promises.readFile(f.output)).toEqual(data);
  });
  it('restarts a single resume when the server returns 200', async () => {
    const f = await fixture((_req, res) => res.end(data));
    await fs.promises.writeFile(f.output + '.part', 'stale bytes');
    await fs.promises.writeFile(
      f.output + '.part.json',
      JSON.stringify({ url: f.url, size: data.length, validator: '"v1"', parts: 1 })
    );
    await runHttpDownload(f.deps, 'job', { url: f.url }, f.dir, f.output, 'file.bin');
    expect(await fs.promises.readFile(f.output)).toEqual(data);
  });
  it('preserves completed parts and the old destination when commit fails', async () => {
    const f = await fixture(serveRanges);
    await fs.promises.writeFile(f.output, 'existing file');
    vi.spyOn(fs.promises, 'rename').mockRejectedValue(new Error('disk denied'));
    await runMultiPartHttpDownload(f.deps, 'job', { url: f.url }, f.dir, f.output, 'file.bin');
    expect(await fs.promises.readFile(f.output, 'utf8')).toBe('existing file');
    expect(await fs.promises.readFile(path.join(f.dir, '.tmp_job', 'merged_job'))).toEqual(data);
    expect(f.deps.addToHistory).not.toHaveBeenCalled();
    expect(f.deps.send).toHaveBeenCalledWith(
      'download-error',
      expect.objectContaining({ id: 'job' })
    );
  });
  it('reports a truncated response as an error without publishing the partial file', async () => {
    const f = await fixture((_req, res) => {
      res.writeHead(200, { 'Content-Length': data.length });
      res.end('short');
    });
    await runHttpDownload(f.deps, 'job', { url: f.url }, f.dir, f.output, 'file.bin');
    expect(fs.existsSync(f.output)).toBe(false);
    expect(f.deps.addToHistory).not.toHaveBeenCalled();
  });
  it('cancels during response streaming without success or retry', async () => {
    const f = await fixture((_req, res) => {
      res.writeHead(200, { 'Content-Length': data.length });
      res.write('start');
    });
    const running = runHttpDownload(f.deps, 'job', { url: f.url }, f.dir, f.output, 'file.bin');
    await vi.waitFor(() => expect(fs.existsSync(f.output + '.part')).toBe(true));
    f.deps.activeDownloads.get('job')!.kill();
    await running;
    expect(fs.existsSync(f.output)).toBe(false);
    expect(fs.existsSync(f.output + '.part')).toBe(false);
    expect(f.deps.addToHistory).not.toHaveBeenCalled();
  });
  it('resumes verified partial bytes after pausing without duplicating content', async () => {
    const f = await fixture((req, res) => {
      if (req.headers.range) return serveRanges(req, res);
      res.writeHead(200, { ETag: '"v1"', 'Content-Length': data.length });
      let offset = 0;
      const timer = setInterval(() => {
        const next = Math.min(offset + 32768, data.length);
        res.write(data.subarray(offset, next));
        offset = next;
        if (offset === data.length) {
          clearInterval(timer);
          res.end();
        }
      }, 30);
      res.on('close', () => clearInterval(timer));
    });
    const running = runHttpDownload(f.deps, 'job', { url: f.url }, f.dir, f.output, 'file.bin');
    await vi.waitFor(() => expect(fs.statSync(f.output + '.part').size).toBeGreaterThan(0));
    f.deps.pausingIds.add('job');
    await f.deps.activeDownloads.get('job')!.pause();
    await running;
    expect(fs.existsSync(f.output)).toBe(false);
    expect(fs.statSync(f.output + '.part').size).toBeLessThan(data.length);
    await runHttpDownload(f.deps, 'job', { url: f.url }, f.dir, f.output, 'file.bin');
    expect(await fs.promises.readFile(f.output)).toEqual(data);
    expect(f.deps.addToHistory).toHaveBeenCalledTimes(1);
  });
});
