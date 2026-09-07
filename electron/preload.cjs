const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('api', {
  analyzeUrl: (url) => ipcRenderer.invoke('analyze-url', url),
  startDownload: (opts) => ipcRenderer.invoke('start-download', opts),
  cancelDownload: (id) => ipcRenderer.invoke('cancel-download', id),
  pauseDownload: (id) => ipcRenderer.invoke('pause-download', id),
  resumeDownload: (id) => ipcRenderer.invoke('resume-download', id),
  retryDownload: (opts) => ipcRenderer.invoke('retry-download', opts),
  directDownload: (opts) => ipcRenderer.invoke('direct-download', opts),
  httpDownload: (opts) => ipcRenderer.invoke('http-download', opts),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  openFolder: (dir) => ipcRenderer.invoke('open-folder', dir),
  getDefaultDir: () => ipcRenderer.invoke('get-default-dir'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  listFiles: (mode, customDir) => ipcRenderer.invoke('list-files', mode, customDir),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  deleteFile: (payload) => ipcRenderer.invoke('delete-file', payload),
  checkFileExists: (filePath) => ipcRenderer.invoke('check-file-exists', filePath),
  removeFromHistory: (idOrPath) => ipcRenderer.invoke('remove-from-history', idOrPath),
  getConfig: () => ipcRenderer.invoke('get-config'),
  getDownloadDialogData: () => ipcRenderer.invoke('get-download-dialog-data'),
  setConfig: (patch) => ipcRenderer.invoke('set-config', patch),
  getYtDlpStatus: () => ipcRenderer.invoke('get-yt-dlp-status'),
  checkYtDlpUpdate: () => ipcRenderer.invoke('check-yt-dlp-update'),
  downloadYtDlp: () => ipcRenderer.invoke('download-yt-dlp'),
  sniffedUrl: (data) => ipcRenderer.invoke('sniffed-url', data),
  getQueue: () => ipcRenderer.invoke('get-queue'),
  saveQueue: (jobs) => ipcRenderer.invoke('save-queue', jobs),
  onProgress: (cb) => ipcRenderer.on('download-progress', (_e, d) => cb(d)),
  onLog: (cb) => ipcRenderer.on('download-log', (_e, d) => cb(d)),
  onDone: (cb) => ipcRenderer.on('download-done', (_e, d) => cb(d)),
  onError: (cb) => ipcRenderer.on('download-error', (_e, d) => cb(d)),
  onQueued: (cb) => ipcRenderer.on('download-queued', (_e, d) => cb(d)),
  onCanceled: (cb) => ipcRenderer.on('download-canceled', (_e, d) => cb(d)),
  onStarted: (cb) => ipcRenderer.on('download-started', (_e, d) => cb(d)),
  onPaused: (cb) => ipcRenderer.on('download-paused', (_e, d) => cb(d)),
  onSniffed: (cb) => ipcRenderer.on('sniffed-url', (_e, d) => cb(d)),
  onShowDownloadDialog: (cb) => ipcRenderer.on('show-download-dialog', (_e, d) => cb(d)),
  onOpenSniffItem: (cb) => ipcRenderer.on('open-sniff-item', (_e, d) => cb(d)),
  onSwitchToSniffTab: (cb) => ipcRenderer.on('switch-to-sniff-tab', (_e, d) => cb(d)),
  onSwitchToDownloadTab: (cb) => ipcRenderer.on('switch-to-download-tab', (_e, d) => cb(d)),
  openExtensionFolder: (browser) => ipcRenderer.invoke('open-extension-folder', browser),
  exportExtensionZip: (browser) => ipcRenderer.invoke('export-extension-zip', browser),
  getExtensionStatus: () => ipcRenderer.invoke('get-extension-status'),
  onExtensionStatus: (cb) => ipcRenderer.on('extension-status-changed', (_e, d) => cb(d)),
  getDiskSpace: (dirPath) => ipcRenderer.invoke('get-disk-space', dirPath),
  queueDownload: (opts) => ipcRenderer.invoke('queue-download', opts),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  onClipboardUrl: (cb) => ipcRenderer.on('clipboard-url-detected', (_e, d) => cb(d)),
  minimizeDialog: () => ipcRenderer.invoke('minimize-dialog'),
  closeDialog: () => ipcRenderer.invoke('close-dialog'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  pauseAllDownloads: () => ipcRenderer.invoke('pause-all-downloads'),
  resumeAllDownloads: () => ipcRenderer.invoke('resume-all-downloads'),
  setSpeedLimit: (limitKB) => ipcRenderer.invoke('set-speed-limit', limitKB),
  setPostDownloadAction: (action) => ipcRenderer.invoke('set-post-download-action', action),
  removeAll: () => {
    ipcRenderer.removeAllListeners('download-progress')
    ipcRenderer.removeAllListeners('download-log')
    ipcRenderer.removeAllListeners('download-done')
    ipcRenderer.removeAllListeners('download-error')
    ipcRenderer.removeAllListeners('download-queued')
    ipcRenderer.removeAllListeners('download-canceled')
    ipcRenderer.removeAllListeners('download-started')
    ipcRenderer.removeAllListeners('download-paused')
    ipcRenderer.removeAllListeners('sniffed-url')
    ipcRenderer.removeAllListeners('extension-status-changed')
    ipcRenderer.removeAllListeners('clipboard-url-detected')
  }
})
