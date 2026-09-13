import { app, Tray, Menu } from 'electron';
import fs from 'fs';
import path from 'path';
import { getTrayMenuLabels } from '../windows.js';

export function createTrayController(deps: {
  getTray: () => Tray | null;
  setTray: (t: Tray) => void;
  getMainWindow: () => any;
  getAppIconPath: () => string | undefined;
  getConfig: () => any;
  saveConfig: (c: any) => void;
  getIsQuitting: () => boolean;
  setIsQuitting: (v: boolean) => void;
}) {
  return function createTray() {
    if (deps.getTray()) return;
    const isWin = process.platform === 'win32';
    const trayIconPath = isWin
      ? deps.getAppIconPath() || path.join(process.cwd(), 'assets', 'icon-16.png')
      : path.join(process.cwd(), 'assets', 'icon-16.png');

    if (!trayIconPath || !fs.existsSync(trayIconPath)) return;

    try {
      const tray = new Tray(trayIconPath);
      tray.setToolTip('VoltGet - Ultra Hızlı İndirme Yöneticisi');

      const updateTrayMenu = () => {
        const contextMenu = Menu.buildFromTemplate([
          {
            label: "⚡ VoltGet'i Göster",
            click: () => {
              const w = deps.getMainWindow();
              if (w) {
                if (w.isMinimized()) w.restore();
                w.show();
                w.focus();
              }
            },
          },
          {
            label: '📥 İndirmeler Sekmesi',
            click: () => {
              const w = deps.getMainWindow();
              if (w) {
                if (w.isMinimized()) w.restore();
                w.show();
                w.focus();
                w.webContents.send('switch-to-download-tab');
              }
            },
          },
          { type: 'separator' },
          {
            label: getTrayMenuLabels({ clipboardWatcher: deps.getConfig().clipboardWatcher })
              .clipboardLabel,
            type: 'checkbox',
            checked: !!deps.getConfig().clipboardWatcher,
            click: menuItem => {
              const cfg = deps.getConfig();
              cfg.clipboardWatcher = menuItem.checked;
              deps.saveConfig(cfg);
              const w = deps.getMainWindow();
              if (w && !w.isDestroyed()) {
                w.webContents.send('config-changed', cfg);
              }
              updateTrayMenu();
            },
          },
          {
            label: '⚙️ Ayarlar',
            click: () => {
              const w = deps.getMainWindow();
              if (w) {
                if (w.isMinimized()) w.restore();
                w.show();
                w.focus();
                w.webContents.send('switch-to-settings-tab');
              }
            },
          },
          { type: 'separator' },
          {
            label: "🚪 VoltGet'ten Çıkış",
            click: () => {
              deps.setIsQuitting(true);
              app.quit();
            },
          },
        ]);
        tray.setContextMenu(contextMenu);
      };

      updateTrayMenu();

      tray.on('double-click', () => {
        const w = deps.getMainWindow();
        if (w) {
          if (w.isVisible()) {
            if (w.isMinimized()) w.restore();
            w.focus();
          } else {
            w.show();
            w.focus();
          }
        }
      });

      tray.on('click', () => {
        const w = deps.getMainWindow();
        if (w) {
          if (w.isVisible() && !w.isMinimized()) {
            w.hide();
          } else {
            if (w.isMinimized()) w.restore();
            w.show();
            w.focus();
          }
        }
      });
      deps.setTray(tray);
    } catch (err) {
      console.error('[VoltGet] Failed to initialize system tray:', err);
    }
  };
}
