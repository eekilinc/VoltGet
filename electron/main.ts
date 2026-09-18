import { ChildProcess, execSync, spawn } from 'child_process';
import { app, BrowserWindow, ipcMain, Notification, Tray } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseInfo as parseInfoMod,
  resolveAnalyzeUrl,
  tryDirectFileEarlyReturn,
  tryHlsEarlyReturn,
} from './analyze.js';
import { createTrayController } from './app/tray.js';
import { createDialogWindowFactory, createMainWindowFactory } from './app/windows.js';
import { categorizeFile } from './categories.js';
import type { AppConfig } from './config/schema.js';
import {
  AppConfigSchema,
  mergeWithDefaults,
  defaultConfig as zodDefaultConfig,
} from './config/schema.js';
import { createConflictManager } from './conflicts.js';
import {
  HttpDownloadController,
  runMultiPartHttpDownload as runMultiPartHttpDownloadMod,
} from './downloader/http.js';
import { createDownloadOrchestrator } from './downloader/orchestrator.js';
import { cancelScheduledRetry, getRetryPolicyFrom } from './downloader/retry.js';
import { registerAnalyzeIpc } from './ipc/analyze.js';
import { registerDialogIpc } from './ipc/dialog.js';
import { registerExtensionIpc } from './ipc/extension.js';
import { registerFileIpc } from './ipc/files.js';
import { registerMiscIpc } from './ipc/misc.js';
import { registerQueueIpc } from './ipc/queue.js';
import { registerToolsIpc } from './ipc/tools.js';
import { createClipboardWatcher } from './lifecycle.js';
import log from './log/logger.js';
import {
  checkPostDownloadAction as checkPostActionUtil,
  updatePowerSaveBlocker as updatePowerUtil,
} from './power.js';
import { applyProxyEnv, applySessionProxy, getProxyAgent } from './proxy.js';
import { createScheduler } from './scheduler.js';
import { getExtensionToken } from './security/extensionAuth.js';
import { redactSecrets } from './security/secrets.js';
import { createSniffHandler } from './server/sniffHandler.js';
import { createSniffServer } from './server/sniffServer.js';
import { SniffDeduper } from './sniff.js';
import {
  addDownloadToHistory as addHistoryUtil,
  flushQueue,
  loadConfig as loadConfigUtil,
  loadHistory as loadHistoryUtil,
  loadQueue as loadQueueUtil,
  recoverInterruptedQueue,
  removeDownloadFromHistory as removeHistoryUtil,
  saveConfig as saveConfigUtil,
  saveQueue as saveQueueUtil,
  syncHistoryFromQueue as syncHistoryUtil,
} from './store.js';
import { checkForUpdates, quitAndInstallUpdate, setupAutoUpdater } from './updater.js';
import {
  ensureBinDirOnPath,
  isValidExecutable as isValidExeUtil,
  parseYtDlpJson as parseYtDlpJsonUtil,
  resolveFfmpegPath as resolveFfmpegUtil,
  resolveYtDlpPath as resolveYtDlpUtil,
} from './utils/binaries.js';
import {
  ensureDir as ensureDirUtil,
  isTemporaryOrPartialFile as isTempUtil,
  scanDownloadedFiles as scanFilesUtil,
} from './utils/files.js';
import {
  isPlayerOrEmbedUrl as isEmbedUtil,
  isStreamUrl as isStreamUtil,
  normalizeToMasterPlaylist as normalizePlaylistUtil,
} from './utils/playlist.js';
import {
  getDefaultDownloadDir as getDefaultDirUtil,
  getAppIconPath as getIconUtil,
  getSiteFolder as getSiteFolderUtil,
} from './utils/sites.js';
import { maybeVirusScan } from './virusscan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged && process.env.ELECTRON_IS_DEV !== '0';
let mainWindow: BrowserWindow | null = null;
let downloadDialogWindow: BrowserWindow | null = null;
let lastDownloadDialogData: any = null;

function getAppIconPath(): string | undefined {
  return getIconUtil({ cwd: process.cwd(), dirname: __dirname });
}

function normalizeToMasterPlaylist(url: string): string {
  return normalizePlaylistUtil(url);
}

