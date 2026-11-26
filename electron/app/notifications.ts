import { Notification, type BrowserWindow } from 'electron';

export interface NotificationHelperDeps {
  getMainWindow: () => BrowserWindow | null;
  getAppIconPath?: () => string | undefined;
  createWindow?: () => void;
}

export interface ShowNotificationOptions {
  jobId?: string;
  switchToDownloads?: boolean;
  onClick?: () => void;
}

export function createNotificationHelper(deps: NotificationHelperDeps) {
  // Keep references to active Notification instances so V8 GC does not collect
  // them before the user clicks on Windows/Electron.
  const activeNotifications = new Set<Notification>();

  function focusMainWindow(opts?: { switchToDownloads?: boolean; jobId?: string }): void {
    let win = deps.getMainWindow();
    if ((!win || win.isDestroyed()) && deps.createWindow) {
      try {
        deps.createWindow();
        win = deps.getMainWindow();
      } catch {}
    }
    if (!win || win.isDestroyed()) return;

    try {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      if (typeof (win as any).moveTop === 'function') {
        (win as any).moveTop();
      }
      if (process.platform === 'win32') {
        const wasOnTop = win.isAlwaysOnTop();
        if (!wasOnTop) {
          win.setAlwaysOnTop(true);
          win.setAlwaysOnTop(false);
        }
      }
      win.focus();

      if (opts?.switchToDownloads !== false && !win.webContents.isDestroyed()) {
        win.webContents.send(
          'switch-to-download-tab',
          opts?.jobId ? { jobId: opts.jobId } : undefined
        );
      }
    } catch {}
  }

  function showNotification(
    title: string,
    body: string,
    opts?: ShowNotificationOptions
  ): Notification | null {
    try {
      if (typeof Notification.isSupported === 'function' && !Notification.isSupported()) {
        return null;
      }
      const icon = deps.getAppIconPath?.();
      const notification = new Notification({
        title,
        body,
        ...(icon ? { icon } : {}),
      });
      activeNotifications.add(notification);
      const cleanup = () => {
        activeNotifications.delete(notification);
      };
      notification.on('click', () => {
        try {
          focusMainWindow({
            switchToDownloads: opts?.switchToDownloads !== false,
            jobId: opts?.jobId,
          });
          opts?.onClick?.();
        } finally {
          cleanup();
        }
      });
      notification.on('close', cleanup);
      notification.on('failed', cleanup);
      notification.show();
      return notification;
    } catch {
      return null;
    }
  }

  return {
    focusMainWindow,
    showNotification,
    getActiveCount: () => activeNotifications.size,
  };
}
