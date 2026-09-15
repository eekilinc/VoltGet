import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { setTimeout as delay } from 'timers/promises';
import { resetRetryAttempts, scheduleRetry, type RetryPolicy } from './retry.js';
import {
  commitDownload,
  jobTempDir,
  mergeParts,
  RangeResponseError,
  validateRange,
} from './transfer.js';

export interface HttpDownloadController {
  pause: () => void | Promise<void>;
  kill: () => void | Promise<void>;
  resume: () => Promise<void>;
}

export interface HttpDownloadOptions {
  url: string;
  cookie?: string;
  speedLimitKB?: number;
  title?: string;
  filename?: string;
  outDir?: string;
  outPath?: string;
  isHttp?: boolean;
}

export interface HttpDownloadDeps {
  activeDownloads: Map<string, HttpDownloadController>;
  activeOpts: Map<string, HttpDownloadOptions>;
  pausingIds: Set<string>;
  cancelledIds?: Set<string>;
  getSpeedLimitKB: () => number;
  updatePowerSaveBlocker: () => void;
  processPending: () => void;
  addToHistory: (item: {
    id: string;
    url: string;
    title: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    date: number;
  }) => void;
  ensureDir: (dir: string) => void;
  send: (channel: string, data: unknown) => void;
  notify: (title: string, body: string) => void;
  getPartsCount?: () => number;
  getRetryPolicy?: () => RetryPolicy;
  getProxyAgent?: () => http.Agent | https.Agent | undefined;
  getRequestTimeoutMs?: () => number;
  onFileCompleted?: (id: string, filePath: string) => void;
  resolveConflictPath?: (outPath: string) => Promise<{ proceed: boolean; finalPath: string }>;
}

const UA = 'Mozilla/5.0 VoltGet';
type Metadata = { url: string; size: number; validator: string; parts: number };

async function readMetadata(file: string): Promise<Metadata | undefined> {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function validatorOf(res: http.IncomingMessage): string {
  const etag = res.headers.etag;
  return etag && !etag.startsWith('W/') ? etag : res.headers['last-modified'] || '';
}

async function request(
  url: string,
  method: string,
  headers: http.OutgoingHttpHeaders,
  deps: HttpDownloadDeps,
  signal: AbortSignal
): Promise<http.IncomingMessage> {
  for (let redirects = 0; redirects <= 10; redirects++) {
    signal.throwIfAborted();
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol))
      throw new Error('Yalnızca HTTP/HTTPS destekleniyor');
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = (parsed.protocol === 'https:' ? https : http).request(
        parsed,
        {
          method,
          headers,
          signal,
          agent: deps.getProxyAgent?.(),
        },
        resolve
      );
      req.setTimeout(deps.getRequestTimeoutMs?.() ?? 30000, () =>
        req.destroy(new Error('İstek zaman aşımına uğradı'))
      );
      req.on('error', reject);
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
      const next = new URL(res.headers.location, url);
      if (next.origin !== parsed.origin) {
        headers = { ...headers };
        delete headers.Cookie;
        delete headers.Authorization;
      }
      res.destroy();
      url = next.href;
      continue;
    }
    return res;
  }
  throw new Error('Çok fazla yönlendirme');
}

export function runMultiPartHttpDownload(
  deps: HttpDownloadDeps,
  id: string,
  opts: HttpDownloadOptions,
  outDir: string,
  outPath: string,
  filename: string
): Promise<void> {
  return runDownload(deps, id, opts, outDir, outPath, filename, true);
}

export function runHttpDownload(
  deps: HttpDownloadDeps,
  id: string,
  opts: HttpDownloadOptions,
  outDir: string,
  outPath: string,
  filename: string
): Promise<void> {
  return runDownload(deps, id, opts, outDir, outPath, filename, false);
}