const createDownloadDialogWindow = createDialogWindowFactory({
  getDialogWindow: () => downloadDialogWindow,
  setDialogWindow: (w: any) => {
    downloadDialogWindow = w;
  },
  getLastData: () => lastDownloadDialogData,
  setLastData: (d: any) => {
    lastDownloadDialogData = d;
  },
  getAppIconPath,
  normalizeToMasterPlaylist,
  isDev,
  dirname: __dirname,
});

registerAnalyzeIpc({ normalizeToMasterPlaylist, analyzeUrl });
registerDialogIpc({
  getData: () => lastDownloadDialogData,
  getDialogWindow: () => downloadDialogWindow,
});
const activeDownloads = new Map<string, HttpDownloadController>();
const activeOpts = new Map<string, any>();
const pendingQueue: Array<{ id: string; opts: any }> = [];
const pausedDownloads = new Map<string, any>();
const pausingIds = new Set<string>();
const cancelledIds = new Set<string>();

const scheduler = createScheduler({
  startQueue: () => {
    try {
      const ids = [...pausedDownloads.keys()];
      for (const pid of ids) {
        if (activeDownloads.size >= appConfig.concurrent) break;
        const popts = pausedDownloads.get(pid);
        if (!popts) continue;
        pausedDownloads.delete(pid);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-started', {
            id: pid,
            opts: { ...popts, title: popts.filename || popts.title },
            outDir: popts.outDir,
          });
        }
        if (popts.isHttp) {
          void runMultiPartHttpDownload(pid, popts, popts.outDir, popts.outPath, popts.filename);
        } else {
          void doStartDownload(pid, popts).catch(e =>
            log.error('[VoltGet] scheduler start failed', { error: String(e) })
          );
        }
      }
      processPending();
      new Notification({ title: 'VoltGet Zamanlayıcı', body: 'Kuyruk başlatıldı' }).show();
    } catch {}
  },
  stopQueue: () => {
    try {
      for (const [sid, proc] of activeDownloads.entries()) {
        const sopts = activeOpts.get(sid);
        if (sopts) pausedDownloads.set(sid, sopts);
        pausingIds.add(sid);
        try {
          cancelScheduledRetry(sid);
        } catch {}
        try {
          if (typeof proc.pause === 'function') proc.pause();
          else proc.kill();
        } catch {}
        activeDownloads.delete(sid);
        activeOpts.delete(sid);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-paused', { id: sid });
        }
      }
      updatePowerSaveBlocker();
      processPending();
      new Notification({ title: 'VoltGet Zamanlayıcı', body: 'Kuyruk durduruldu' }).show();
    } catch {}
  },
  log: text => log.info(text),
});

function isValidExecutable(p: string): boolean {
  return isValidExeUtil(p);
}

function resolveYtDlpPath(): string {
  return resolveYtDlpUtil({ dirname: __dirname });
}

let ytDlpPath = resolveYtDlpPath();
ensureBinDirOnPath(ytDlpPath);

