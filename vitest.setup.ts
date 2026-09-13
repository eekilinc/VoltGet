// vitest.setup.ts
import { vi } from 'vitest';

// Mock Electron APIs for unit tests
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/mock/path'),
    getAppPath: vi.fn(() => '/mock/app'),
    setLoginItemSettings: vi.fn(),
    quit: vi.fn(),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  BrowserWindow: vi.fn(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    webContents: {
      send: vi.fn(),
      on: vi.fn(),
      openDevTools: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    },
    on: vi.fn(),
    center: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    minimize: vi.fn(),
    restore: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
  })),
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
  Notification: vi.fn(() => ({ show: vi.fn() })),
  Tray: vi.fn(() => ({ setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() })),
  Menu: { buildFromTemplate: vi.fn() },
  clipboard: { readText: vi.fn(() => '') },
  powerSaveBlocker: { start: vi.fn(), stop: vi.fn(), isStarted: vi.fn() },
}));

vi.mock('ws', () => ({
  WebSocketServer: vi.fn(() => ({
    clients: new Set(),
    on: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
  })),
  execSync: vi.fn(() => 'mock-output'),
}));

// Global test timeout
vi.setConfig({ testTimeout: 10000 });
