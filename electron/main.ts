import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Notification,
  Tray,
  Menu,
  clipboard,
  powerSaveBlocker,
} from 'electron';
import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import https from 'https';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  normalizeToMasterPlaylist as normalizePlaylistUtil,
  isMasterPlaylistUrl as isMasterUtil,
  isStreamUrl as isStreamUtil,
  isPlayerOrEmbedUrl as isEmbedUtil,
  isDownloadableUrl as isDownloadableUtil,
} from './utils/playlist.js';
import {
  isValidExecutable as isValidExeUtil,
  resolveYtDlpPath as resolveYtDlpUtil,
  resolveFfmpegPath as resolveFfmpegUtil,
  ensureBinDirOnPath,
  parseYtDlpJson as parseYtDlpJsonUtil,
} from './utils/binaries.js';
import {
  ensureDir as ensureDirUtil,
  getCategoryFromExt as getCategoryUtil,
  isTemporaryOrPartialFile as isTempUtil,
  scanDownloadedFiles as scanFilesUtil,
  sanitizeFilename,
} from './utils/files.js';
import {
  detectSite as detectSiteUtil,
  getSiteFolder as getSiteFolderUtil,
  getDefaultDownloadDir as getDefaultDirUtil,
  getAppIconPath as getIconUtil,
} from './utils/sites.js';
import {
  defaultConfig as defaultConfigUtil,
  loadConfig as loadConfigUtil,
  saveConfig as saveConfigUtil,
  loadQueue as loadQueueUtil,
  saveQueue as saveQueueUtil,
  loadHistory as loadHistoryUtil,
  saveHistory as saveHistoryUtil,
  addDownloadToHistory as addHistoryUtil,
  removeDownloadFromHistory as removeHistoryUtil,
  syncHistoryFromQueue as syncHistoryUtil,
  recoverInterruptedQueue,
} from './store.js';
import {
  updatePowerSaveBlocker as updatePowerUtil,
  checkPostDownloadAction as checkPostActionUtil,
} from './power.js';
import {
  resolveFinalUrl,
  fallbackTitle,
  isGenericFileUrl,
  isHlsUrl,
  isVideoPlatformUrl,
  isYouTubeUrl,
} from './downloader/url-resolver.js';
import { buildYtDlpArgs, buildFfmpegFallbackArgs } from './downloader/args.js';
import { parseYtDlpProgressLine, parseFfmpegProgressLine } from './downloader/progress.js';
import { shouldIgnoreSniffUrl, buildDefaultSniffFormats } from './sniff.js';
import {
  runMultiPartHttpDownload as runMultiPartHttpDownloadMod,
  runHttpDownload as runHttpDownloadMod,
} from './downloader/http.js';
import { buildMainWindowOptions, buildDialogWindowOptions, getTrayMenuLabels } from './windows.js';
import { SniffDeduper } from './sniff.js';
import {
  spawnYtDlp,
  extractDestinationFromOutput,
  buildOutputTemplate,
  appendFormatArgs,
} from './downloader/ytdlp.js';
import {
  isGenericDownload as isGenericSniffDownload,
  buildInitialDialogData,
  pickAnalyzeTarget,
  mergeAnalyzedIntoDialog,
  withTimeout,
} from './sniff-handler.js';
import {
  shouldRunFfmpegFallback,
  findNewestDownload,
  statSizeOf,
  buildYtDlpDonePayload,
  buildFfmpegDonePayload,
} from './downloader/completion.js';
import { registerToolsIpc } from './ipc/tools.js';
import { registerMiscIpc } from './ipc/misc.js';
import { registerAnalyzeIpc } from './ipc/analyze.js';
import { registerExtensionIpc } from './ipc/extension.js';
import { registerDialogIpc } from './ipc/dialog.js';
import { createTrayController } from './app/tray.js';
import { createMainWindowFactory, createDialogWindowFactory } from './app/windows.js';
import { createSniffServer } from './server/sniffServer.js';
import { registerFileIpc } from './ipc/files.js';
import { HttpDownloadController } from './downloader/http.js';
import {
  validateConfig,
  mergeWithDefaults,
  defaultConfig as zodDefaultConfig,
  AppConfigSchema,
} from './config/schema.js';
import log from './log/logger.js';
import { registerQueueIpc } from './ipc/queue.js';
import {
  tryHlsEarlyReturn,
  tryDirectFileEarlyReturn,
  resolveAnalyzeUrl,
  parseInfo as parseInfoMod,
} from './analyze.js';
import { createClipboardWatcher, isStartHidden } from './lifecycle.js';

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

