import type { BrowserWindowConstructorOptions } from 'electron';

export function buildMainWindowOptions(
  preloadPath: string,
  appIcon: string | undefined
): BrowserWindowConstructorOptions {
  return {
    width: 1220,
    height: 760,
    icon: appIcon,
    title: 'VoltGet',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  };
}

export function buildDialogWindowOptions(
  preloadPath: string,
  appIcon: string | undefined
): BrowserWindowConstructorOptions {
  return {
    width: 550,
    height: 600,
    frame: false,
    backgroundColor: '#090d16',
    alwaysOnTop: true,
    resizable: false,
    icon: appIcon,
    title: 'VoltGet - İndirme Başlat',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
  };
}

export interface TrayMenuState {
  clipboardWatcher: boolean;
}

export function getTrayMenuLabels(state: TrayMenuState): { clipboardLabel: string } {
  return {
    clipboardLabel: state.clipboardWatcher ? '📋 Pano İzleyici: Açık' : '📋 Pano İzleyici: Kapalı',
  };
}
