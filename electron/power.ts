import { app, Notification, powerSaveBlocker } from 'electron';
import { execSync } from 'child_process';

export type PostDownloadAction = 'none' | 'shutdown' | 'sleep' | 'quit';

let powerSaveBlockerId: number | null = null;
let postDownloadTriggered = false;

export function isPowerSaveActive(): boolean {
  return powerSaveBlockerId !== null;
}

export function updatePowerSaveBlocker(activeCount: number, onBecameIdle?: () => void): void {
  const isDownloading = activeCount > 0;
  if (isDownloading) {
    postDownloadTriggered = false;
    if (powerSaveBlockerId === null || !powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
      console.log('[VoltGet PowerSave] Sleep prevented while downloading, id:', powerSaveBlockerId);
    }
  } else if (powerSaveBlockerId !== null) {
    if (powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
      console.log('[VoltGet PowerSave] Power save blocker released');
    }
    powerSaveBlockerId = null;
    onBecameIdle?.();
  }
}

export function resetPostDownloadTrigger(): void {
  postDownloadTriggered = false;
}

export function checkPostDownloadAction(
  activeCount: number,
  pendingCount: number,
  action: PostDownloadAction
): void {
  if (activeCount === 0 && pendingCount === 0) {
    if (action === 'none' || postDownloadTriggered) return;
    postDownloadTriggered = true;
    if (action === 'quit') {
      console.log('[VoltGet] Post-download action: Quitting app...');
      setTimeout(() => app.quit(), 1500);
    } else if (action === 'shutdown' && process.platform === 'win32') {
      console.log('[VoltGet] Post-download action: Shutting down PC in 60s...');
      try {
        new Notification({
          title: 'VoltGet: Otomatik Kapanma',
          body: 'Tüm indirmeler bitti. Bilgisayar 60 saniye içinde kapatılacak.',
        }).show();
        execSync('shutdown /s /t 60');
      } catch (err) {
        console.error('[VoltGet] Shutdown error:', err);
      }
    } else if (action === 'sleep' && process.platform === 'win32') {
      console.log('[VoltGet] Post-download action: Putting PC to sleep...');
      try {
        new Notification({
          title: 'VoltGet: Uyku Modu',
          body: 'Tüm indirmeler bitti. Sistem uyku moduna alınıyor.',
        }).show();
        setTimeout(() => {
          try {
            execSync('rundll32.exe powrprof.dll,SetSuspendState');
          } catch {}
        }, 3000);
      } catch (err) {
        console.error('[VoltGet] Sleep error:', err);
      }
    }
  } else {
    postDownloadTriggered = false;
  }
}
