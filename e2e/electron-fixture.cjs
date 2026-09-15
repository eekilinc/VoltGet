const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
app.disableHardwareAcceleration();

// Isolated, hidden UI fixture: no downloads, login settings, updater or user profile writes.
app.setPath('userData', process.env.VOLTGET_TEST_PROFILE);
app.whenReady().then(async () => {
  const { defaultConfig } = await import('../dist/electron/config/schema.js');
  const { protectSecrets, revealSecrets } = await import('../dist/electron/security/secrets.js');
  globalThis.testSecretStorage = async () => {
    const fs = require('node:fs/promises');
    const saved = protectSecrets({ password: 'integration-secret', cookie: 'session=abc' });
    const file = path.join(process.env.VOLTGET_TEST_PROFILE, 'secrets.json');
    await fs.writeFile(file, JSON.stringify(saved));
    const serialized = await fs.readFile(file, 'utf8');
    return { serialized, restored: revealSecrets(JSON.parse(serialized)) };
  };
  let config = { ...defaultConfig, clipboardWatcher: false, completionDialog: false };
  let jobs = Array.from({ length: 120 }, (_, i) => ({
    id: String(i),
    url: 'https://example.com/file',
    title: `Saved job ${i}`,
    percent: 0,
    speed: '-',
    eta: '-',
    total: '',
    status: 'paused',
    log: '',
    opts: { url: 'https://example.com/file' },
  }));
  const handlers = {
    'get-config': () => config,
    'set-config': (_event, patch) => (config = { ...config, ...patch }),
    'get-queue': () => jobs,
    'save-queue': (_event, value) => {
      jobs = value;
    },
    'get-app-version': () => '1.1.0',
    'get-default-dir': () => process.env.VOLTGET_TEST_PROFILE,
    'get-yt-dlp-status': () => ({ binExists: true, ffmpegOk: true, config }),
    'get-extension-status': () => ({ connected: false, count: 0 }),
    'list-files': () => [],
    'get-disk-space': () => ({ free: '10 GB', total: '20 GB', freeBytes: 1e10, totalBytes: 2e10 }),
    'get-download-dialog-data': () => null,
  };
  for (const [channel, handler] of Object.entries(handlers)) ipcMain.handle(channel, handler);
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.resolve(__dirname, '../dist/electron/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadFile(path.resolve(__dirname, '../dist/renderer/index.html'));
});
app.on('window-all-closed', () => app.quit());
