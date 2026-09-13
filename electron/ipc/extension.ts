import { ipcMain, shell } from 'electron';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export function registerExtensionIpc(deps: {
  getExtensionDir: (browser?: string) => string;
  ensureDir: (d: string) => void;
  getDefaultDir: () => string;
  getExtensionConnectedCount: () => number;
}) {
  ipcMain.handle('open-extension-folder', async (_e, browser?: string) => {
    const extDir = deps.getExtensionDir(browser);
    if (fs.existsSync(extDir)) {
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
      const psCmd = `Compress-Archive -Path "${extDir}\\*" -DestinationPath "${zipPath}" -Force`;
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
