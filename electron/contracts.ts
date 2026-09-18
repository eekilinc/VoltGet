import type { AppConfig } from './config/schema.js';

export interface DownloadOptions {
  url: string;
  title?: string;
  filename?: string;
  outDir?: string;
  outPath?: string;
  pageUrl?: string;
  cookie?: string;
  speedLimitKB?: number;
  isHttp?: boolean;
  asAudio?: boolean;
  formatId?: string;
  isAudioOnly?: boolean;
  [key: string]: unknown;
}
export interface Job {
  id: string;
  url: string;
  title: string;
  percent: number;
  speed: string;
  eta: string;
  total: string;
  status: 'downloading' | 'done' | 'error' | 'queued' | 'paused';
  log: string;
  opts?: DownloadOptions;
  filePath?: string;
  fileName?: string;
  deletedFromDisk?: boolean;
  note?: string;
  tags?: string[];
  size?: number;
}
export interface StartResult {
  id: string;
  queued?: boolean;
  position?: number;
  outDir?: string;
  outPath?: string;
  error?: string;
}
export interface OperationResult {
  success: boolean;
  error?: string;
  path?: string;
  zipPath?: string;
  fileName?: string;
}
export interface FileEntry {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  folder: string;
  size: number;
  mtime: number;
  ext: string;
  category: 'video' | 'audio' | 'document' | 'archive' | 'installer' | 'other';
  url?: string;
  exists?: boolean;
  deletedFromDisk?: boolean;
}
export interface ExtensionStatus {
  connected: boolean;
  count: number;
}
export interface DownloadDone {
  id: string;
  code: number;
  filePath?: string;
  fileName?: string;
  size?: number;
  outDir?: string;
}
export interface MediaFormat {
  id: string;
  ext: string;
  resolution: string;
  height: number;
  filesize: number;
  tbr: number;
  note: string;
  isAudioOnly?: boolean;
  [key: string]: unknown;
}
export interface AnalysisResult {
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  formats: MediaFormat[];
  extractor: string;
  [key: string]: unknown;
}
type Listen<T> = (callback: (data: T) => void) => () => void;

/** The only renderer-to-main capabilities exposed by the preload. */
export interface DesktopApi {
  analyzeUrl(url: string): Promise<AnalysisResult>;
  startDownload(opts: DownloadOptions): Promise<StartResult>;
  directDownload(opts: DownloadOptions): Promise<StartResult>;
  httpDownload(opts: DownloadOptions): Promise<StartResult>;
  retryDownload(opts: DownloadOptions): Promise<StartResult>;
  queueDownload(opts: DownloadOptions): Promise<StartResult>;
  resumeDownload(payload: string | { id: string; opts?: DownloadOptions }): Promise<StartResult>;
  cancelDownload(id: string): Promise<boolean>;
  pauseDownload(id: string): Promise<boolean>;
  pauseAllDownloads(): Promise<number>;
  resumeAllDownloads(): Promise<number>;
  selectFolder(): Promise<string | null>;
  openFolder(dir: string): Promise<void>;
  getDefaultDir(): Promise<string>;
  getAppVersion(): Promise<string>;
  listFiles(mode?: string, customDir?: string): Promise<FileEntry[]>;
  openFile(filePath: string): Promise<string>;
  showInFolder(filePath: string): Promise<boolean>;
  deleteFile(payload: {
    filePath?: string;
    deleteFromDisk: boolean;
    id?: string;
  }): Promise<OperationResult>;
  checkFileExists(filePath: string): Promise<boolean>;
  computeFileHash(
    filePath: string,
    algorithm?: 'md5' | 'sha256' | 'sha1'
  ): Promise<OperationResult & { hash?: string; algorithm?: string }>;
  removeFromHistory(idOrPath: string): Promise<boolean>;
  getConfig(): Promise<AppConfig>;
  setConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
  setSpeedLimit(limitKB: number): Promise<{ success: boolean; speedLimitKB: number }>;
  setPostDownloadAction(action: AppConfig['postDownloadAction']): Promise<{ success: boolean }>;
  getDownloadDialogData(): Promise<unknown>;
  getYtDlpStatus(): Promise<{
    binExists: boolean;
    pathExists: boolean;
    ytDlpPath: string;
    ffmpegOk: boolean;
    ffmpegPath: string;
    ffmpegHint: string;
    ytdlpVer: string;
    config: AppConfig;
  }>;
  checkYtDlpUpdate(): Promise<{
    latest?: string;
    current?: string;
    error?: string;
    updateAvailable?: boolean;
  }>;
  downloadYtDlp(): Promise<unknown>;
  sniffedUrl(data: unknown): Promise<boolean>;
  getQueue(): Promise<Job[]>;
  saveQueue(jobs: Job[]): Promise<void>;
  exportQueue(jobs: Job[]): Promise<{ canceled: boolean; filePath?: string; count?: number }>;
  importQueue(): Promise<{
    canceled: boolean;
    jobs: Array<{ url: string; title: string; opts: DownloadOptions }>;
  }>;
  openExtensionFolder(browser?: string): Promise<OperationResult>;
  exportExtensionZip(browser?: string): Promise<OperationResult>;
  copyExtensionToken(): Promise<boolean>;
  getExtensionStatus(): Promise<ExtensionStatus>;
  getDiskSpace(
    dirPath?: string
  ): Promise<{ free: string; total: string; freeBytes: number; totalBytes: number }>;
  readClipboard(): Promise<string>;
  minimizeDialog(): Promise<void>;
  closeDialog(): Promise<void>;
  resolveFileConflict(payload: {
    conflictId: string;
    decision: string;
    remember?: boolean;
  }): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  onProgress: Listen<{
    id: string;
    percent: number;
    speed: string;
    eta: string;
    total: string;
    raw?: string;
  }>;
  onLog: Listen<{ id: string; text: string }>;
  onDone: Listen<DownloadDone>;
  onError: Listen<{ id: string; error: string }>;
  onQueued: Listen<{ id: string; opts: DownloadOptions; position?: number }>;
  onStarted: Listen<{ id: string; opts: DownloadOptions; outDir?: string }>;
  onCanceled: Listen<{ id: string }>;
  onPaused: Listen<{ id: string }>;
  onSniffed: Listen<unknown>;
  onShowDownloadDialog: Listen<unknown>;
  onOpenSniffItem: Listen<unknown>;
  onSwitchToSniffTab: Listen<unknown>;
  onSwitchToDownloadTab: Listen<unknown>;
  onSwitchToSettingsTab: Listen<unknown>;
  onExtensionStatus: Listen<ExtensionStatus>;
  onClipboardUrl: Listen<{ url: string }>;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): Promise<boolean>;
  onUpdateAvailable: Listen<{ version: string }>;
  onUpdateDownloaded: Listen<{ version: string }>;
  onConfigChanged: Listen<unknown>;
  onFileConflict: Listen<{
    conflictId: string;
    fileName: string;
    outPath: string;
    existingSize: number;
  }>;
}
