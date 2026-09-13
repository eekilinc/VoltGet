import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';

export interface HttpDownloadController {
  pause: () => void;
  kill: () => void;
}

export interface HttpDownloadDeps {
  activeDownloads: Map<string, HttpDownloadController>;
  activeOpts: Map<string, any>;
  pausingIds: Set<string>;
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
  send: (channel: string, data: any) => void;
  notify: (title: string, body: string) => void;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function runMultiPartHttpDownload(
  deps: HttpDownloadDeps,
  id: string,
  opts: any,
  outDir: string,
  outPath: string,
  filename: string
): Promise<void> {
  const protocol = opts.url.startsWith('https') ? https : http;
  const partsCount = 8;
  const tempDir = path.join(outDir, `.tmp_${id}`);
  deps.ensureDir(tempDir);

  const getHeaders = (rangeHeader?: string) => ({
    'User-Agent': UA,
    ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    ...(rangeHeader ? { Range: rangeHeader } : {}),
  });

  try {
    const headReq = await new Promise<{ totalSize: number; acceptRanges: boolean }>(
      (resolve, reject) => {
        const parsedUrl = new URL(opts.url);
        const req = protocol.request(
          {
            method: 'HEAD',
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: getHeaders(),
          },
          res => {
            const totalSize = parseInt(res.headers['content-length'] || '0');
            const acceptRanges =
              res.headers['accept-ranges'] === 'bytes' || !!res.headers['content-range'];
            resolve({ totalSize, acceptRanges });
          }
        );
        req.on('error', reject);
        req.end();
      }
    );

    if (!headReq.acceptRanges || headReq.totalSize <= 0) {
      runHttpDownload(deps, id, opts, outDir, outPath, filename);
      return;
    }

    const totalSize = headReq.totalSize;
    const partSize = Math.floor(totalSize / partsCount);
    const partProgress: number[] = new Array(partsCount).fill(0);
    const activeReqs: any[] = [];
    let isAborted = false;
    const startTime = Date.now();
    const speedLimitKB = deps.getSpeedLimitKB();

    const downloadPart = (index: number, start: number, end: number) => {
      return new Promise<void>((resolve, reject) => {
        const partFile = path.join(tempDir, `part_${index}`);
        let existingBytes = 0;
        if (fs.existsSync(partFile)) {
          try {
            existingBytes = fs.statSync(partFile).size;
          } catch {}
        }
        const requiredBytes = end - start + 1;
        if (existingBytes >= requiredBytes) {
          partProgress[index] = requiredBytes;
          return resolve();
        }
        partProgress[index] = existingBytes;
        const actualStart = start + existingBytes;
        const fileStream = fs.createWriteStream(partFile, { flags: existingBytes > 0 ? 'a' : 'w' });
        const parsedUrl = new URL(opts.url);
        const req = protocol.get(
          {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: getHeaders(`bytes=${actualStart}-${end}`),
          },
          res => {
            if (res.statusCode !== 206 && res.statusCode !== 200) {
              fileStream.close();
              return reject(new Error(`HTTP ${res.statusCode} for part ${index}`));
            }
            res.on('data', (chunk: Buffer) => {
              if (isAborted) {
                try {
                  res.destroy();
                } catch {}
                return;
              }
              partProgress[index] += chunk.length;
              const currentTotal = partProgress.reduce((a, b) => a + b, 0);
              const percent = totalSize > 0 ? (currentTotal / totalSize) * 100 : 0;
              const elapsedTime = Math.max(0.1, (Date.now() - startTime) / 1000);
              const currentSpeedKBps = currentTotal / 1024 / elapsedTime;
              const limit = deps.getSpeedLimitKB();
              if (limit > 0 && currentSpeedKBps > limit) {
                const delay = currentTotal / 1024 / limit - elapsedTime;
                if (delay > 0) {
                  res.pause();
                  setTimeout(() => {
                    try {
                      res.resume();
                    } catch {}
                  }, delay * 1000);
                }
              }
              const speed =
                currentSpeedKBps > 1024
                  ? (currentSpeedKBps / 1024).toFixed(2) + ' MB/s'
                  : currentSpeedKBps.toFixed(0) + ' KB/s';
              deps.send('download-progress', {
                id,
                percent: Math.round(percent),
                total: totalSize ? `${(totalSize / 1024 / 1024).toFixed(1)}MB` : '',
                speed,
                eta: '-',
                raw: `${percent.toFixed(1)}% • ${speed} (${partsCount} parça)`,
              });
            });
            res.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close();
              resolve();
            });
          }
        );
        req.on('error', err => {
          fileStream.close();
          if (isAborted) resolve();
          else reject(err);
        });
        activeReqs.push(req);
      });
    };

    deps.activeDownloads.set(id, {
      pause: () => {
        isAborted = true;
        activeReqs.forEach(r => {
          try {
            r.destroy();
          } catch {}
        });
      },
      kill: () => {
        isAborted = true;
        activeReqs.forEach(r => {
          try {
            r.destroy();
          } catch {}
        });
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      },
    });
    deps.activeOpts.set(id, { ...opts, isHttp: true, outDir, outPath, filename });
    deps.updatePowerSaveBlocker();

    const promises = [];
    for (let i = 0; i < partsCount; i++) {
      const start = i * partSize;
      const end = i === partsCount - 1 ? totalSize - 1 : (i + 1) * partSize - 1;
      promises.push(downloadPart(i, start, end));
    }
    await Promise.all(promises);

    if (deps.pausingIds.has(id) || isAborted) {
      deps.pausingIds.delete(id);
      deps.updatePowerSaveBlocker();
      deps.processPending();
      return;
    }

