import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';

function cleanTempForJob(id: string, opts?: any) {
  try {
    if (opts?.outDir) {
      const tempDir = path.join(opts.outDir, `.tmp_${id}`);
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
    if (opts?.outPath) {
      const tempPart = opts.outPath + '.part';
      if (fs.existsSync(tempPart)) {
        fs.unlinkSync(tempPart);
      }
    }
  } catch {}
}

export interface QueueIpcDeps {
  activeDownloads: Map<string, any>;
  activeOpts: Map<string, any>;
  pendingQueue: Array<{ id: string; opts: any }>;
  pausedDownloads: Map<string, any>;
  pausingIds: Set<string>;
  canStart: () => boolean;
  processPending: () => void;
  doStartDownload: (id: string, opts: any) => void | Promise<void>;
  runMultiPart: (id: string, opts: any, outDir: string, outPath: string, filename: string) => void;
  getSiteFolder: (base: string, url: string, filename?: string) => string;
  getDefaultDir: () => string;
  updatePowerSaveBlocker: () => void;
  send: (channel: string, data: any) => void;
  cancelScheduledRetry?: (id: string) => void;
}

export function registerQueueIpc(deps: QueueIpcDeps) {
  ipcMain.handle('start-download', async (_e, opts: any) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (!deps.canStart()) {
      deps.pendingQueue.push({ id, opts });
      deps.send('download-queued', { id, opts, position: deps.pendingQueue.length });
      deps.send('switch-to-download-tab', {});
      return { id, queued: true, position: deps.pendingQueue.length };
    }
    void Promise.resolve(deps.doStartDownload(id, opts)).catch(() => {});
    deps.send('switch-to-download-tab', {});
    return { id, outDir: deps.getSiteFolder(opts.outDir || deps.getDefaultDir(), opts.url) };
  });

  ipcMain.handle('cancel-download', async (_e, id: string) => {
    const idx = deps.pendingQueue.findIndex(q => q.id === id);
    if (idx !== -1) {
      const [removed] = deps.pendingQueue.splice(idx, 1);
      deps.pausedDownloads.delete(id);
      try {
        deps.cancelScheduledRetry?.(id);
      } catch {}
      cleanTempForJob(id, removed?.opts);
      deps.send('download-canceled', { id });
      return true;
    }
    const p = deps.activeDownloads.get(id);
    if (p) {
      const opts = deps.activeOpts.get(id);
      try {
        p.kill();
      } catch {}
      try {
        deps.cancelScheduledRetry?.(id);
      } catch {}
      cleanTempForJob(id, opts);
      deps.activeDownloads.delete(id);
      deps.activeOpts.delete(id);
      deps.pausedDownloads.delete(id);
      deps.pausingIds.delete(id);
      deps.updatePowerSaveBlocker();
      deps.send('download-canceled', { id });
      deps.processPending();
      return true;
    }
    const pausedOpts = deps.pausedDownloads.get(id);
    if (deps.pausedDownloads.delete(id)) {
      cleanTempForJob(id, pausedOpts);
      deps.send('download-canceled', { id });
      return true;
    }
    return false;
  });

  ipcMain.handle('pause-download', async (_e, id: string) => {
    const idx = deps.pendingQueue.findIndex(q => q.id === id);
    if (idx !== -1) {
      const [job] = deps.pendingQueue.splice(idx, 1);
      deps.pausedDownloads.set(id, job.opts);
      deps.send('download-paused', { id });
      return true;
    }
    const p = deps.activeDownloads.get(id);
    if (p) {
      const opts = deps.activeOpts.get(id);
      if (opts) deps.pausedDownloads.set(id, opts);
      deps.pausingIds.add(id);
      try {
        deps.cancelScheduledRetry?.(id);
      } catch {}
      if (typeof p.pause === 'function') p.pause();
      else if (typeof p.kill === 'function') p.kill();
      deps.activeDownloads.delete(id);
      deps.activeOpts.delete(id);
      deps.updatePowerSaveBlocker();
      deps.send('download-paused', { id });
      deps.processPending();
      return true;
    }
    return false;
  });

  ipcMain.handle('retry-download', async (_e, opts: any) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (!deps.canStart()) {
      deps.pendingQueue.push({ id, opts });
      deps.send('download-queued', { id, opts });
      return { id, queued: true };
    }
    if (opts.isHttp) {
      deps.send('download-started', {
        id,
        opts: { ...opts, title: opts.filename },
        outDir: opts.outDir,
      });
      deps.runMultiPart(id, opts, opts.outDir, opts.outPath, opts.filename);
      return { id, outPath: opts.outPath };
    }
    void Promise.resolve(deps.doStartDownload(id, opts)).catch(() => {});
    return { id, outDir: deps.getSiteFolder(opts.outDir || deps.getDefaultDir(), opts.url) };
  });

  ipcMain.handle('resume-download', async (_e, payload: any) => {
    const id = typeof payload === 'string' ? payload : payload?.id;
    const opts = deps.pausedDownloads.get(id) || payload?.opts;
    if (!id || !opts) return { error: 'no paused download found for id' };
    deps.pausedDownloads.delete(id);
    if (opts.isHttp) {
      if (!deps.canStart()) {
        deps.pendingQueue.push({ id, opts });
        deps.send('download-queued', { id, opts });
        return { id, queued: true };
      }
      deps.send('download-started', {
        id,
        opts: { ...opts, title: opts.filename },
        outDir: opts.outDir,
      });
      deps.runMultiPart(id, opts, opts.outDir, opts.outPath, opts.filename);
      return { id, outPath: opts.outPath };
    }
    if (!deps.canStart()) {
      deps.pendingQueue.push({ id, opts });
      deps.send('download-queued', { id, opts });
      return { id, queued: true };
    }
    void Promise.resolve(deps.doStartDownload(id, opts)).catch(() => {});
    return { id, outDir: deps.getSiteFolder(opts.outDir || deps.getDefaultDir(), opts.url) };
  });

  ipcMain.handle('pause-all-downloads', async () => {
    let count = 0;
    for (const [id, proc] of deps.activeDownloads.entries()) {
      const opts = deps.activeOpts.get(id);
      if (opts) deps.pausedDownloads.set(id, opts);
      deps.pausingIds.add(id);
      if (typeof proc.pause === 'function') proc.pause();
      else if (typeof proc.kill === 'function') proc.kill();
      deps.activeDownloads.delete(id);
      deps.activeOpts.delete(id);
      deps.send('download-paused', { id });
      count++;
    }
    deps.updatePowerSaveBlocker();
    deps.processPending();
    return count;
  });

  ipcMain.handle('resume-all-downloads', async () => {
    const ids = [...deps.pausedDownloads.keys()];
    let started = 0;
    for (const id of ids) {
      if (!deps.canStart()) break;
      const opts = deps.pausedDownloads.get(id);
      if (!opts) continue;
      deps.pausedDownloads.delete(id);
      if (opts.isHttp) {
        deps.send('download-started', {
          id,
          opts: { ...opts, title: opts.filename },
          outDir: opts.outDir,
        });
        deps.runMultiPart(id, opts, opts.outDir, opts.outPath, opts.filename);
      } else {
        void Promise.resolve(deps.doStartDownload(id, opts)).catch(() => {});
      }
      started++;
    }
    return started;
  });

  ipcMain.handle('export-queue', async (_e, jobs: any[]) => {
    const r = await dialog.showSaveDialog({
      title: 'Kuyruğu Dışa Aktar',
      defaultPath: `voltget-queue-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    const clean = (Array.isArray(jobs) ? jobs : []).map((j: any) => ({
      url: j?.url || j?.opts?.url || '',
      title: j?.title || '',
      status: j?.status || 'paused',
      opts: j?.opts || null,
      filePath: j?.filePath || '',
      fileName: j?.fileName || '',
    }));
    fs.writeFileSync(
      r.filePath,
      JSON.stringify({ app: 'VoltGet', version: 1, jobs: clean }, null, 2)
    );
    return { canceled: false, filePath: r.filePath, count: clean.length };
  });

  ipcMain.handle('import-queue', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Kuyruğu İçe Aktar',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true, jobs: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf-8'));
      const arr = Array.isArray(raw) ? raw : raw.jobs || [];
      const jobs = arr
        .filter((j: any) => j && (j.opts || j.url))
        .map((j: any) => ({
          url: j.url || j.opts?.url || '',
          title: (j.title || j.opts?.title || j.url || 'İndirme').slice(0, 70),
          opts: j.opts || { url: j.url },
        }));
      return { canceled: false, jobs };
    } catch (e: any) {
      throw new Error('Kuyruk dosyası okunamadı: ' + String(e?.message || e));
    }
  });
}
