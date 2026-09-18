import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DesktopApi } from './contracts.js';
function subscribe<T>(channel: string, callback: (data: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, data: T) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: DesktopApi = {
  copyExtensionToken: () => ipcRenderer.invoke('copy-extension-token'),
  analyzeUrl: (url: string) => ipcRenderer.invoke('analyze-url', url),
  startDownload: opts => ipcRenderer.invoke('start-download', opts),
  cancelDownload: (id: string) => ipcRenderer.invoke('cancel-download', id),
  pauseDownload: (id: string) => ipcRenderer.invoke('pause-download', id),
  resumeDownload: payload => ipcRenderer.invoke('resume-download', payload),
  retryDownload: opts => ipcRenderer.invoke('retry-download', opts),
  directDownload: opts => ipcRenderer.invoke('direct-download', opts),
  httpDownload: opts => ipcRenderer.invoke('http-download', opts),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (dir: string) => ipcRenderer.invoke('open-folder', dir),
  getDefaultDir: () => ipcRenderer.invoke('get-default-dir'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  listFiles: (mode?: string, customDir?: string) =>
    ipcRenderer.invoke('list-files', mode, customDir),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  showInFolder: (filePath: string) => ipcRenderer.invoke('show-in-folder', filePath),
  deleteFile: payload => ipcRenderer.invoke('delete-file', payload),
  checkFileExists: (filePath: string) => ipcRenderer.invoke('check-file-exists', filePath),
  computeFileHash: (filePath: string, algorithm?: 'md5' | 'sha256' | 'sha1') =>
    ipcRenderer.invoke('compute-file-hash', filePath, algorithm),
  removeFromHistory: (idOrPath: string) => ipcRenderer.invoke('remove-from-history', idOrPath),
  getConfig: () => ipcRenderer.invoke('get-config'),
  getDownloadDialogData: () => ipcRenderer.invoke('get-download-dialog-data'),
  setConfig: patch => ipcRenderer.invoke('set-config', patch),
  setSpeedLimit: (limitKB: number) => ipcRenderer.invoke('set-speed-limit', limitKB),
  getYtDlpStatus: () => ipcRenderer.invoke('get-yt-dlp-status'),
  checkYtDlpUpdate: () => ipcRenderer.invoke('check-yt-dlp-update'),
  downloadYtDlp: () => ipcRenderer.invoke('download-yt-dlp'),
  sniffedUrl: (data: any) => ipcRenderer.invoke('sniffed-url', data),
  getQueue: () => ipcRenderer.invoke('get-queue'),
  saveQueue: jobs => ipcRenderer.invoke('save-queue', jobs),
  onProgress: cb => subscribe('download-progress', cb),
  onLog: cb => subscribe('download-log', cb),
  onDone: cb => subscribe('download-done', cb),
  onError: cb => subscribe('download-error', cb),
  onQueued: cb => subscribe('download-queued', cb),
  onStarted: cb => subscribe('download-started', cb),
  onCanceled: cb => subscribe('download-canceled', cb),
  onPaused: cb => subscribe('download-paused', cb),
  onSniffed: cb => subscribe('sniffed-url', cb),
  onShowDownloadDialog: cb => subscribe('show-download-dialog', cb),
  onOpenSniffItem: cb => subscribe('open-sniff-item', cb),
  onSwitchToSniffTab: cb => subscribe('switch-to-sniff-tab', cb),
  onSwitchToDownloadTab: cb => subscribe('switch-to-download-tab', cb),
  openExtensionFolder: (browser?: string) => ipcRenderer.invoke('open-extension-folder', browser),
  exportExtensionZip: (browser?: string) => ipcRenderer.invoke('export-extension-zip', browser),
  getExtensionStatus: () => ipcRenderer.invoke('get-extension-status'),
  onExtensionStatus: cb => subscribe('extension-status-changed', cb),
  getDiskSpace: (dirPath?: string) => ipcRenderer.invoke('get-disk-space', dirPath),
  queueDownload: opts => ipcRenderer.invoke('queue-download', opts),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  onClipboardUrl: cb => subscribe('clipboard-url-detected', cb),
  minimizeDialog: () => ipcRenderer.invoke('minimize-dialog'),
  closeDialog: () => ipcRenderer.invoke('close-dialog'),
  onFileConflict: cb => subscribe('file-conflict-request', cb),
  resolveFileConflict: (payload: { conflictId: string; decision: string; remember?: boolean }) =>
    ipcRenderer.invoke('resolve-file-conflict', payload),
  exportQueue: jobs => ipcRenderer.invoke('export-queue', jobs),
  importQueue: () => ipcRenderer.invoke('import-queue'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  pauseAllDownloads: () => ipcRenderer.invoke('pause-all-downloads'),
  resumeAllDownloads: () => ipcRenderer.invoke('resume-all-downloads'),
  setPostDownloadAction: action => ipcRenderer.invoke('set-post-download-action', action),
  onSwitchToSettingsTab: cb => subscribe('switch-to-settings-tab', cb),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateAvailable: cb => subscribe('update-available', cb),
  onUpdateDownloaded: cb => subscribe('update-downloaded', cb),
  onConfigChanged: cb => subscribe('config-changed', cb),
};
contextBridge.exposeInMainWorld('api', api);
