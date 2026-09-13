import { ipcMain, app, dialog, shell, clipboard } from 'electron';
import path from 'path';
import fs from 'fs';

export function registerMiscIpc(deps: {
  loadConfig: () => any;
  saveConfig: (c: any) => void;
  getConfigRef: () => any;
  setConfigRef: (c: any) => void;
  ensureDir: (d: string) => void;
  getDefaultDir: () => string;
  getAppIconPath: () => string | undefined;
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
  normalizeToMasterPlaylist: (u: string) => string;
  updatePowerSaveBlocker: () => void;
  loadQueue: () => any[];
  saveQueue: (jobs: any[]) => void;
  getMainWindow: () => any;
}) {
  ipcMain.handle('get-config', async () => deps.loadConfig());
  ipcMain.handle('set-config', async (_e, patch: any) => {
    const cur = deps.loadConfig();
    const next = { ...cur, ...patch };
    deps.setConfigRef(next);
    deps.saveConfig(next);
    if (patch.openAtLogin !== undefined || patch.startMinimized !== undefined) {
      try {
        app.setLoginItemSettings({
          openAtLogin: !!next.openAtLogin,
          openAsHidden: !!next.startMinimized,
          path: process.execPath,
          args: next.startMinimized ? ['--hidden'] : [],
        });
      } catch {}
    }
    return next;
  });
  ipcMain.handle('open-external', async (_e, url: string) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('select-folder', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (r.canceled) return null;
    return r.filePaths[0];
  });
  ipcMain.handle('open-folder', async (_e, dir: string) => {
    shell.openPath(dir || deps.getDefaultDir());
  });
  ipcMain.handle('get-default-dir', async () => deps.getDefaultDir());

  ipcMain.handle('set-speed-limit', async (_e, limitKB: number) => {
    const cfg = deps.getConfigRef();
    cfg.speedLimitKB = limitKB;
    deps.saveConfig(cfg);
    return { success: true, speedLimitKB: limitKB };
  });
  ipcMain.handle(
    'set-post-download-action',
    async (_e, action: 'none' | 'shutdown' | 'sleep' | 'quit') => {
      const cfg = deps.getConfigRef();
      cfg.postDownloadAction = action;
      deps.saveConfig(cfg);
      return { success: true, action };
    }
  );

  ipcMain.handle('sniffed-url', async (_e, data: any) => {
    const w = deps.getMainWindow();
    if (w) w.webContents.send('sniffed-url', data);
    return true;
  });
  ipcMain.handle('direct-download', async (_e, opts: any) => {
    if (!opts?.url) throw new Error('URL eksik');
    opts.url = deps.normalizeToMasterPlaylist(opts.url);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (!deps.canStart()) {
      deps.pendingQueue.push({ id, opts });
      const w = deps.getMainWindow();
      if (w && !w.isDestroyed()) {
        w.webContents.send('download-queued', { id, opts, position: deps.pendingQueue.length });
        w.webContents.send('switch-to-download-tab');
      }
      return { id, queued: true, position: deps.pendingQueue.length };
    }
    deps.doStartDownload(id, opts);
    const w = deps.getMainWindow();
    if (w && !w.isDestroyed()) w.webContents.send('switch-to-download-tab');
    return { id, outDir: deps.getSiteFolder(opts.outDir || deps.getDefaultDir(), opts.url) };
  });
  ipcMain.handle('get-queue', async () => deps.loadQueue());
  ipcMain.handle('save-queue', async (_e, jobs: any[]) => deps.saveQueue(jobs));
  ipcMain.handle('http-download', async (_e, opts: any) => {
    const outDir = deps.getSiteFolder(opts.outDir || deps.getDefaultDir(), opts.url);
    deps.ensureDir(outDir);
    const filename =
      opts.filename || opts.url.split('/').pop()?.split('?')[0] || `file_${Date.now()}`;
    const outPath = path.join(outDir, filename);
    const id = Date.now().toString(36);
    const enrichedOpts = { ...opts, isHttp: true, outDir, outPath, filename, title: filename };
    if (!deps.canStart()) {
      deps.pendingQueue.push({ id, opts: enrichedOpts });
      const w = deps.getMainWindow();
      if (w) {
        w.webContents.send('download-queued', { id, opts: enrichedOpts });
        w.webContents.send('switch-to-download-tab');
      }
      return { id, queued: true };
    }
    const w = deps.getMainWindow();
    if (w) {
      w.webContents.send('download-started', { id, opts: enrichedOpts, outDir });
      w.webContents.send('switch-to-download-tab');
    }
    deps.runMultiPart(id, enrichedOpts, outDir, outPath, filename);
    return { id, outPath };
  });

  ipcMain.handle('queue-download', async (_e, opts: any) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    deps.pendingQueue.push({ id, opts });
    const w = deps.getMainWindow();
    if (w && !w.isDestroyed()) {
      w.webContents.send('download-queued', { id, opts, position: deps.pendingQueue.length });
      w.webContents.send('switch-to-download-tab');
    }
    return { id, queued: true, position: deps.pendingQueue.length };
  });
  ipcMain.handle('read-clipboard', async () => {
    try {
      return clipboard.readText().trim();
    } catch {
      return '';
    }
  });
}
