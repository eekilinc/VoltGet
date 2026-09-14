import { app } from 'electron';
import updaterPkg from 'electron-updater';
import log from './log/logger.js';

const { autoUpdater } = updaterPkg as typeof import('electron-updater');

export interface UpdaterEvents {
  onAvailable?: (info: unknown) => void;
  onDownloaded?: (info: unknown) => void;
  onNotAvailable?: (info: unknown) => void;
  onError?: (message: string) => void;
}

let wired = false;

export function setupAutoUpdater(events: UpdaterEvents): void {
  if (wired) return;
  wired = true;
  try {
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-available', (info: unknown) => {
      log.info('[VoltGet] update available', { version: (info as any)?.version });
      try {
        events.onAvailable?.(info);
      } catch {}
    });
    autoUpdater.on('update-downloaded', (info: unknown) => {
      log.info('[VoltGet] update downloaded', { version: (info as any)?.version });
      try {
        events.onDownloaded?.(info);
      } catch {}
    });
    autoUpdater.on('update-not-available', (info: unknown) => {
      try {
        events.onNotAvailable?.(info);
      } catch {}
    });
    autoUpdater.on('error', (err: Error) => {
      log.warn('[VoltGet] update check failed', { message: String((err as any)?.message || err) });
      try {
        events.onError?.(String((err as any)?.message || err));
      } catch {}
    });
  } catch {}
}

export async function checkForUpdates(manual: boolean): Promise<{ status: string; version?: string }> {
  if (!app.isPackaged) {
    return { status: 'dev' };
  }
  try {
    const res = await autoUpdater.checkForUpdates();
    const version = (res as any)?.updateInfo?.version;
    if (!manual) return { status: 'checked', version };
    return { status: version ? 'available' : 'unknown', version };
  } catch (e: any) {
    return { status: 'error', version: String(e?.message || e) };
  }
}

export function quitAndInstallUpdate(): void {
  try {
    autoUpdater.quitAndInstall(false, true);
  } catch {}
}
