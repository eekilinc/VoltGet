import { ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export async function computeFileHash(
  filePath: string,
  algorithm: 'md5' | 'sha256' | 'sha1' = 'sha256'
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!filePath || !fs.existsSync(filePath)) {
      return reject(new Error('Dosya bulunamadı'));
    }
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => reject(err));
  });
}

export function registerFileIpc(deps: {
  scanFiles: (dir: string, baseDir: string) => any[];
  ensureDir: (dir: string) => void;
  getDefaultDir: () => string;
  syncHistory: () => void;
  loadHistory: () => any[];
  loadQueue: () => any[];
  saveQueue: (jobs: any[]) => void;
  removeFromHistory: (id: string) => void;
  getCategory: (ext: string) => string;
  statfsSync?: (p: string) => { bavail: number; bsize: number; blocks: number };
}) {
  ipcMain.handle('list-files', async (_e, mode?: string, customDir?: string) => {
    if (mode === 'all') {
      const targetDir = customDir || deps.getDefaultDir();
      deps.ensureDir(targetDir);
      const files = deps.scanFiles(targetDir, targetDir);
      return files.sort((a, b) => b.mtime - a.mtime);
    }
    deps.syncHistory();
    const history = deps.loadHistory();
    return history
      .map((item: any) => {
        const exists = fs.existsSync(item.filePath);
        let size = item.fileSize || 0;
        let mtime = item.date || Date.now();
        if (exists) {
          try {
            const s = fs.statSync(item.filePath);
            if (s.size > 0) size = s.size;
            mtime = s.mtimeMs;
          } catch {}
        }
        const ext = path.extname(item.filePath).slice(1).toLowerCase();
        return {
          id: item.id,
          name: item.fileName || path.basename(item.filePath),
          path: item.filePath,
          relativePath: item.fileName || path.basename(item.filePath),
          folder: path.dirname(item.filePath),
          size,
          mtime,
          ext,
          category: item.category || deps.getCategory(ext),
          url: item.url,
          exists,
          deletedFromDisk: !exists,
        };
      })
      .sort((a, b) => b.mtime - a.mtime);
  });

  ipcMain.handle('check-file-exists', async (_e, filePath: string) => {
    if (!filePath) return false;
    return fs.existsSync(filePath);
  });

  ipcMain.handle('open-file', async (_e, filePath: string) => {
    if (filePath && fs.existsSync(filePath)) return shell.openPath(filePath);
    return 'Dosya bulunamadı';
  });

  ipcMain.handle('show-in-folder', async (_e, filePath: string) => {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return true;
    }
    return false;
  });

  function purgeQueue(idOrPath: string): void {
    try {
      const q = deps.loadQueue();
      const updated = q.filter(
        (x: any) => x.id !== idOrPath && x.filePath !== idOrPath && x.opts?.outPath !== idOrPath
      );
      if (updated.length !== q.length) deps.saveQueue(updated);
    } catch {}
  }

  ipcMain.handle('remove-from-history', async (_e, idOrPath: string) => {
    if (!idOrPath) return false;
    deps.removeFromHistory(idOrPath);
    purgeQueue(idOrPath);
    return true;
  });

  ipcMain.handle('delete-file', async (_e, payload: any) => {
    const { filePath, deleteFromDisk, id } = payload || {};
    if (deleteFromDisk) {
      if (filePath && fs.existsSync(filePath)) {
        try {
          await shell.trashItem(filePath);
        } catch {
          try {
            fs.unlinkSync(filePath);
          } catch (e: any) {
            return { success: false, error: String(e) };
          }
        }
      }
      if (filePath) {
        const partFile = filePath + '.part';
        if (fs.existsSync(partFile)) {
          try {
            fs.unlinkSync(partFile);
          } catch {}
        }
        const dir = path.dirname(filePath);
        if (id) {
          const tempDir = path.join(dir, `.tmp_${id}`);
          if (fs.existsSync(tempDir)) {
            try {
              fs.rmSync(tempDir, { recursive: true, force: true });
            } catch {}
          }
        }
      }
    }
    try {
      if (id) {
        deps.removeFromHistory(id);
        purgeQueue(id);
      } else if (filePath) {
        deps.removeFromHistory(filePath);
        purgeQueue(filePath);
      }
    } catch {}
    return { success: true };
  });

  interface FsStatFs {
    bavail: number;
    bsize: number;
    blocks: number;
  }
  ipcMain.handle('get-disk-space', async (_e, dirPath?: string) => {
    try {
      const target = dirPath || deps.getDefaultDir();
      deps.ensureDir(target);
      const stats = fs.statfsSync(target) as unknown as FsStatFs;
      const freeBytes = stats.bavail * stats.bsize;
      const totalBytes = stats.blocks * stats.bsize;
      const formatGb = (b: number) => (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
      return { free: formatGb(freeBytes), total: formatGb(totalBytes), freeBytes, totalBytes };
    } catch {
      return { free: 'Bilinmiyor', total: '', freeBytes: 0, totalBytes: 0 };
    }
  });

  ipcMain.handle(
    'compute-file-hash',
    async (_e, filePath: string, algorithm: 'md5' | 'sha256' | 'sha1' = 'sha256') => {
      try {
        const hash = await computeFileHash(filePath, algorithm);
        return { success: true, hash, algorithm };
      } catch (e: any) {
        return { success: false, error: e?.message || String(e) };
      }
    }
  );
}