// ---- Config & Queue Persistence ----
type AppConfig = {
  concurrent: number;
  speedLimitKB: number; // 0 = unlimited
  siteFolders: boolean;
  categoryFolders?: boolean;
  filenameTemplate: string; // e.g. %(title)s.%(ext)s
  autoUpdateCheck: boolean;
  sniffNotifications: boolean;
  sniffDebounceMs: number;
  theme: 'dark' | 'light';
  accentColor: 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'red' | 'teal';
  language: 'tr' | 'en' | 'de' | 'es' | 'ru' | 'ar';
  interceptBrowserDownloads: boolean;
  captureMediaRequests: boolean;
  captureDocuments: boolean;
  captureArchives: boolean;
  captureInstallers: boolean;
  openAtLogin: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  minimizeToTray: boolean;
  clipboardWatcher: boolean;
  soundNotification?: boolean;
  postDownloadAction?: 'none' | 'shutdown' | 'sleep' | 'quit';
  customOutDir?: string;
};
const defaultConfig: AppConfig = {
  concurrent: 3,
  speedLimitKB: 0,
  siteFolders: true,
  categoryFolders: false,
  filenameTemplate: '%(title)s.%(ext)s',
  autoUpdateCheck: true,
  sniffNotifications: true,
  sniffDebounceMs: 8000,
  theme: 'dark',
  accentColor: 'blue',
  language: 'tr',
  interceptBrowserDownloads: true,
  captureMediaRequests: true,
  captureDocuments: true,
  captureArchives: true,
  captureInstallers: true,
  openAtLogin: false,
  startMinimized: false,
  closeToTray: true,
  minimizeToTray: false,
  clipboardWatcher: true,
  soundNotification: true,
  postDownloadAction: 'none',
  customOutDir: '',
};
function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}
function queuePath() {
  return path.join(app.getPath('userData'), 'queue.json');
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
let appConfig = loadConfig();

function getDefaultDownloadDir() {
  try {
    const c = loadConfig();
    if (c.customOutDir && fs.existsSync(c.customOutDir)) return c.customOutDir;
  } catch {}
  return getDefaultDirUtil(appConfig.customOutDir);
}
function ensureDir(dir: string) {
  return ensureDirUtil(dir);
}
function detectSite(url: string) {
  return detectSiteUtil(url);
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
    pendingQueue.length,
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

function historyPath() {
  return path.join(app.getPath('userData'), 'download_history.json');
}

function loadHistory(): DownloadHistoryItem[] {
  return loadHistoryUtil() as unknown as DownloadHistoryItem[];
}

function saveHistory(items: DownloadHistoryItem[]) {
  return saveHistoryUtil(items);
}

function getCategoryFromExt(extWithOrWithoutDot: string): DownloadHistoryItem['category'] {
  return getCategoryUtil(extWithOrWithoutDot) as DownloadHistoryItem['category'];
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

const sniffServer: http.Server | null = null;
const wss: WebSocketServer | null = null;

// Legacy notification helpers - kept for backward compat, server now handles broadcast
const sniffLastNotify = new Map<string, number>();
function notifyKeyFor(data: any) {
  try {
    const u = new URL(data.pageUrl || data.url);
    return u.hostname.replace('www.', '') + '|' + (data.type || 'media');
  } catch {
    return (data.pageUrl || data.url || 'unknown') + '|' + (data.type || 'media');
  }
}
function shouldNotifySniff(key: string) {
  if (!loadConfig().sniffNotifications) return false;
  const debounce = Math.max(loadConfig().sniffDebounceMs || 8000, 10000);
  const now = Date.now();
  const last = sniffLastNotify.get(key) || 0;
  if (now - last < debounce) return false;
  sniffLastNotify.set(key, now);
  return true;
}

const sniffController = createSniffServer({
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

function isMasterPlaylistUrl(u: string): boolean {
  return isMasterUtil(u);
}

function isStreamUrl(url: string): boolean {
  return isStreamUtil(url);
}

function isPlayerOrEmbedUrl(url: string): boolean {
  return isEmbedUtil(url);
}

const recentStreamsByPage = new Map<string, string>();
const sniffDeduper = new SniffDeduper();

async function handleIncomingSniff(data: any) {
  if (data && data.url) {
    data.url = normalizeToMasterPlaylist(data.url);
  }
  const sniffId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const sniffData = { ...data, sniffId, time: new Date().toLocaleTimeString() };

  // 1. Gerçek medya akışını hafızaya al (Master öncelikli tekilleştirme SniffDeduper'da)
  sniffDeduper.remember(sniffData.url, sniffData.pageUrl);
  // Geriye dönük uyumluluk: legacy Map'i de güncel tut (doStartDownload/analyzeUrl okuyor)
  if (sniffData.url && isStreamUrl(sniffData.url)) {
    const isMaster = isMasterPlaylistUrl(sniffData.url);
    const existingLatest = recentStreamsByPage.get('latest');
    if (isMaster || !existingLatest || !isMasterPlaylistUrl(existingLatest)) {
      recentStreamsByPage.set('latest', sniffData.url);
    }
    if (sniffData.pageUrl) {
      const existingPage = recentStreamsByPage.get(sniffData.pageUrl);
      if (isMaster || !existingPage || !isMasterPlaylistUrl(existingPage)) {
        recentStreamsByPage.set(sniffData.pageUrl, sniffData.url);
      }
      try {
        const u = new URL(sniffData.pageUrl);
        const cleanHost = u.hostname.replace(/^www\./i, '').toLowerCase();
        const existingHost = recentStreamsByPage.get(cleanHost);
        if (isMaster || !existingHost || !isMasterPlaylistUrl(existingHost)) {
          recentStreamsByPage.set(cleanHost, sniffData.url);
          recentStreamsByPage.set(u.hostname, sniffData.url);
        }
      } catch {}
    }
    if (sniffData.url) {
      try {
        const u = new URL(sniffData.url);
        const cleanHost = u.hostname.replace(/^www\./i, '').toLowerCase();
        const existingHost = recentStreamsByPage.get(cleanHost);
        if (isMaster || !existingHost || !isMasterPlaylistUrl(existingHost)) {
          recentStreamsByPage.set(cleanHost, sniffData.url);
        }
      } catch {}
    }
  }

  // 2. Ana pencere ve açık olan WebSocket istemcilerine gönder (Yakalayıcı listesinde görünsün)
  const curWss = getWss();
  if (curWss) {
    curWss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'sniffed-url', data: sniffData }));
      }
    });
  }
  if (mainWindow) {
    mainWindow.webContents.send('sniffed-url', sniffData);
  }

  // 3. IDM Davranışı: Kullanıcı video üstü butona bastıysa VEYA tarayıcıda dosya indirmesi başladıysa pencere aç!
  if (data.userInitiated || data.isGenericDownload) {
    let resolvedUrl = data.url;
    const isVideoPortal =
      /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(
        data.pageUrl || ''
      ) || /youtube\.com|youtu\.be|googlevideo\.com/i.test(resolvedUrl || '');
    if (
      isVideoPortal &&
      data.pageUrl &&
      /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(
        data.pageUrl
      )
    ) {
      resolvedUrl = data.pageUrl;
      data.url = data.pageUrl;
    } else if (resolvedUrl && isPlayerOrEmbedUrl(resolvedUrl)) {
      const matched =
        sniffDeduper.resolve(data.pageUrl, data.url) ||
        recentStreamsByPage.get(data.pageUrl) ||
        recentStreamsByPage.get(data.url) ||
        recentStreamsByPage.get('latest');
      if (matched && isStreamUrl(matched)) {
        console.log('[VoltGet] mapped embed/player page to real stream:', matched);
        resolvedUrl = matched;
        data.url = matched;
      }
    }

    // Web scripti veya stillerini indirme penceresinde açma
    if (shouldIgnoreSniffUrl(resolvedUrl, data.filename)) {
      console.log('[VoltGet] Ignored web script in sniff handler:', resolvedUrl);
      return;
    }

    const isGen = isGenericSniffDownload(resolvedUrl, data.filename, {
      isGenericDownload: data.isGenericDownload,
      type: data.type,
    });

    const initialData = buildInitialDialogData(data, resolvedUrl, isGen);

    // ANINDA PENCEREYİ AÇ (IDM gibi doğrudan ekrana fırlatılır!)
    createDownloadDialogWindow(initialData);

    // Arka planda kaliteleri analiz et ve pencereye ilet:
    if (!isGen && !resolvedUrl.endsWith('.pdf')) {
      const { target, waitTime } = pickAnalyzeTarget(resolvedUrl, data.pageUrl);

      withTimeout(analyzeUrl(target), waitTime)
        .then((res: any) => {
          const analyzed = mergeAnalyzedIntoDialog(initialData, res, data.asAudio);
          lastDownloadDialogData = analyzed;
          if (downloadDialogWindow && !downloadDialogWindow.isDestroyed()) {
            downloadDialogWindow.webContents.send('show-download-dialog', analyzed);
          }
        })
        .catch(err => {
          console.warn(
            '[VoltGet] analyze warning/timeout, using default formats:',
            err?.message || err
          );
          const fallback = {
            ...initialData,
            loading: false,
            formats: initialData.formats,
          };
          lastDownloadDialogData = fallback;
          if (downloadDialogWindow && !downloadDialogWindow.isDestroyed()) {
            downloadDialogWindow.webContents.send('show-download-dialog', fallback);
          }
        });
    }
    return;
  }
  // Video arka plan yakalamalarında masaüstüne bildirim atılmaz (Kullanıcı isteği doğrultusunda sessiz çalışır)
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

  // legacy helper kept for shared state consumers - delegates to utils/playlist
  function isDownloadableUrl(text: string): boolean {
    return isDownloadableUtil(text);
  }

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
    ensureDir(getDefaultDownloadDir());
    try {
      const recovered = recoverInterruptedQueue();
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
  app.on('before-quit', () => {
    isQuitting = true;
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
      try {
        proc = spawn('yt-dlp', args, { shell: false, windowsHide: true });
      } catch (e2: any) {
        proc = spawn('yt-dlp', args, { shell: true, windowsHide: true });
      }
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
        reject(
          `${err.slice(0, 1500) || `yt-dlp çıkış kodu ${code}`}\nKomut: ${ytdlp} ${args.join(' ')}`
        );
      }
    });
    proc.on('error', (e: any) => reject(`yt-dlp çalıştırılamadı: ${e.message}\nYol: ${ytdlp}`));
  });
}