    const tempMergedPath = path.join(tempDir, `merged_${id}`);
    const finalStream = fs.createWriteStream(tempMergedPath);
    for (let i = 0; i < partsCount; i++) {
      const partFile = path.join(tempDir, `part_${i}`);
      if (fs.existsSync(partFile)) {
        const data = fs.readFileSync(partFile);
        finalStream.write(data);
      }
    }
    finalStream.end();
    await new Promise<void>(res => finalStream.on('finish', () => res()));
    try {
      fs.renameSync(tempMergedPath, outPath);
    } catch {
      try {
        fs.copyFileSync(tempMergedPath, outPath);
        fs.unlinkSync(tempMergedPath);
      } catch {}
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}

    deps.activeDownloads.delete(id);
    deps.activeOpts.delete(id);
    deps.updatePowerSaveBlocker();

    let statSize = 0;
    try {
      if (fs.existsSync(outPath)) statSize = fs.statSync(outPath).size;
    } catch {}
    deps.addToHistory({
      id,
      url: opts.url,
      title: filename,
      fileName: filename,
      filePath: outPath,
      fileSize: statSize,
      date: Date.now(),
    });
    deps.send('download-done', {
      id,
      code: 0,
      outDir,
      filePath: outPath,
      fileName: filename,
      size: statSize,
    });
    try {
      deps.notify('VoltGet: İndirme bitti (8 Parça)', filename.slice(0, 50));
    } catch {}
    deps.processPending();
    void speedLimitKB;
  } catch (err: any) {
    if (deps.pausingIds.has(id)) {
      deps.pausingIds.delete(id);
      deps.processPending();
      return;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    console.warn('[MultiPart] fallback to standard http-download:', err.message);
    runHttpDownload(deps, id, opts, outDir, outPath, filename);
  }
}

export function runHttpDownload(
  deps: HttpDownloadDeps,
  id: string,
  opts: any,
  outDir: string,
  outPath: string,
  filename: string
): void {
  const tempOutPath = outPath + '.part';
  const file = fs.createWriteStream(tempOutPath);
  const protocol = opts.url.startsWith('https') ? https : http;
  const startTime = Date.now();
  const req = protocol
    .get(
      opts.url,
      {
        headers: {
          'User-Agent': UA,
          ...(opts.cookie ? { Cookie: opts.cookie } : {}),
        },
      },
      (res: any) => {
        if (
          res.statusCode === 301 ||
          res.statusCode === 302 ||
          res.statusCode === 303 ||
          res.statusCode === 307
        ) {
          file.close();
          fs.unlink(tempOutPath, () => {});
          const nextOpts = { ...opts, url: res.headers.location };
          runHttpDownload(deps, id, nextOpts, outDir, outPath, filename);
          return;
        }
        if (res.statusCode >= 400) {
          file.destroy();
          fs.unlink(tempOutPath, () => {});
          deps.activeDownloads.delete(id);
          deps.activeOpts.delete(id);
          deps.updatePowerSaveBlocker();
          deps.send('download-error', {
            id,
            error: `HTTP ${res.statusCode}: ${res.statusMessage}`,
          });
          deps.processPending();
          return;
        }
        const totalSize = parseInt(res.headers['content-length'] || '0');
        let downloadedSize = 0;
        res.on('data', (chunk: Buffer) => {
          downloadedSize += chunk.length;
          const percent = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
          const speed =
            (downloadedSize / 1024 / 1024 / Math.max(0.1, (Date.now() - startTime) / 1000)).toFixed(
              2
            ) + ' MB/s';
          deps.send('download-progress', {
            id,
            percent: Math.round(percent),
            total: totalSize ? `${(totalSize / 1024 / 1024).toFixed(1)}MB` : '',
            speed,
            eta: '-',
            raw: `${percent.toFixed(1)}% • ${speed}`,
          });
        });
        res.pipe(file);
      }
    )
    .on('error', (e: any) => {
      file.destroy();
      fs.unlink(tempOutPath, () => {});
      deps.activeDownloads.delete(id);
      deps.activeOpts.delete(id);
      deps.updatePowerSaveBlocker();
      deps.send('download-error', { id, error: String(e) });
      deps.processPending();
    });
  deps.activeDownloads.set(id, {
    pause: () => {
      req.destroy();
      try {
        fs.unlinkSync(tempOutPath);
      } catch {}
    },
    kill: () => {
      req.destroy();
      try {
        fs.unlinkSync(tempOutPath);
      } catch {}
    },
  });
  deps.activeOpts.set(id, { ...opts, isHttp: true, outDir, outPath, filename });
  deps.updatePowerSaveBlocker();
  file.on('finish', () => {
    file.close();
    try {
      fs.renameSync(tempOutPath, outPath);
    } catch {
      try {
        fs.copyFileSync(tempOutPath, outPath);
        fs.unlinkSync(tempOutPath);
      } catch {}
    }
    deps.activeDownloads.delete(id);
    deps.activeOpts.delete(id);
    deps.updatePowerSaveBlocker();
    if (deps.pausingIds.has(id)) {
      deps.pausingIds.delete(id);
      deps.updatePowerSaveBlocker();
      deps.processPending();
      return;
    }
    let statSize = 0;
    try {
      if (fs.existsSync(outPath)) statSize = fs.statSync(outPath).size;
    } catch {}
    deps.addToHistory({
      id,
      url: opts.url,
      title: filename,
      fileName: filename,
      filePath: outPath,
      fileSize: statSize,
      date: Date.now(),
    });
    deps.send('download-done', {
      id,
      code: 0,
      outDir,
      filePath: outPath,
      fileName: filename,
      size: statSize,
    });
    try {
      deps.notify('VoltGet: İndirme bitti', filename.slice(0, 50));
    } catch {}
    deps.processPending();
  });
}
