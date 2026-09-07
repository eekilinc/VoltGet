import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  analyzeUrl: (url: string) => ipcRenderer.invoke('analyze-url', url),
  startDownload: (opts: any) => ipcRenderer.invoke('start-download', opts),
  cancelDownload: (id: string) => ipcRenderer.invoke('cancel-download', id),
  pauseDownload: (id: string) => ipcRenderer.invoke('pause-download', id),
  resumeDownload: (id: string) => ipcRenderer.invoke('resume-download', id),
  retryDownload: (opts: any) => ipcRenderer.invoke('retry-download', opts),
  directDownload: (opts: any) => ipcRenderer.invoke('direct-download', opts),
  httpDownload: (opts: any) => ipcRenderer.invoke('http-download', opts),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (dir: string) => ipcRenderer.invoke('open-folder', dir),
  getDefaultDir: () => ipcRenderer.invoke('get-default-dir'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  listFiles: (mode?: string, customDir?: string) => ipcRenderer.invoke('list-files', mode, customDir),
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  showInFolder: (filePath: string) => ipcRenderer.invoke('show-in-folder', filePath),
  deleteFile: (payload: any) => ipcRenderer.invoke('delete-file', payload),
  checkFileExists: (filePath: string) => ipcRenderer.invoke('check-file-exists', filePath),
  removeFromHistory: (idOrPath: string) => ipcRenderer.invoke('remove-from-history', idOrPath),
  getConfig: () => ipcRenderer.invoke('get-config'),
  getDownloadDialogData: () => ipcRenderer.invoke('get-download-dialog-data'),
  setConfig: (patch: any) => ipcRenderer.invoke('set-config', patch),
  getYtDlpStatus: () => ipcRenderer.invoke('get-yt-dlp-status'),
  checkYtDlpUpdate: () => ipcRenderer.invoke('check-yt-dlp-update'),
  downloadYtDlp: () => ipcRenderer.invoke('download-yt-dlp'),
  sniffedUrl: (data: any) => ipcRenderer.invoke('sniffed-url', data),
  getQueue: () => ipcRenderer.invoke('get-queue'),
  saveQueue: (jobs: any[]) => ipcRenderer.invoke('save-queue', jobs),
  onProgress: (cb: any) => ipcRenderer.on('download-progress', (_e, d) => cb(d)),
  onLog: (cb: any) => ipcRenderer.on('download-log', (_e, d) => cb(d)),
  onDone: (cb: any) => ipcRenderer.on('download-done', (_e, d) => cb(d)),
  onError: (cb: any) => ipcRenderer.on('download-error', (_e, d) => cb(d)),
  onQueued: (cb: any) => ipcRenderer.on('download-queued', (_e, d) => cb(d)),
  onStarted: (cb: any) => ipcRenderer.on('download-started', (_e, d) => cb(d)),
  onCanceled: (cb: any) => ipcRenderer.on('download-canceled', (_e, d) => cb(d)),
  onPaused: (cb: any) => ipcRenderer.on('download-paused', (_e, d) => cb(d)),
  onSniffed: (cb: any) => ipcRenderer.on('sniffed-url', (_e, d) => cb(d)),
  onShowDownloadDialog: (cb: any) => ipcRenderer.on('show-download-dialog', (_e, d) => cb(d)),
  onOpenSniffItem: (cb: any) => ipcRenderer.on('open-sniff-item', (_e, d) => cb(d)),
  onSwitchToSniffTab: (cb: any) => ipcRenderer.on('switch-to-sniff-tab', (_e, d) => cb(d)),
  onSwitchToDownloadTab: (cb: any) => ipcRenderer.on('switch-to-download-tab', (_e, d) => cb(d)),
  openExtensionFolder: () => ipcRenderer.invoke('open-extension-folder'),
  exportExtensionZip: () => ipcRenderer.invoke('export-extension-zip'),
  getExtensionStatus: () => ipcRenderer.invoke('get-extension-status'),
  onExtensionStatus: (cb: any) => ipcRenderer.on('extension-status-changed', (_e, d) => cb(d)),
  getDiskSpace: (dirPath?: string) => ipcRenderer.invoke('get-disk-space', dirPath),
  queueDownload: (opts: any) => ipcRenderer.invoke('queue-download', opts),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  onClipboardUrl: (cb: any) => ipcRenderer.on('clipboard-url-detected', (_e, d) => cb(d)),
  minimizeDialog: () => ipcRenderer.invoke('minimize-dialog'),
  closeDialog: () => ipcRenderer.invoke('close-dialog'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  removeAll: () => {
    ipcRenderer.removeAllListeners('download-progress')
    ipcRenderer.removeAllListeners('download-log')
    ipcRenderer.removeAllListeners('download-done')
    ipcRenderer.removeAllListeners('download-error')
    ipcRenderer.removeAllListeners('download-queued')
    ipcRenderer.removeAllListeners('download-started')
    ipcRenderer.removeAllListeners('download-canceled')
    ipcRenderer.removeAllListeners('download-paused')
    ipcRenderer.removeAllListeners('sniffed-url')
    ipcRenderer.removeAllListeners('extension-status-changed')
    ipcRenderer.removeAllListeners('clipboard-url-detected')
  }
})