async function runDownload(
  deps: HttpDownloadDeps,
  id: string,
  opts: HttpDownloadOptions,
  outDir: string,
  outPath: string,
  filename: string,
  multipart: boolean
): Promise<void> {
  const abort = new AbortController();
  let cancelled = false;
  let paused = false;
  let retryScheduled = false;
  let committing = false;
  let tempDir = '';
  let finish!: () => void;
  const stopped = new Promise<void>(resolve => {
    finish = resolve;
  });
  deps.pausingIds.delete(id);
  const controller: HttpDownloadController = {
    pause: () => {
      paused = true;
      abort.abort();
      return retryScheduled ? undefined : stopped;
    },
    kill: () => {
      cancelled = true;
      abort.abort();
      return retryScheduled ? undefined : stopped;
    },
    resume: async () => {},
  };
  deps.activeDownloads.set(id, controller);
  deps.activeOpts.set(id, { ...opts, isHttp: true, outDir, outPath, filename });
  deps.updatePowerSaveBlocker();
  const headers: http.OutgoingHttpHeaders = {
    'User-Agent': UA,
    'Accept-Encoding': 'identity',
    ...(opts.cookie ? { Cookie: opts.cookie } : {}),
  };
  let transferred = 0;
  let lastProgress = 0;
  const started = Date.now();
  // Shared by all parts of this job. Previously downloaded bytes do not affect speed.
  const meter = (
    initial: number,
    expected: number | undefined,
    total: number,
    signal: AbortSignal
  ) => {
    let received = 0;
    return new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        transferred += chunk.length;
        if (expected !== undefined && received > expected) {
          callback(new RangeResponseError('Sunucu beklenenden fazla veri gönderdi'));
          return;
        }
        const elapsed = Math.max(0.1, (Date.now() - started) / 1000);
        const speed = transferred / elapsed;
        if (Date.now() - lastProgress >= 200) {
          lastProgress = Date.now();
          const percent = total ? Math.min(100, ((initial + transferred) / total) * 100) : 0;
          deps.send('download-progress', {
            id,
            percent: Math.round(percent),
            total: total ? `${(total / 1024 / 1024).toFixed(1)}MB` : '',
            speed: `${(speed / 1024 / 1024).toFixed(2)} MB/s`,
            eta: '-',
            raw: `${percent.toFixed(1)}%`,
          });
        }
        const limit = opts.speedLimitKB ?? deps.getSpeedLimitKB();
        const wait =
          limit > 0
            ? Math.max(0, (transferred / (limit * 1024)) * 1000 - (Date.now() - started))
            : 0;
        if (wait > 0) {
          delay(Math.min(wait, 2147483647), undefined, { signal }).then(
            () => callback(null, chunk),
            error => callback(error)
          );
        } else callback(null, chunk);
      },
      flush(callback) {
        callback(
          expected !== undefined && received !== expected
            ? new RangeResponseError('İndirme eksik tamamlandı')
            : undefined
        );
      },
    });
  };

  try {
    tempDir = jobTempDir(outDir, id);
    await fs.promises.mkdir(tempDir, { recursive: true });
    if (deps.resolveConflictPath) {
      const conflict = await deps.resolveConflictPath(outPath);
      abort.signal.throwIfAborted();
      if (!conflict.proceed) {
        deps.send('download-canceled', { id });
        return;
      }
      outPath = conflict.finalPath;
      filename = path.basename(outPath);
      deps.activeOpts.set(id, { ...opts, isHttp: true, outDir, outPath, filename });
    }
    let meta: Metadata | undefined;
    if (multipart) {
      try {
        const head = await request(opts.url, 'HEAD', headers, deps, abort.signal);
        const size = Number(head.headers['content-length']);
        if (
          head.statusCode === 200 &&
          head.headers['accept-ranges'] === 'bytes' &&
          Number.isSafeInteger(size) &&
          size > 1
        ) {
          meta = {
            url: opts.url,
            size,
            validator: validatorOf(head),
            parts: Math.min(size, Math.min(16, Math.max(1, deps.getPartsCount?.() ?? 8))),
          };
        }
        head.destroy();
      } catch {
        abort.signal.throwIfAborted();
      }
    }
    let temporary = outPath + '.part';
    let expected: number | undefined;
    if (meta) {
      const manifest = path.join(tempDir, 'metadata.json');
      const old = await readMetadata(manifest);
      if (!meta.validator || JSON.stringify(old) !== JSON.stringify(meta)) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        await fs.promises.mkdir(tempDir, { recursive: true });
      }
      await fs.promises.writeFile(manifest, JSON.stringify(meta));
      const partSize = Math.floor(meta.size / meta.parts);
      const parts = Array.from({ length: meta.parts }, (_, i) => path.join(tempDir, `part_${i}`));
      const sizes = await Promise.all(
        parts.map(async file => {
          try {
            return (await fs.promises.stat(file)).size;
          } catch {
            return 0;
          }
        })
      );
      const initial = sizes.reduce((sum, value) => sum + value, 0);
      const partAbort = new AbortController();
      const onAbort = () => partAbort.abort();
      abort.signal.addEventListener('abort', onAbort, { once: true });
      let failure: unknown;
      const metadata = meta;
      await Promise.allSettled(
        parts.map(async (file, index) => {
          try {
            const start = index * partSize;
            const end = index === metadata.parts - 1 ? metadata.size - 1 : start + partSize - 1;
            const required = end - start + 1;
            if (sizes[index] > required) throw new RangeResponseError('Geçersiz kısmi dosya');
            if (sizes[index] === required) return;
            const actualStart = start + sizes[index];
            const res = await request(
              opts.url,
              'GET',
              {
                ...headers,
                Range: `bytes=${actualStart}-${end}`,
                ...(metadata.validator ? { 'If-Range': metadata.validator } : {}),
              },
              deps,
              partAbort.signal
            );
            try {
              validateRange(
                res.statusCode,
                res.headers['content-range'],
                actualStart,
                end,
                metadata.size
              );
            } catch (error) {
              res.destroy();
              throw error;
            }
            await pipeline(
              res,
              meter(initial, end - actualStart + 1, metadata.size, partAbort.signal),
              fs.createWriteStream(file, { flags: sizes[index] ? 'a' : 'w' }),
              { signal: partAbort.signal }
            );
          } catch (error) {
            failure ??= error;
            partAbort.abort();
            throw error;
          }
        })
      );
      abort.signal.removeEventListener('abort', onAbort);
      abort.signal.throwIfAborted();
      if (failure) {
        if (!(failure instanceof RangeResponseError)) throw failure;
        // Every sibling stream is closed before switching to a fresh single request.
        meta = undefined;
        transferred = 0;
      } else {
        temporary = path.join(tempDir, `merged_${id}`);
        await mergeParts(parts, temporary, abort.signal);
        expected = metadata.size;
      }
    }
    if (!meta) {
      const manifest = temporary + '.json';
      const old = await readMetadata(manifest);
      let offset = 0;
      if (old?.url === opts.url && old.validator) {
        try {
          offset = (await fs.promises.stat(temporary)).size;
        } catch {}
      }
      let res = await request(
        opts.url,
        'GET',
        {
          ...headers,
          ...(offset && old ? { Range: `bytes=${offset}-`, 'If-Range': old.validator } : {}),
        },
        deps,
        abort.signal
      );
      if (offset && res.statusCode === 206 && old) {
        try {
          validateRange(
            res.statusCode,
            res.headers['content-range'],
            offset,
            old.size - 1,
            old.size
          );
        } catch {
          res.destroy();
          offset = 0;
          res = await request(opts.url, 'GET', headers, deps, abort.signal);
        }
      } else if (offset) {
        offset = 0;
        if (res.statusCode !== 200) {
          res.destroy();
          res = await request(opts.url, 'GET', headers, deps, abort.signal);
        }
      }
      if (res.statusCode !== 200 && !(offset && res.statusCode === 206)) {
        res.destroy();
        throw new Error(`HTTP ${res.statusCode}`);
      }
      const length =
        res.headers['content-length'] === undefined
          ? undefined
          : Number(res.headers['content-length']);
      expected = length === undefined ? undefined : length + offset;
      await fs.promises.writeFile(
        manifest,
        JSON.stringify({
          url: opts.url,
          size: expected || 0,
          validator: validatorOf(res),
          parts: 1,
        })
      );
      await pipeline(
        res,
        meter(offset, length, expected || 0, abort.signal),
        fs.createWriteStream(temporary, { flags: offset ? 'a' : 'w' }),
        { signal: abort.signal }
      );
    }
    abort.signal.throwIfAborted();
    committing = true;
    const size = await commitDownload(temporary, outPath, expected);
    if (cancelled || paused) return;
    resetRetryAttempts(id);
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    await fs.promises.rm(outPath + '.part.json', { force: true }).catch(() => {});
    deps.addToHistory({
      id,
      url: opts.url,
      title: filename,
      fileName: filename,
      filePath: outPath,
      fileSize: size,
      date: Date.now(),
    });
    deps.send('download-done', {
      id,
      code: 0,
      outDir,
      filePath: outPath,
      fileName: filename,
      size,
    });
    try {
      deps.onFileCompleted?.(id, outPath);
      deps.notify('VoltGet: İndirme bitti', filename.slice(0, 50));
    } catch {}
  } catch (error) {
    if (!abort.signal.aborted && !deps.cancelledIds?.has(id) && !deps.pausingIds.has(id)) {
      const message = error instanceof Error ? error.message : String(error);
      const policy = deps.getRetryPolicy?.();
      if (!committing && policy) {
        retryScheduled = scheduleRetry(
          id,
          policy,
          () => {
            if (!cancelled && !paused && !deps.cancelledIds?.has(id)) {
              void runDownload(deps, id, opts, outDir, outPath, filename, multipart);
            }
          },
          (attempt, max, delayMs) =>
            deps.send('download-log', {
              id,
              text: `Yeniden deneme ${attempt}/${max}: ${Math.round(delayMs / 1000)} sn`,
            })
        );
      }
      if (!retryScheduled)
        deps.send('download-error', {
          id,
          error: committing ? `Dosya kaydedilemedi; geçici indirme korundu: ${message}` : message,
        });
    }
  } finally {
    if (cancelled) {
      if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      await fs.promises.rm(outPath + '.part', { force: true }).catch(() => {});
      await fs.promises.rm(outPath + '.part.json', { force: true }).catch(() => {});
    }
    // A newer resume operation may already own this id.
    if (deps.activeDownloads.get(id) === controller && !retryScheduled) {
      deps.activeDownloads.delete(id);
      deps.activeOpts.delete(id);
    }
    if (!retryScheduled) {
      deps.updatePowerSaveBlocker();
      deps.processPending();
    }
    finish();
  }
}