function resolveFfmpegPath(): string {
  return resolveFfmpegUtil({ dirname: __dirname });
}
const ffmpegPath = resolveFfmpegPath();
ensureBinDirOnPath(ffmpegPath);
function isFfmpegOk(): boolean {
  try {
    execSync(`"${ffmpegPath}" -version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
function loadConfig(): AppConfig {
  const raw = loadConfigUtil();
  const validated = mergeWithDefaults(raw);
  return validated as unknown as AppConfig;
}
function saveConfig(c: AppConfig) {
  const validated = AppConfigSchema.safeParse(c);
  if (!validated.success) {
    log.error('[VoltGet] Invalid config', { message: validated.error.message });
    return;
  }
  saveConfigUtil(validated.data);
}
let appConfig = { ...zodDefaultConfig } as AppConfig;

const conflictManager = createConflictManager({
  send: (channel: string, data: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
  },
  getPolicy: () => appConfig.fileConflictAction || 'rename',
  onRememberChoice: (decision: any) => {
    appConfig = { ...appConfig, fileConflictAction: decision };
    saveConfig(appConfig);
  },
});

ipcMain.handle(
  'resolve-file-conflict',
  async (_e, payload: { conflictId: string; decision: string; remember?: boolean }) => {
    return conflictManager.resolveConflictDecision(
      payload?.conflictId,
      (payload?.decision as any) || 'rename',
      !!payload?.remember
    );
  }
);

function getDefaultDownloadDir() {
  try {
    const c = loadConfig();
    if (
      c.customOutDir &&
      !c.customOutDir.toLowerCase().endsWith('flexplorer') &&
      fs.existsSync(c.customOutDir)
    ) {
      return c.customOutDir;
    }
  } catch {}
  return getDefaultDirUtil(appConfig.customOutDir);
}
function ensureDir(dir: string) {
  return ensureDirUtil(dir);
}
function getSiteFolder(base: string, url: string, filename?: string) {
  return getSiteFolderUtil(
    base,
    url,
    { siteFolders: appConfig.siteFolders, categoryFolders: appConfig.categoryFolders },
    filename
  );
}

function updatePowerSaveBlocker() {
  return updatePowerUtil(activeDownloads.size, () => checkPostDownloadAction());
}

function checkPostDownloadAction() {
  return checkPostActionUtil(
    activeDownloads.size,
    pendingQueue.length + pausedDownloads.size,
    appConfig.postDownloadAction || 'none'
  );
}
function saveQueue(jobs: Array<{ id: string; opts: any }>) {
  return saveQueueUtil(jobs);
}
function loadQueue(): Array<{ id: string; opts: any }> {
  return loadQueueUtil();
}

interface DownloadHistoryItem {
  id: string;
  url: string;
  title: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  date: number;
  category: 'video' | 'audio' | 'document' | 'archive' | 'installer' | 'other';
}

function loadHistory(): DownloadHistoryItem[] {
  return loadHistoryUtil() as unknown as DownloadHistoryItem[];
}

function addDownloadToHistory(
  item: Partial<DownloadHistoryItem> & { id: string; filePath: string }
) {
  return addHistoryUtil(item);
}

function removeDownloadFromHistory(idOrPath: string) {
  return removeHistoryUtil(idOrPath);
}

function syncHistoryFromQueue() {
  return syncHistoryUtil();
}

let tray: Tray | null = null;
let isQuitting = false;

const createTray = createTrayController({
  getTray: () => tray,
  setTray: (t: Tray) => {
    tray = t;
  },
  getMainWindow: () => mainWindow,
  getAppIconPath,
  getConfig: () => appConfig,
  saveConfig: (c: any) => {
    appConfig = c;
    saveConfig(c);
  },
  getIsQuitting: () => isQuitting,
  setIsQuitting: (v: boolean) => {
    isQuitting = v;
  },
});

const createWindow = createMainWindowFactory({
  getMainWindow: () => mainWindow,
  setMainWindow: (w: any) => {
    mainWindow = w;
  },
  getAppIconPath,
  getConfig: () => appConfig,
  getIsQuitting: () => isQuitting,
  broadcastExtensionStatus,
  isDev,
  dirname: __dirname,
});

const sniffController = createSniffServer({
  getToken: getExtensionToken,
  handleIncomingSniff: (data: any) => handleIncomingSniff(data),
  getMainWindow: () => mainWindow,
});
function getExtensionConnectedCount(): number {
  return sniffController.getExtensionConnectedCount();
}
function broadcastExtensionStatus() {
  return sniffController.broadcastExtensionStatus();
}
function startSniffServer() {
  return sniffController.startSniffServer();
}
function getSniffServer() {
  return sniffController.getServer();
}
function getWss() {
  return sniffController.getWss();
}

function isStreamUrl(url: string): boolean {
  return isStreamUtil(url);
}

function isPlayerOrEmbedUrl(url: string): boolean {
  return isEmbedUtil(url);
}

const recentStreamsByPage = new Map<string, string>();
const sniffDeduper = new SniffDeduper();

const sniffHandler = createSniffHandler({
  getMainWindow: () => mainWindow,
  getWss: () => getWss(),
  sniffDeduper,
  recentStreamsByPage,
  createDownloadDialogWindow,
  getDownloadDialogWindow: () => downloadDialogWindow,
  setLastDownloadDialogData: (d: any) => {
    lastDownloadDialogData = d;
  },
  analyzeUrl,
});

async function handleIncomingSniff(data: any) {
  return sniffHandler.handleIncomingSniff(data);
}

app.setName('VoltGet');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.voltget.app');
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  log.info('[VoltGet] Another instance is already running. Focusing existing window...');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  const clipboardWatcher = createClipboardWatcher({
    getEnabled: () => appConfig.clipboardWatcher,
    onUrl: url => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('clipboard-url-detected', { url });
    },
  });
  function startClipboardWatcher() {
    clipboardWatcher.start();
  }

  app.whenReady().then(() => {
    appConfig = loadConfig();
    // Migrate existing plaintext credentials only after OS encryption is available.
    saveConfig(appConfig);
    ensureDir(getDefaultDownloadDir());
    try {
      const recovered = recoverInterruptedQueue();
      for (const job of recovered) {
        if (job?.status === 'paused' && job?.id && job?.opts && !pausedDownloads.has(job.id)) {
          pausedDownloads.set(job.id, job.opts);
        }
      }
      if (recovered.length)
        log.info(`[VoltGet] Queue recovered: ${recovered.length} jobs (interrupted -> paused)`);
    } catch (e) {
      log.error('[VoltGet] Queue recovery failed', { error: e });
    }
    try {
      app.setLoginItemSettings({
        openAtLogin: !!appConfig.openAtLogin,
        openAsHidden: !!appConfig.startMinimized,
        path: process.execPath,
        args: appConfig.startMinimized ? ['--hidden'] : [],
      });
    } catch {}
    startSniffServer();

    // Register IPC handlers before creating window
    registerMiscIpc({
      loadConfig,
      saveConfig,
      getConfigRef: () => appConfig,
      setConfigRef: (c: any) => {
        appConfig = c;
      },
      ensureDir,
      getDefaultDir: getDefaultDownloadDir,
      getAppIconPath,
      activeDownloads,
      activeOpts,
      pendingQueue,
      pausedDownloads,
      pausingIds,
      canStart,
      processPending,
      doStartDownload,
      runMultiPart: runMultiPartHttpDownload,
      getSiteFolder,
      normalizeToMasterPlaylist,
      updatePowerSaveBlocker,
      loadQueue,
      saveQueue,
      getMainWindow: () => mainWindow,
      onSchedulerChanged: () => {
        try {
          scheduler.reschedule(appConfig.scheduler || ({ enabled: false } as any));
        } catch {}
      },
    });

    try {
      applyProxyEnv(appConfig.proxy as any);
    } catch {}
    try {
      applySessionProxy(appConfig.proxy as any);
    } catch {}
    try {
      scheduler.reschedule(appConfig.scheduler || ({ enabled: false } as any));
    } catch {}
    try {
      setupAutoUpdater({
        onAvailable: info => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-available', {
              version: (info as any)?.version || '',
            });
          }
        },
        onDownloaded: info => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-downloaded', {
              version: (info as any)?.version || '',
            });
          }
        },
      });
      if (app.isPackaged && appConfig.appAutoUpdate !== false) checkForUpdates(false);
    } catch {}

    ipcMain.handle('check-for-updates', async () => checkForUpdates(true));
    ipcMain.handle('quit-and-install', async () => {
      quitAndInstallUpdate();
      return true;
    });

    createWindow();
    createTray();
    startClipboardWatcher();
  });

  app.on('window-all-closed', () => {
    if (!appConfig.closeToTray) {
      try {
        getWss()?.close();
        getSniffServer()?.close();
      } catch {}
      if (process.platform !== 'darwin') app.quit();
    }
  });
  let queueFlushedForQuit = false;
  app.on('before-quit', event => {
    isQuitting = true;
    if (!queueFlushedForQuit) {
      event.preventDefault();
      void flushQueue()
        .then(() => {
          queueFlushedForQuit = true;
          app.quit();
        })
        .catch(error => {
          isQuitting = false;
          log.error('[VoltGet] Queue could not be saved before quit', { error });
          new Notification({
            title: 'VoltGet',
            body: 'Kuyruk kaydedilemedi. Disk erişimini kontrol edip yeniden deneyin.',
          }).show();
        });
      return;
    }
    try {
      getWss()?.close();
      getSniffServer()?.close();
    } catch {}
  });
}

function findYtDlp(): string {
  if (isValidExecutable(ytDlpPath)) return ytDlpPath;
  const refreshed = resolveYtDlpPath();
  if (isValidExecutable(refreshed)) {
    ytDlpPath = refreshed;
    return refreshed;
  }
  return 'yt-dlp';
}
function parseYtDlpJson(out: string): any {
  return parseYtDlpJsonUtil(out);
}

// Standalone analiz fonksiyonu (IPC handler ve sniff server içinden çağrılabilir)
async function analyzeUrl(url: string): Promise<any> {
  let normUrl = normalizeToMasterPlaylist(url);
  normUrl = resolveAnalyzeUrl(
    normUrl,
    sniffDeduper,
    recentStreamsByPage,
    isPlayerOrEmbedUrl,
    isStreamUrl
  );

  const hls = tryHlsEarlyReturn(normUrl);
  if (hls) return hls;
  const direct = tryDirectFileEarlyReturn(normUrl);
  if (direct) return direct;

  const isYouTube = /youtube\.com|youtu\.be/i.test(normUrl);
  const ytdlp = findYtDlp();
  const args = [
    '--dump-json',
    '--no-playlist',
    '--js-runtimes',
    'node',
    '--remote-components',
    'ejs:github',
    '--no-warnings',
  ];
  if (!isYouTube) {
    args.push(
      '--add-header',
      'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
  }
  args.push(normUrl);
  return new Promise((resolve, reject) => {
    let proc: ChildProcess;
    try {
      proc = spawn(ytdlp, args, { shell: false, windowsHide: true });
    } catch (e: any) {
      log.warn('[VoltGet] analyzeUrl primary spawn failed, trying fallback', {
        message: e.message,
      });
      proc = spawn('yt-dlp', args, { shell: false, windowsHide: true });
    }
    let out = '',
      err = '';
    proc.stdout?.on('data', (d: Buffer) => (out += d.toString('utf-8')));
    proc.stderr?.on('data', (d: Buffer) => (err += d.toString('utf-8')));
    proc.on('close', code => {
      if (code === 0) {
        try {
          resolve(parseInfoMod(parseYtDlpJson(out)));
        } catch (e: any) {
          reject(
            `JSON parse hatası: ${e.message}\nÇıktı: ${out.slice(0, 800)}\nHata: ${err.slice(0, 800)}`
          );
        }
      } else {
        reject(redactSecrets(err.slice(0, 1500) || `yt-dlp çıkış kodu ${code}`));
      }
    });
    proc.on('error', (e: any) => reject(`yt-dlp çalıştırılamadı: ${e.message}\nYol: ${ytdlp}`));
  });
}

// queue helpers
function canStart() {
  return activeDownloads.size < appConfig.concurrent;
}
function processPending() {
  if (!canStart() || pendingQueue.length === 0) return;
  const next = pendingQueue.shift()!;
  void doStartDownload(next.id, next.opts).catch(e =>
    log.error('[VoltGet] start failed', { error: String(e) })
  );
}

const orchestrator = createDownloadOrchestrator({
  getAppConfig: () => appConfig,
  getMainWindow: () => mainWindow,
  activeDownloads,
  activeOpts,
  pendingQueue,
  pausedDownloads,
  pausingIds,
  cancelledIds,
  sniffDeduper,
  recentStreamsByPage,
  resolveConflictPath: (p: string) => conflictManager.resolveConflictPath(p),
  getDefaultDir: getDefaultDownloadDir,
  getSiteFolder,
  ensureDir,
  updatePowerSaveBlocker,
  processPending,
  addDownloadToHistory,
  runMultiPartHttpDownload,
  findYtDlp,
  getFfmpegPath: () => ffmpegPath,
  isFfmpegOk,
  isTemporaryOrPartialFile,
});

async function doStartDownload(id: string, opts: any) {
  return orchestrator.doStartDownload(id, opts);
}

registerQueueIpc({
  activeDownloads,
  activeOpts,
  pendingQueue,
  pausedDownloads,
  pausingIds,
  cancelledIds,
  canStart,
  processPending,
  doStartDownload,
  runMultiPart: runMultiPartHttpDownload,
  getSiteFolder,
  getDefaultDir: getDefaultDownloadDir,
  updatePowerSaveBlocker,
  send: (ch, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, data);
  },
  cancelScheduledRetry,
});

function isTemporaryOrPartialFile(name: string): boolean {
  return isTempUtil(name);
}

function scanDownloadedFiles(dir: string, baseDir: string): any[] {
  return scanFilesUtil(dir, baseDir);
}

registerFileIpc({
  scanFiles: scanDownloadedFiles,
  ensureDir,
  getDefaultDir: getDefaultDownloadDir,
  syncHistory: syncHistoryFromQueue,
  loadHistory,
  loadQueue,
  saveQueue,
  removeFromHistory: removeDownloadFromHistory,
  getCategory: (ext: string) => categorizeFile(ext),
});

registerToolsIpc({
  getYtDlpPath: () => ytDlpPath,
  setYtDlpPath: (p: string) => {
    ytDlpPath = p;
  },
  findYtDlp,
  getFfmpegPath: () => ffmpegPath,
  ensureDir,
  isValidExecutable,
  loadConfig,
  appDirname: __dirname,
  isPackaged: app.isPackaged,
  exeDir: (() => {
    try {
      return path.dirname(app.getPath('exe'));
    } catch {
      return '';
    }
  })(),
});

registerExtensionIpc({
  getExtensionDir,
  ensureDir,
  getDefaultDir: getDefaultDownloadDir,
  getExtensionConnectedCount,
});

function getExtensionDir(targetBrowser?: string): string {
  const isFirefox = (targetBrowser || '').toLowerCase().includes('firefox');
  const folderName = isFirefox ? 'extension-firefox' : 'extension';
  const diskCandidates = [
    path.join(process.resourcesPath, folderName),
    path.join(path.dirname(app.getPath('exe')), 'resources', folderName),
    path.join(path.dirname(app.getPath('exe')), folderName),
    path.join(__dirname, '../../' + folderName),
    path.join(__dirname, '../' + folderName),
    path.join(process.cwd(), folderName),
  ];
  for (const p of diskCandidates) {
    if (!p.includes('.asar') && fs.existsSync(p) && fs.existsSync(path.join(p, 'manifest.json'))) {
      return p;
    }
  }
  const appPathExt = path.join(app.getAppPath(), folderName);
  const userDir = path.join(app.getPath('userData'), folderName);
  if (fs.existsSync(path.join(appPathExt, 'manifest.json'))) {
    if (appPathExt.includes('.asar')) {
      try {
        ensureDir(userDir);
        fs.cpSync(appPathExt, userDir, { recursive: true, force: true });
        return userDir;
      } catch (e) {
        log.error('[VoltGet] asar eklenti çıkartma hatası', { error: e });
      }
    } else {
      return appPathExt;
    }
  }
  if (fs.existsSync(path.join(userDir, 'manifest.json'))) {
    return userDir;
  }
  return diskCandidates[0] || userDir;
}

function httpDeps() {
  return {
    activeDownloads,
    activeOpts,
    pausingIds,
    cancelledIds,
    getSpeedLimitKB: () => appConfig.speedLimitKB,
    getPartsCount: () => appConfig.partsCount || 8,
    getRetryPolicy: () => getRetryPolicyFrom(appConfig),
    getProxyAgent: () => getProxyAgent(appConfig.proxy as any),
    getRequestTimeoutMs: () => appConfig.requestTimeoutMs || 30000,
    onFileCompleted: (jobId: string, fp: string) =>
      maybeVirusScan(fp, !!appConfig.virusScanEnabled, text => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-log', { id: jobId, text });
        }
      }),
    resolveConflictPath: (p: string) => conflictManager.resolveConflictPath(p),
    updatePowerSaveBlocker,
    processPending,
    addToHistory: (item: any) => addDownloadToHistory(item),
    ensureDir,
    send: (channel: string, data: any) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data);
    },
    notify: (title: string, body: string) => {
      try {
        new Notification({ title, body }).show();
      } catch {}
    },
  };
}

async function runMultiPartHttpDownload(
  id: string,
  opts: any,
  outDir: string,
  outPath: string,
  filename: string
) {
  return runMultiPartHttpDownloadMod(httpDeps(), id, opts, outDir, outPath, filename);
}