function parseInfo(info: any) {
  return parseInfoMod(info);
}

// queue helpers
function canStart() {
  return activeDownloads.size < appConfig.concurrent;
}
function processPending() {
  if (!canStart() || pendingQueue.length === 0) return;
  const next = pendingQueue.shift()!;
  doStartDownload(next.id, next.opts);
}
function doStartDownload(id: string, opts: any) {
  let finalUrl = normalizeToMasterPlaylist(opts.url || '');
  opts.url = finalUrl;

  const isYouTube =
    /youtube\.com|youtu\.be|googlevideo\.com/i.test(finalUrl) ||
    (opts.pageUrl && /youtube\.com|youtu\.be/i.test(opts.pageUrl));

  if (isYouTube) {
    if (opts.pageUrl && /youtube\.com|youtu\.be/i.test(opts.pageUrl)) {
      finalUrl = opts.pageUrl;
      opts.url = opts.pageUrl;
    } else if (finalUrl.includes('googlevideo.com')) {
      // Find matching youtube page from recent streams (deduper first, legacy map fallback)
      for (const [key] of sniffDeduper.entries()) {
        if (/youtube\.com\/watch|youtu\.be\//i.test(key)) {
          finalUrl = key;
          opts.url = key;
          break;
        }
      }
      if (finalUrl.includes('googlevideo.com')) {
        for (const [key] of recentStreamsByPage.entries()) {
          if (/youtube\.com\/watch|youtu\.be\//i.test(key)) {
            finalUrl = key;
            opts.url = key;
            break;
          }
        }
      }
    }
  }

  // 1. Embed veya oynatıcı sayfası geldiyse hafızadaki gerçek akış URL'si ile eşle
  if (!isYouTube && isPlayerOrEmbedUrl(finalUrl)) {
    const matched =
      sniffDeduper.resolve(opts.pageUrl, opts.url) ||
      recentStreamsByPage.get(opts.pageUrl) ||
      recentStreamsByPage.get(opts.url) ||
      recentStreamsByPage.get('latest');
    if (matched && isStreamUrl(matched)) {
      console.log('[VoltGet] doStartDownload resolved embed URL to real stream:', matched);
      finalUrl = matched;
      opts.url = matched;
    }
  }

  const titled = fallbackTitle(opts.title, opts.pageUrl);
  if (titled) opts.title = titled;

  // 2. Web scripti (.js) veya stil indirme girişimlerini kesinlikle engelle
  if (shouldIgnoreSniffUrl(finalUrl, opts.filename)) {
    console.log('[VoltGet] Rejected script download attempt:', finalUrl);
    return;
  }

  const isGeneric = opts.isHttp || isGenericFileUrl(finalUrl, opts.filename, opts.isHttp);
  if (isGeneric) {
    const filename =
      opts.filename || finalUrl.split('/').pop()?.split('?')[0] || `file_${Date.now()}`;
    const baseOut = opts.outDir || getDefaultDownloadDir();
    const outDir = getSiteFolder(baseOut, finalUrl, filename);
    ensureDir(outDir);
    const outPath = path.join(outDir, filename);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-started', {
        id,
        opts: { ...opts, title: filename },
        outDir,
      });
      mainWindow.webContents.send('switch-to-download-tab');
    }
    runMultiPartHttpDownload(id, opts, outDir, outPath, filename);
    return;
  }

  // 4. Medya / Video indirmesi
  const baseOut = opts.outDir || getDefaultDownloadDir();
  const outDir = getSiteFolder(baseOut, finalUrl, opts.filename || opts.title);
  ensureDir(outDir);
  const ytdlp = findYtDlp();
  const isHls = isHlsUrl(finalUrl);

  const built = buildYtDlpArgs({
    finalUrl,
    pageUrl: opts.pageUrl,
    cookie: opts.cookie,
    speedLimitKB: appConfig.speedLimitKB,
    isYouTube,
  });
  const args: string[] = built.args;
  const embedId = built.embedId;

  appendFormatArgs(args, {
    asAudio: opts.asAudio,
    formatId: opts.formatId,
    isAudioOnly: opts.isAudioOnly,
  });

  const builtTpl = buildOutputTemplate(
    { filename: opts.filename, title: opts.title },
    appConfig.filenameTemplate
  );
  const filename = builtTpl.filename;
  const tmpl = builtTpl.tmpl;
  const tempDir = path.join(outDir, '.voltget_tmp');
  ensureDir(tempDir);
  args.push('-P', `temp:${tempDir}`, '-P', `home:${outDir}`);
  args.push('-o', tmpl, '--no-playlist', '--newline', '--progress', '--continue');
  if (ffmpegPath) {
    const loc =
      ffmpegPath !== 'ffmpeg' && fs.existsSync(ffmpegPath) ? path.dirname(ffmpegPath) : ffmpegPath;
    args.push('--ffmpeg-location', loc);
  }
  args.push(finalUrl);

  log.info('[VoltGet] starting download process', { id, ytdlp, args: args.join(' ') });
  const proc: ChildProcess = spawnYtDlp(ytdlp, args);

  proc.on('error', (procErr: any) => {
    log.error('[VoltGet] download process emitted error', { error: procErr });
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-error', {
        id,
        error: `İndirme başlatılamadı: ${procErr.message}`,
      });
    }
  });

  activeDownloads.set(id, {
    pause: () => {
      proc.kill();
    },
    kill: () => {
      proc.kill();
    },
  });
  activeOpts.set(id, { ...opts, url: finalUrl });
  updatePowerSaveBlocker();

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('download-started', {
      id,
      opts: { ...opts, url: finalUrl },
      outDir,
    });
    mainWindow.webContents.send('switch-to-download-tab');
  }

  let downloadedFilePath = '';

  proc.stdout?.on('data', (d: Buffer) => {
    const text = d.toString();
    const dest = extractDestinationFromOutput(text, outDir);
    if (dest) downloadedFilePath = dest;

    const prog = parseYtDlpProgressLine(
      text.split('\n').find(l => l.includes('[download]')) || text
    );
    if (prog && prog.percent > 0 && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', {
        id,
        percent: prog.percent,
        total: prog.total,
        speed: prog.speed,
        eta: prog.eta,
        raw: prog.raw,
        title: activeOpts.get(id)?.title || opts?.title,
      });
    } else if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      (text.includes('[download]') || text.includes('[ExtractAudio]') || text.includes('[Merger]'))
    ) {
      mainWindow.webContents.send('download-log', { id, text: text.trim().slice(0, 300) });
    }
  });

  proc.stderr?.on('data', (d: Buffer) => {
    const errText = d.toString();
    log.error('[yt-dlp error output]', { output: errText.slice(0, 300) });
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('download-log', { id, text: errText.trim().slice(0, 400) });
  });

  proc.on('close', code => {
    activeDownloads.delete(id);
    activeOpts.delete(id);
    if (pausingIds.has(id)) {
      pausingIds.delete(id);
      updatePowerSaveBlocker();
      processPending();
      return;
    }

    // Geçici voltget klasörünü temizle
    try {
      if (fs.existsSync(tempDir)) {
        const remaining = fs.readdirSync(tempDir);
        if (remaining.length === 0) fs.rmdirSync(tempDir);
      }
    } catch {}

    // Eğer yt-dlp hata verdiyse ve HLS / doğrudan akış ise otomatik FFmpeg fallback çalıştır!
    if (shouldRunFfmpegFallback(code, isHls)) {
      if (!isFfmpegOk()) {
        log.error(
          '[VoltGet] ffmpeg missing, cannot run HLS fallback. Install: winget install Gyan.FFmpeg'
        );
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-error', {
            id,
            error:
              'FFmpeg bulunamadı. HLS akışı birleştirilemiyor. Lütfen kurun: winget install Gyan.FFmpeg ve VoltGet uygulamasını yeniden başlatın.',
          });
        }
        updatePowerSaveBlocker();
        processPending();
        return;
      }
      log.info('[VoltGet] yt-dlp exited with code', {
        code,
        action: 'triggering ffmpeg fallback for HLS',
        finalUrl,
      });
      const rawFileName =
        opts.filename ||
        (opts.title
          ? `${opts.title.replace(/[\\/:*?"<>|]/g, '_')}.mp4`
          : `video_${Date.now()}.mp4`);
      const actualOut = path.join(outDir, rawFileName);
      const tempOut = path.join(tempDir, `ff_${id}_${rawFileName}`);
      const ffArgs = buildFfmpegFallbackArgs(
        finalUrl,
        { pageUrl: opts.pageUrl, cookie: opts.cookie, embedId },
        tempOut
      );

      log.info('[VoltGet ffmpeg fallback]', { args: ffArgs.join(' ').slice(0, 300) });
      const ffProc = spawn(ffmpegPath, ffArgs);
      activeDownloads.set(id, {
        pause: () => {
          ffProc.kill();
        },
        kill: () => {
          ffProc.kill();
        },
      });

      ffProc.stderr.on('data', (d: Buffer) => {
        const t = d.toString();
        const parsed = parseFfmpegProgressLine(t);
        if (parsed && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-progress', {
            id,
            percent: 50,
            total: 'HLS Akışı',
            speed: parsed.speed || '',
            eta: parsed.time || '',
            raw: `FFmpeg indiriyor: ${parsed.time} (${parsed.speed})`,
          });
        } else if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-log', {
            id,
            text: '[ffmpeg] ' + t.trim().slice(0, 400),
          });
        }
      });

      ffProc.on('close', ffCode => {
        activeDownloads.delete(id);
        updatePowerSaveBlocker();
        if (ffCode === 0 && fs.existsSync(tempOut)) {
          try {
            fs.renameSync(tempOut, actualOut);
          } catch {
            try {
              fs.copyFileSync(tempOut, actualOut);
              fs.unlinkSync(tempOut);
            } catch {}
          }
        } else {
          try {
            fs.unlinkSync(tempOut);
          } catch {}
        }
        try {
          if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) fs.rmdirSync(tempDir);
        } catch {}

        let statSize = 0;
        if (ffCode === 0 && fs.existsSync(actualOut)) {
          try {
            statSize = fs.statSync(actualOut).size;
          } catch {}
          addDownloadToHistory({
            id,
            url: finalUrl,
            title: opts.title || path.basename(actualOut),
            fileName: path.basename(actualOut),
            filePath: actualOut,
            fileSize: statSize,
            date: Date.now(),
          });
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          const { payload } = buildFfmpegDonePayload(id, ffCode ?? 1, outDir, actualOut, statSize);
          mainWindow.webContents.send('download-done', payload);
        }
        try {
          if (ffCode === 0)
            new Notification({
              title: 'İndirme tamamlandı (VoltGet)',
              body: (opts.title || finalUrl).slice(0, 60),
            }).show();
          else
            new Notification({
              title: 'İndirme hatası',
              body: `FFmpeg Hata Kodu ${ffCode}`,
            }).show();
        } catch {}
        processPending();
      });

      ffProc.on('error', (e: any) => {
        activeDownloads.delete(id);
        updatePowerSaveBlocker();
        try {
          fs.unlinkSync(tempOut);
        } catch {}
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send('download-error', { id, error: String(e) });
        processPending();
      });
      return;
    }

    if (code === 0) {
      if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
        const newest = findNewestDownload(outDir, 45000, isTemporaryOrPartialFile);
        if (newest) downloadedFilePath = newest;
      }

      let statSize = 0;
      if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
        try {
          statSize = fs.statSync(downloadedFilePath).size;
        } catch {}
        addDownloadToHistory({
          id,
          url: finalUrl,
          title: opts.title || path.basename(downloadedFilePath),
          fileName: path.basename(downloadedFilePath),
          filePath: downloadedFilePath,
          fileSize: statSize,
          date: Date.now(),
        });
      }
    }

    const fileSize = statSizeOf(downloadedFilePath);

    if (mainWindow && !mainWindow.isDestroyed()) {
      const { payload } = buildYtDlpDonePayload(id, code ?? 1, outDir, downloadedFilePath);
      mainWindow.webContents.send('download-done', payload);
    }
    try {
      if (code === 0)
        new Notification({
          title: 'İndirme tamamlandı (VoltGet)',
          body: (opts.title || finalUrl).slice(0, 60),
        }).show();
      else
        new Notification({
          title: 'İndirme hatası',
          body: `Kod ${code} • ${finalUrl.slice(0, 40)}`,
        }).show();
    } catch {}
    updatePowerSaveBlocker();
    processPending();
  });

  proc.on('error', (e: any) => {
    activeDownloads.delete(id);
    activeOpts.delete(id);
    updatePowerSaveBlocker();
    if (mainWindow) mainWindow.webContents.send('download-error', { id, error: String(e) });
    processPending();
  });
}

registerQueueIpc({
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
  getDefaultDir: getDefaultDownloadDir,
  updatePowerSaveBlocker,
  send: (ch, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, data);
  },
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
  getCategory: getCategoryFromExt,
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
    getSpeedLimitKB: () => appConfig.speedLimitKB,
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

function runHttpDownload(id: string, opts: any, outDir: string, outPath: string, filename: string) {
  return runHttpDownloadMod(httpDeps(), id, opts, outDir, outPath, filename);
}
