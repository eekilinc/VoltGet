import { BrowserWindow, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { buildMainWindowOptions, buildDialogWindowOptions } from '../windows.js';
import { isStartHidden } from '../lifecycle.js';

export function createMainWindowFactory(deps: {
  getMainWindow: () => any;
  setMainWindow: (w: any) => void;
  getAppIconPath: () => string | undefined;
  getConfig: () => any;
  getIsQuitting: () => boolean;
  broadcastExtensionStatus: () => void;
  isDev: boolean;
  dirname: string;
}) {
  return function createWindow() {
    let preloadPath = path.join(deps.dirname, 'preload.cjs');
    if (!fs.existsSync(preloadPath)) preloadPath = path.join(deps.dirname, 'preload.js');
    const appIcon = deps.getAppIconPath();
    const shouldStartHidden = isStartHidden(process.argv, deps.getConfig().startMinimized);

    const w = new BrowserWindow({
      ...buildMainWindowOptions(preloadPath, appIcon),
      minWidth: 1020,
      minHeight: 620,
      backgroundColor: '#0a0a0f',
      title: 'VoltGet - Ultra Hızlı İndirme Yöneticisi',
      show: !shouldStartHidden,
      autoHideMenuBar: true,
    });
    deps.setMainWindow(w);
    if (deps.isDev) {
      w.loadURL('http://localhost:5173').catch(() =>
        w.loadFile(path.join(deps.dirname, '../renderer/index.html'))
      );
      w.webContents.openDevTools({ mode: 'detach' });
    } else {
      w.loadFile(path.join(deps.dirname, '../renderer/index.html'));
    }
    w.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });
    w.webContents.on('did-finish-load', () => {
      deps.broadcastExtensionStatus();
    });
    w.on('close', e => {
      if (!deps.getIsQuitting() && deps.getConfig().closeToTray) {
        e.preventDefault();
        w.hide();
        return false;
      }
    });
    w.on('minimize', () => {
      if (deps.getConfig().minimizeToTray) {
        w.hide();
      }
    });
  };
}

export function createDialogWindowFactory(deps: {
  getDialogWindow: () => any;
  setDialogWindow: (w: any) => void;
  getLastData: () => any;
  setLastData: (d: any) => void;
  getAppIconPath: () => string | undefined;
  normalizeToMasterPlaylist: (u: string) => string;
  isDev: boolean;
  dirname: string;
}) {
  return function createDownloadDialogWindow(sniffData: any) {
    if (sniffData && sniffData.url) {
      sniffData.url = deps.normalizeToMasterPlaylist(sniffData.url);
    }
    deps.setLastData(sniffData);
    console.log('[VoltGet] createDownloadDialogWindow called for:', sniffData?.url?.slice(0, 70));

    let win = deps.getDialogWindow();
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.webContents.send('show-download-dialog', sniffData);
      return;
    }

    let preloadPath = path.join(deps.dirname, 'preload.cjs');
    if (!fs.existsSync(preloadPath)) preloadPath = path.join(deps.dirname, 'preload.js');

    const appIcon = deps.getAppIconPath();
    win = new BrowserWindow(buildDialogWindowOptions(preloadPath, appIcon));
    deps.setDialogWindow(win);
    win.center();

    if (deps.isDev) {
      win.loadURL('http://localhost:5173/download-dialog.html');
    } else {
      win.loadFile(path.join(deps.dirname, '../renderer/download-dialog.html'));
    }

    const showWindow = () => {
      const w = deps.getDialogWindow();
      if (w && !w.isDestroyed()) {
        if (w.isMinimized()) w.restore();
        w.show();
        w.focus();
        w.webContents.send('show-download-dialog', deps.getLastData() || sniffData);
      }
    };

    win.once('ready-to-show', showWindow);
    win.webContents.on('did-finish-load', showWindow);
    setTimeout(showWindow, 400);
    win.on('closed', () => {
      deps.setDialogWindow(null);
    });
  };
}
