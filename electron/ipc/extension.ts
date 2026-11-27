import { spawn } from 'child_process';
import { app, clipboard, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  detectInstalledBrowsers,
  getNativeHostStatus,
  launchBrowserExtensionsPage,
  registerNativeMessagingHost,
} from '../app/extensionInstaller.js';
import { getExtensionToken } from '../security/extensionAuth.js';

export function registerExtensionIpc(deps: {
  getExtensionDir: (browser?: string) => string;
  ensureDir: (d: string) => void;
  getDefaultDir: () => string;
  getExtensionConnectedCount: () => number;
  getNmHostJsPath?: () => string;
}) {
  ipcMain.handle('copy-extension-token', () => {
    clipboard.writeText(getExtensionToken());
    return true;
  });

  ipcMain.handle('get-extension-path', (_e, browser?: string) => {
    const extDir = deps.getExtensionDir(browser);
    return { path: extDir, exists: fs.existsSync(extDir) };
  });

  ipcMain.handle('detect-installed-browsers', () => {
    return detectInstalledBrowsers();
  });

  ipcMain.handle('launch-browser-extensions', async (_e, browserId?: string) => {
    const browsers = detectInstalledBrowsers();
    const target = browsers.find(b => b.id === browserId) || browsers[0];
    if (!target) {
      return { success: false, error: 'Kurulu desteklenen tarayıcı bulunamadı.' };
    }
    const extDir = deps.getExtensionDir(target.engine === 'firefox' ? 'firefox' : 'chrome');
    if (fs.existsSync(extDir)) {
      clipboard.writeText(extDir);
    }
    const launched = launchBrowserExtensionsPage(target);
    return {
      success: launched.success,
      error: launched.error,
      browser: target,
      extDir,
    };
  });

  ipcMain.handle('register-native-host', (_e, payload?: { chromiumExtensionIds?: string[] }) => {
    const nmHostJsPath =
      deps.getNmHostJsPath?.() ||
      path.join(path.dirname(app.getAppPath()), 'dist', 'electron', 'nm_host.js');
    return registerNativeMessagingHost({
      userDataDir: app.getPath('userData'),
      appExePath: process.execPath,
      nmHostJsPath,
      token: getExtensionToken(),
      chromiumExtensionIds: payload?.chromiumExtensionIds,
    });
  });

  ipcMain.handle('get-native-host-status', () => {
    return getNativeHostStatus(app.getPath('userData'));
  });

  ipcMain.handle('open-extension-folder', async (_e, browser?: string) => {
    const extDir = deps.getExtensionDir(browser);
    if (fs.existsSync(extDir)) {
      clipboard.writeText(extDir);
      await shell.openPath(extDir);
      return { success: true, path: extDir, browser: browser || 'chrome' };
    }
    return { success: false, error: 'Eklenti klasörü bulunamadı: ' + extDir };
  });

  ipcMain.handle('export-extension-zip', async (_e, browser?: string) => {
    const isFirefox = (browser || '').toLowerCase().includes('firefox');
    const extDir = deps.getExtensionDir(browser);
    if (!fs.existsSync(extDir)) {
      throw new Error('Eklenti klasörü bulunamadı: ' + extDir);
    }
    const outDir = deps.getDefaultDir();
    deps.ensureDir(outDir);
    const zipFileName = isFirefox ? 'voltget-firefox-eklenti.zip' : 'voltget-chrome-eklenti.zip';
    const zipPath = path.join(outDir, zipFileName);

    return new Promise((resolve, reject) => {
      const psQuote = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const psCmd = `Compress-Archive -Path ${psQuote(extDir + '\\*')} -DestinationPath ${psQuote(zipPath)} -Force`;
      const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd]);
      proc.on('close', code => {
        if (code === 0 && fs.existsSync(zipPath)) {
          shell.showItemInFolder(zipPath);
          resolve({ success: true, zipPath, fileName: zipFileName });
        } else {
          reject(new Error(`ZIP paketi oluşturulamadı (çıkış kodu: ${code})`));
        }
      });
      proc.on('error', err => reject(err));
    });
  });

  ipcMain.handle('get-extension-status', async () => {
    const count = deps.getExtensionConnectedCount();
    return { connected: count > 0, count };
  });
}
