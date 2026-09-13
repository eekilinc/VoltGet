import { ipcMain } from 'electron';

export interface QueueIpcDeps {
  activeDownloads: Map<string, any>;
  activeOpts: Map<string, any>;
  pendingQueue: Array<{ id: string; opts: any }>;
  pausedDownloads: Map<string, any>;
  pausingIds: Set<string>;
  canStart: () => boolean;
  processPending: () => void;
  doStartDownload: (id: string, opts: any) => void;
  runMultiPart: (id: string, opts: any, outDir: string, outPath: string, filename: string) => void;
  getSiteFolder: (base: string, url: string, filename?: string) => string;
  getDefaultDir: () => string;
  updatePowerSaveBlocker: () => void;
  send: (channel: string, data: any) => void;
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
    deps.doStartDownload(id, opts);
    deps.send('switch-to-download-tab', {});
    return { id, outDir: deps.getSiteFolder(opts.outDir || deps.getDefaultDir(), opts.url) };
  });

  ipcMain.handle('cancel-download', async (_e, id: string) => {
    const idx = deps.pendingQueue.findIndex(q => q.id === id);
    if (idx !== -1) {
      deps.pendingQueue.splice(idx, 1);
      deps.send('download-canceled', { id });
      return true;
    }
    const p = deps.activeDownloads.get(id);
    if (p) {
      p.kill();
      deps.activeDownloads.delete(id);
      deps.activeOpts.delete(id);
      deps.pausedDownloads.delete(id);
      deps.updatePowerSaveBlocker();
      deps.send('download-canceled', { id });
      deps.processPending();
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
    deps.doStartDownload(id, opts);
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
    deps.doStartDownload(id, opts);
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
        deps.doStartDownload(id, opts);
      }
      started++;
    }
    return started;
  });
}
