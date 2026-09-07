import { app, BrowserWindow, ipcMain, dialog, shell, Notification, Tray, Menu } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import http from 'http'
import https from 'https'
import { fileURLToPath } from 'url'
import { WebSocketServer, WebSocket } from 'ws'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = !app.isPackaged && process.env.ELECTRON_IS_DEV !== '0'
let mainWindow: BrowserWindow | null = null
let downloadDialogWindow: BrowserWindow | null = null
let lastDownloadDialogData: any = null

function getAppIconPath(): string | undefined {
  const isWin = process.platform === 'win32'
  const iconNames = isWin ? ['icon.ico', 'icon.png', 'icon-256.png'] : ['icon.png', 'icon-256.png']
  const baseDirs = [
    path.join(process.cwd(), 'assets'),
    path.join(__dirname, '../../assets'),
    path.join(__dirname, '../assets'),
    path.join(app.getAppPath(), 'assets'),
    path.join(path.dirname(app.getPath('exe')), 'assets'),
    path.join(process.resourcesPath, 'assets')
  ]
  for (const dir of baseDirs) {
    for (const name of iconNames) {
      const p = path.join(dir, name)
      if (fs.existsSync(p)) return p
    }
  }
  return undefined
}

function normalizeToMasterPlaylist(url: string): string {
  if (!url || typeof url !== 'string') return url
  // molystream embed -> molystream hls playlist
  if (/molystream\.org\/embed\/([a-zA-Z0-9_-]+)($|\?)/i.test(url)) {
    return url.replace(/molystream\.org\/embed\/([a-zA-Z0-9_-]+)($|\?)/i, 'https://dbx.molystream.org/embed/$1/q/1')
  }
  // sublist*.txt or sublist*.m3u8 -> master.txt or master.m3u8
  if (/\/(?:txt\/)?[a-zA-Z0-9_.-]*sublist[a-zA-Z0-9_.-]*\.(txt|m3u8)/i.test(url)) {
    return url.replace(/\/(?:txt\/)?[a-zA-Z0-9_.-]*sublist[a-zA-Z0-9_.-]*\.(txt|m3u8).*/i, '/master.$1')
  }
  // tracks-v* or stream_video* or video_*.m3u8 -> master.m3u8
  if (/\/(?:tracks-[va]\d+|video_\d+|audio_\d+)\/[^/]+\.m3u8/i.test(url)) {
    return url.replace(/\/(?:tracks-[va]\d+|video_\d+|audio_\d+)\/[^/]+\.m3u8.*/i, '/master.m3u8')
  }
  return url
}

function createDownloadDialogWindow(sniffData: any) {
  if (sniffData && sniffData.url) {
    sniffData.url = normalizeToMasterPlaylist(sniffData.url)
  }
  lastDownloadDialogData = sniffData
  console.log('[VoltGet] createDownloadDialogWindow called for:', sniffData?.url?.slice(0, 70))

  if (downloadDialogWindow && !downloadDialogWindow.isDestroyed()) {
    if (downloadDialogWindow.isMinimized()) downloadDialogWindow.restore()
    downloadDialogWindow.show()
    downloadDialogWindow.focus()
    downloadDialogWindow.webContents.send('show-download-dialog', sniffData)
    return
  }

  let preloadPath = path.join(__dirname, 'preload.cjs')
  if (!fs.existsSync(preloadPath)) preloadPath = path.join(__dirname, 'preload.js')

  const appIcon = getAppIconPath()
  downloadDialogWindow = new BrowserWindow({
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
  })

  downloadDialogWindow.center()
  
  if (isDev) {
    downloadDialogWindow.loadURL('http://localhost:5173/download-dialog.html')
  } else {
    downloadDialogWindow.loadFile(path.join(__dirname, '../renderer/download-dialog.html'))
  }

  const showWindow = () => {
    if (downloadDialogWindow && !downloadDialogWindow.isDestroyed()) {
      if (downloadDialogWindow.isMinimized()) downloadDialogWindow.restore()
      downloadDialogWindow.show()
      downloadDialogWindow.focus()
      downloadDialogWindow.webContents.send('show-download-dialog', lastDownloadDialogData || sniffData)
    }
  }

  downloadDialogWindow.once('ready-to-show', showWindow)
  downloadDialogWindow.webContents.on('did-finish-load', showWindow)

  // Fallback: 400ms içinde pencere hala görünür olmadıysa zorla göster
  setTimeout(showWindow, 400)

  downloadDialogWindow.on('closed', () => {
    downloadDialogWindow = null
  })
}

ipcMain.handle('get-download-dialog-data', () => lastDownloadDialogData)
const activeDownloads = new Map<string, ChildProcess | { kill: ()=>void }>()
const activeOpts = new Map<string, any>()
const pendingQueue: Array<{ id:string, opts:any }> = []
const pausedDownloads = new Map<string, any>()
const pausingIds = new Set<string>()

function isValidExecutable(p: string): boolean {
  try {
    if (!p || !fs.existsSync(p)) return false
    const stat = fs.statSync(p)
    return stat.isFile() && stat.size > 20000 // Boş veya hasarlı 0-byte dosyaları reddet (en az 20KB)
  } catch {
    return false
  }
}

function resolveYtDlpPath(): string {
  // 1. Paketlenmiş veya yerel bin klasörünü kontrol et
  const bundled = path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..'), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
  if (isValidExecutable(bundled)) return bundled

  const projectBin = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
  if (isValidExecutable(projectBin)) return projectBin

  const rootBin = path.join(__dirname, '..', '..', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
  if (isValidExecutable(rootBin)) return rootBin

  // 2. Sistem PATH üzerinden where.exe (Windows) veya which (Unix) ile tam yolu bul
  try {
    const { execSync } = require('child_process')
    const cmd = process.platform === 'win32' ? 'where.exe yt-dlp' : 'which yt-dlp'
    const out = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const lines = out.split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && isValidExecutable(trimmed)) {
        return trimmed
      }
    }
  } catch {}

  // 3. Yaygın Windows Python Scripts dizinleri ve Chocolatey
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Python313\\Scripts\\yt-dlp.exe',
      'C:\\Python312\\Scripts\\yt-dlp.exe',
      'C:\\Python311\\Scripts\\yt-dlp.exe',
      'C:\\Python310\\Scripts\\yt-dlp.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
      'C:\\ProgramData\\chocolatey\\bin\\yt-dlp.exe'
    ]
    for (const cand of candidates) {
      if (isValidExecutable(cand)) return cand
    }
  }

  return 'yt-dlp'
}

let ytDlpPath = resolveYtDlpPath()
if (ytDlpPath && ytDlpPath !== 'yt-dlp' && fs.existsSync(ytDlpPath)) {
  const ytDlpDir = path.dirname(ytDlpPath)
  if (!process.env.PATH?.includes(ytDlpDir)) {
    process.env.PATH = `${ytDlpDir}${path.delimiter}${process.env.PATH || ''}`
  }
}

function resolveFfmpegPath(): string {
  // 1. Paketlenmiş veya yerel bin klasörünü kontrol et
  const bundled = path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..'), 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  if (fs.existsSync(bundled)) return bundled

  // 2. Sistem PATH üzerinden where.exe (Windows) veya which (Unix) ile tam yolu bul
  try {
    const { execSync } = require('child_process')
    const cmd = process.platform === 'win32' ? 'where.exe ffmpeg' : 'which ffmpeg'
    const out = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const firstLine = out.split(/\r?\n/)[0]?.trim()
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine
    }
  } catch {}

  // 3. Yaygın Windows paket yöneticisi dizinlerini tara (WinGet, Program Files, Chocolatey)
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || ''
    const wingetSearch = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages')
    if (fs.existsSync(wingetSearch)) {
      try {
        const dirs = fs.readdirSync(wingetSearch)
        for (const dir of dirs) {
          if (dir.toLowerCase().includes('ffmpeg')) {
            const candidateBin = path.join(wingetSearch, dir)
            const subdirs = fs.readdirSync(candidateBin)
            for (const sub of subdirs) {
              const exe = path.join(candidateBin, sub, 'bin', 'ffmpeg.exe')
              if (fs.existsSync(exe)) return exe
            }
          }
        }
      } catch {}
    }
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ffmpeg', 'bin', 'ffmpeg.exe'),
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe'
    ]
    for (const cand of candidates) {
      if (fs.existsSync(cand)) return cand
    }
  }

  return 'ffmpeg'
}
const ffmpegPath = resolveFfmpegPath()
// ffmpeg dizinini process.env.PATH başına ekle ki tüm alt süreçler bulsun
if (ffmpegPath && ffmpegPath !== 'ffmpeg' && fs.existsSync(ffmpegPath)) {
  const ffmpegDir = path.dirname(ffmpegPath)
  if (!process.env.PATH?.includes(ffmpegDir)) {
    process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH || ''}`
  }
}
function hasFfmpeg(): boolean {
  try{ const {execSync}=require('child_process'); execSync(`"${ffmpegPath}" -version`,{stdio:'ignore'}); return true }catch{ return false }
}

// ---- Config & Queue Persistence ----
type AppConfig = {
  concurrent: number
  speedLimitKB: number // 0 = unlimited
  siteFolders: boolean
  filenameTemplate: string // e.g. %(title)s.%(ext)s
  autoUpdateCheck: boolean
  sniffNotifications: boolean
  sniffDebounceMs: number
  theme: 'dark' | 'light'
  accentColor: 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'red' | 'teal'
  language: 'tr' | 'en' | 'de' | 'es' | 'ru' | 'ar'
  interceptBrowserDownloads: boolean
  captureMediaRequests: boolean
  captureDocuments: boolean
  captureArchives: boolean
  captureInstallers: boolean
  openAtLogin: boolean
  startMinimized: boolean
  closeToTray: boolean
  minimizeToTray: boolean
  clipboardWatcher: boolean
}
const defaultConfig: AppConfig = { concurrent: 3, speedLimitKB: 0, siteFolders: true, filenameTemplate: '%(title)s.%(ext)s', autoUpdateCheck: true, sniffNotifications: true, sniffDebounceMs: 8000, theme: 'dark', accentColor: 'blue', language: 'tr', interceptBrowserDownloads: true, captureMediaRequests: true, captureDocuments: true, captureArchives: true, captureInstallers: true, openAtLogin: false, startMinimized: false, closeToTray: true, minimizeToTray: false, clipboardWatcher: true }
function configPath(){ return path.join(app.getPath('userData'), 'config.json') }
function queuePath(){ return path.join(app.getPath('userData'), 'queue.json') }
function loadConfig(): AppConfig {
  try { if (fs.existsSync(configPath())) return { ...defaultConfig, ...JSON.parse(fs.readFileSync(configPath(),'utf-8')) } } catch {}
  return { ...defaultConfig }
}
function saveConfig(c:AppConfig){ try{ ensureDir(path.dirname(configPath())); fs.writeFileSync(configPath(), JSON.stringify(c,null,2)) }catch(e){ console.error(e)} }
let appConfig = loadConfig()

function getDefaultDownloadDir() {
  try {
    const c = loadConfig()
    // @ts-ignore custom outDir in config
    if ((c as any).customOutDir && fs.existsSync((c as any).customOutDir)) return (c as any).customOutDir
  } catch {}
  const legacyDir = path.join(os.homedir(), 'Downloads', 'Flexplorer')
  const modernDir = path.join(os.homedir(), 'Downloads', 'VoltGet')
  if (fs.existsSync(legacyDir)) return legacyDir
  return modernDir
}
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}
function detectSite(url:string){
  try{
    const h=new URL(url).hostname
    if(h.includes('youtube.com')||h.includes('youtu.be')) return 'YouTube'
    if(h.includes('tiktok.com')) return 'TikTok'
    if(h.includes('instagram.com')) return 'Instagram'
    if(h.includes('twitter.com')||h.includes('x.com')||h.includes('t.co')) return 'X-Twitter'
    if(h.includes('facebook.com')||h.includes('fbcdn')) return 'Facebook'
    if(h.includes('soundcloud.com')) return 'SoundCloud'
    if(h.includes('vimeo.com')) return 'Vimeo'
    if(h.includes('twitch.tv')) return 'Twitch'
    return 'Diger'
  }catch{ return 'Diger' }
}
function getSiteFolder(base:string, url:string){
  if(!appConfig.siteFolders) return base
  return path.join(base, detectSite(url))
}
function saveQueue(jobs:any[]){
  try{ fs.writeFileSync(queuePath(), JSON.stringify(jobs.slice(0,50),null,2)) }catch{}
}
function loadQueue():any[] {
  try{ if(fs.existsSync(queuePath())) return JSON.parse(fs.readFileSync(queuePath(),'utf-8')) }catch{}
  return []
}

interface DownloadHistoryItem {
  id: string
  url: string
  title: string
  fileName: string
  filePath: string
  fileSize: number
  date: number
  category: 'video' | 'audio' | 'document' | 'archive' | 'installer' | 'other'
}

function historyPath() { return path.join(app.getPath('userData'), 'download_history.json') }

function loadHistory(): DownloadHistoryItem[] {
  try {
    if (fs.existsSync(historyPath())) return JSON.parse(fs.readFileSync(historyPath(), 'utf-8'))
  } catch {}
  return []
}

function saveHistory(items: DownloadHistoryItem[]) {
  try {
    ensureDir(path.dirname(historyPath()))
    fs.writeFileSync(historyPath(), JSON.stringify(items.slice(0, 500), null, 2))
  } catch (e) { console.error(e) }
}

function getCategoryFromExt(extWithOrWithoutDot: string): DownloadHistoryItem['category'] {
  const ext = (extWithOrWithoutDot || '').replace(/^\./, '').toLowerCase()
  if (['mp4','mkv','webm','avi','mov','flv','ts','m4v'].includes(ext)) return 'video'
  if (['mp3','m4a','flac','wav','aac','ogg','wma'].includes(ext)) return 'audio'
  if (['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','epub','csv'].includes(ext)) return 'document'
  if (['zip','rar','7z','tar','gz','iso','torrent'].includes(ext)) return 'archive'
  if (['exe','msi','apk','dmg','deb','rpm'].includes(ext)) return 'installer'
  return 'other'
}

function addDownloadToHistory(item: Partial<DownloadHistoryItem> & { id: string, filePath: string }) {
  const list = loadHistory()
  const fileName = item.fileName || path.basename(item.filePath)
  const category = item.category || getCategoryFromExt(path.extname(item.filePath))
  let fileSize = item.fileSize || 0
  if (!fileSize && fs.existsSync(item.filePath)) {
    try { fileSize = fs.statSync(item.filePath).size } catch {}
  }
  const existingIdx = list.findIndex(x => x.id === item.id || (x.filePath && x.filePath.toLowerCase() === item.filePath.toLowerCase()))
  const entry: DownloadHistoryItem = {
    id: item.id,
    url: item.url || '',
    title: item.title || fileName,
    fileName,
    filePath: item.filePath,
    fileSize,
    date: item.date || Date.now(),
    category
  }
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...entry }
  } else {
    list.unshift(entry)
  }
  saveHistory(list)
  return entry
}

function removeDownloadFromHistory(idOrPath: string) {
  const list = loadHistory()
  const filtered = list.filter(x => x.id !== idOrPath && x.filePath !== idOrPath)
  saveHistory(filtered)
  return filtered
}

function syncHistoryFromQueue() {
  try {
    const q = loadQueue()
    let changed = false
    const h = loadHistory()
    for (const job of q) {
      if (job.status === 'done') {
        const fp = job.filePath || job.opts?.outPath || (job.opts?.filename && job.opts?.outDir ? path.join(job.opts.outDir, job.opts.filename) : '')
        if (fp && !h.some(x => x.id === job.id || (x.filePath && x.filePath.toLowerCase() === fp.toLowerCase()))) {
          let sz = 0
          if (fs.existsSync(fp)) {
            try { sz = fs.statSync(fp).size } catch {}
          }
          const fn = job.opts?.filename || path.basename(fp)
          h.push({
            id: job.id,
            url: job.url || job.opts?.url || '',
            title: job.title || fn,
            fileName: fn,
            filePath: fp,
            fileSize: sz,
            date: Date.now(),
            category: getCategoryFromExt(path.extname(fp))
          })
          changed = true
        }
      }
    }
    if (changed) saveHistory(h)
  } catch {}
}

let tray: Tray | null = null
let isQuitting = false

function createTray() {
  if (tray) return
  const isWin = process.platform === 'win32'
  const trayIconPath = isWin
    ? (getAppIconPath() || path.join(process.cwd(), 'assets', 'icon-16.png'))
    : (path.join(process.cwd(), 'assets', 'icon-16.png'))

  if (!trayIconPath || !fs.existsSync(trayIconPath)) return

  try {
    tray = new Tray(trayIconPath)
    tray.setToolTip('VoltGet - Ultra Hızlı İndirme Yöneticisi')

    const updateTrayMenu = () => {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: '⚡ VoltGet\'i Göster',
          click: () => {
            if (mainWindow) {
              if (mainWindow.isMinimized()) mainWindow.restore()
              mainWindow.show()
              mainWindow.focus()
            }
          }
        },
        {
          label: '📥 İndirmeler Sekmesi',
          click: () => {
            if (mainWindow) {
              if (mainWindow.isMinimized()) mainWindow.restore()
              mainWindow.show()
              mainWindow.focus()
              mainWindow.webContents.send('switch-to-download-tab')
            }
          }
        },
        { type: 'separator' },
        {
          label: appConfig.clipboardWatcher ? '📋 Pano İzleyici: Açık' : '📋 Pano İzleyici: Kapalı',
          type: 'checkbox',
          checked: !!appConfig.clipboardWatcher,
          click: (menuItem) => {
            appConfig.clipboardWatcher = menuItem.checked
            saveConfig(appConfig)
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('config-changed', appConfig)
            }
            updateTrayMenu()
          }
        },
        {
          label: '⚙️ Ayarlar',
          click: () => {
            if (mainWindow) {
              if (mainWindow.isMinimized()) mainWindow.restore()
              mainWindow.show()
              mainWindow.focus()
              mainWindow.webContents.send('switch-to-settings-tab')
            }
          }
        },
        { type: 'separator' },
        {
          label: '🚪 VoltGet\'ten Çıkış',
          click: () => {
            isQuitting = true
            app.quit()
          }
        }
      ])
      tray?.setContextMenu(contextMenu)
    }

    updateTrayMenu()

    tray.on('double-click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.focus()
        } else {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    })

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
          mainWindow.hide()
        } else {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
        }
      }
    })
  } catch (err) {
    console.error('[VoltGet] Failed to initialize system tray:', err)
  }
}

function createWindow() {
  let preloadPath = path.join(__dirname, 'preload.cjs')
  if (!fs.existsSync(preloadPath)) preloadPath = path.join(__dirname, 'preload.js')
  const appIcon = getAppIconPath()
  const shouldStartHidden = appConfig.startMinimized || process.argv.includes('--hidden')

  mainWindow = new BrowserWindow({
    width: 1220, height: 760, minWidth: 1020, minHeight: 620, backgroundColor: '#0a0a0f', title: 'VoltGet - Ultra Hızlı İndirme Yöneticisi', icon: appIcon,
    show: !shouldStartHidden,
    webPreferences: { preload: preloadPath, nodeIntegration: false, contextIsolation: true, sandbox: false }, autoHideMenuBar: true,
  })
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(() => mainWindow?.loadFile(path.join(__dirname, '../renderer/index.html')))
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
  mainWindow.webContents.on('did-finish-load', () => {
    broadcastExtensionStatus()
  })

  // Kapatınca tepsiye küçült (closeToTray)
  mainWindow.on('close', (e) => {
    if (!isQuitting && appConfig.closeToTray) {
      e.preventDefault()
      mainWindow?.hide()
      return false
    }
  })

  // Küçültünce tepsiye gizle (minimizeToTray)
  mainWindow.on('minimize', () => {
    if (appConfig.minimizeToTray) {
      mainWindow?.hide()
    }
  })
}

let sniffServer: http.Server | null = null
let wss: WebSocketServer | null = null
const sniffLastNotify = new Map<string, number>()
function notifyKeyFor(data:any){
  try{
    const u = new URL(data.pageUrl || data.url)
    return u.hostname.replace('www.','') + '|' + (data.type || 'media')
  }catch{ return (data.pageUrl || data.url || 'unknown') + '|' + (data.type||'media') }
}
function shouldNotifySniff(key:string){
  if(!loadConfig().sniffNotifications) return false
  const debounce = Math.max(loadConfig().sniffDebounceMs || 8000, 10000)
  const now=Date.now()
  const last=sniffLastNotify.get(key)||0
  if(now-last < debounce) return false
  sniffLastNotify.set(key, now)
  return true
}

let lastExtensionActivity = 0

function getExtensionConnectedCount(): number {
  if (!wss) return 0
  let count = 0
  wss.clients.forEach((c: any) => {
    if (c.readyState === 1 /* OPEN */) count++
  })
  return count
}

function broadcastExtensionStatus() {
  const count = getExtensionConnectedCount()
  const isRecent = (Date.now() - lastExtensionActivity) < 60000
  const isConnected = count > 0 || isRecent
  const status = { connected: isConnected, count: Math.max(count, isConnected ? 1 : 0) }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('extension-status-changed', status)
  }
}

function startSniffServer() {
  if (sniffServer) return
  sniffServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }
    if (req.url === '/sniff' && req.method === 'POST') {
      let body=''; req.on('data', c=> body+=c); req.on('end', async ()=>{
        try{
          lastExtensionActivity = Date.now()
          broadcastExtensionStatus()
          const data = JSON.parse(body)
          await handleIncomingSniff(data)
          res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true}))
        }catch(e:any){ res.writeHead(400); res.end(String(e)) }
      }); return
    }
    if (req.url === '/status'){
      lastExtensionActivity = Date.now()
      broadcastExtensionStatus()
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:true, app:'VoltGet', sniff:true, extensionConnected: true}));
      return
    }
    res.writeHead(404); res.end('not found')
  })
  sniffServer.listen(8765,'127.0.0.1',()=>{
    console.log('[VoltGet] sniff server http://127.0.0.1:8765/sniff')
    wss = new WebSocketServer({ server: sniffServer! });
    wss.on('connection', ws => {
      lastExtensionActivity = Date.now()
      console.log('[VoltGet] WebSocket connected');
      broadcastExtensionStatus();
      ws.on('message', async (message: string) => {
        try {
          lastExtensionActivity = Date.now()
          const msg = JSON.parse(message.toString());
          if (msg.type === 'ping') {
            try { ws.send(JSON.stringify({ type: 'pong' })) } catch {}
            broadcastExtensionStatus();
            return
          }
          if (msg.type === 'sniffed-url') {
            await handleIncomingSniff(msg.data);
          }
        } catch (e: any) {
          console.error('[VoltGet] WebSocket message error', e);
        }
      });
      ws.on('close', () => {
        console.log('[VoltGet] WebSocket disconnected');
        broadcastExtensionStatus();
      });
      ws.on('error', (e: Error) => {
        console.error('[VoltGet] WebSocket error', e);
        broadcastExtensionStatus();
      });
    });
  })
  sniffServer.on('error',(e:any)=> console.error('[sniff server]',e.message))
}

function isMasterPlaylistUrl(u: string): boolean {
  if (!u || typeof u !== 'string') return false
  return /master\.(txt|m3u8)|manifest\.mpd|\/q\/\d+/i.test(u) ||
         (/(playlist|index)\.m3u8/i.test(u) && !/(?:video|audio|_vid|_aud|tracks-v)/i.test(u))
}

function isStreamUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  return /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|mov|flv)($|\?)/i.test(url) ||
         url.includes('/q/') ||
         url.includes('master.txt') ||
         url.includes('/hls/') ||
         url.includes('playmix') ||
         url.includes('cdnimages') ||
         url.includes('videoplayback') ||
         url.includes('googlevideo.com')
}

function isPlayerOrEmbedUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  if (isStreamUrl(url)) return false
  if (/\.(zip|rar|7z|tar|gz|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(url)) return false
  return /\/(embed|player|oynat|video\/embed|iframe)\//i.test(url) ||
         url.includes('rapidrame_id') ||
         /\.(html|htm|php|asp|aspx)($|\?)/i.test(url)
}

const recentStreamsByPage = new Map<string, string>()

async function handleIncomingSniff(data: any) {
  if (data && data.url) {
    data.url = normalizeToMasterPlaylist(data.url)
  }
  const sniffId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const sniffData = { ...data, sniffId, time: new Date().toLocaleTimeString() }

  // 1. Gerçek medya akışını (m3u8, mpd, master.txt, mp4, /q/) hafızaya al (Master olanları alt parçaların ezmesini engelle)
  if (sniffData.url && isStreamUrl(sniffData.url)) {
    const isMaster = isMasterPlaylistUrl(sniffData.url)
    const existingLatest = recentStreamsByPage.get('latest')
    if (isMaster || !existingLatest || !isMasterPlaylistUrl(existingLatest)) {
      recentStreamsByPage.set('latest', sniffData.url)
    }
    if (sniffData.pageUrl) {
      const existingPage = recentStreamsByPage.get(sniffData.pageUrl)
      if (isMaster || !existingPage || !isMasterPlaylistUrl(existingPage)) {
        recentStreamsByPage.set(sniffData.pageUrl, sniffData.url)
      }
      try {
        const u = new URL(sniffData.pageUrl)
        const cleanHost = u.hostname.replace(/^www\./i, '').toLowerCase()
        const existingHost = recentStreamsByPage.get(cleanHost)
        if (isMaster || !existingHost || !isMasterPlaylistUrl(existingHost)) {
          recentStreamsByPage.set(cleanHost, sniffData.url)
          recentStreamsByPage.set(u.hostname, sniffData.url)
        }
      } catch {}
    }
    if (sniffData.url) {
      try {
        const u = new URL(sniffData.url)
        const cleanHost = u.hostname.replace(/^www\./i, '').toLowerCase()
        const existingHost = recentStreamsByPage.get(cleanHost)
        if (isMaster || !existingHost || !isMasterPlaylistUrl(existingHost)) {
          recentStreamsByPage.set(cleanHost, sniffData.url)
        }
      } catch {}
    }
  }

  // 2. Ana pencere ve açık olan WebSocket istemcilerine gönder (Yakalayıcı listesinde görünsün)
  if (wss) {
    wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'sniffed-url', data: sniffData }))
      }
    })
  }
  if (mainWindow) {
    mainWindow.webContents.send('sniffed-url', sniffData)
  }

  // 3. IDM Davranışı: Kullanıcı video üstü butona bastıysa VEYA tarayıcıda dosya indirmesi başladıysa pencere aç!
  if (data.userInitiated || data.isGenericDownload) {
    let resolvedUrl = data.url
    const isVideoPortal = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(data.pageUrl || '') ||
                          /youtube\.com|youtu\.be|googlevideo\.com/i.test(resolvedUrl || '')
    if (isVideoPortal && data.pageUrl && /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(data.pageUrl)) {
      resolvedUrl = data.pageUrl
      data.url = data.pageUrl
    } else if (resolvedUrl && isPlayerOrEmbedUrl(resolvedUrl)) {
      const pageHost = (() => { try { return new URL(data.pageUrl).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' } })()
      const urlHost = (() => { try { return new URL(data.url).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' } })()
      const matched = recentStreamsByPage.get(data.pageUrl) ||
                      recentStreamsByPage.get(data.url) ||
                      (pageHost ? recentStreamsByPage.get(pageHost) : null) ||
                      (urlHost ? recentStreamsByPage.get(urlHost) : null) ||
                      recentStreamsByPage.get('latest')
      if (matched && isStreamUrl(matched)) {
        console.log('[VoltGet] mapped embed/player page to real stream:', matched)
        resolvedUrl = matched
        data.url = matched
      }
    }

    // Web scripti veya stillerini indirme penceresinde açma
    if (/\.(js|mjs|cjs|jsx|ts|tsx|css|scss|map)($|\?)/i.test(resolvedUrl) ||
        /\.(js|mjs|cjs|jsx|ts|tsx|css|scss|map)($|\?)/i.test(data.filename || '')) {
      console.log('[VoltGet] Ignored web script in sniff handler:', resolvedUrl)
      return
    }

    const isGen = /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(resolvedUrl) ||
                  /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(data.filename || '') ||
                  data.isGenericDownload || data.type === 'file'

    const initialTitle = data.filename || data.title || resolvedUrl.split('/').pop()?.split('?')[0] || (isGen ? 'Dosya' : 'Video')
    
    // ANINDA kullanılabilir varsayılan formatlar
    const defaultFormats = isGen || resolvedUrl.endsWith('.pdf') ? [] : [
      { id: 'best', resolution: '🎬 En İyi Kalite (Önerilen)', ext: 'mp4', note: 'Otomatik En Yüksek Kalite' },
      { id: 'bestvideo[height<=2160]+bestaudio/best[height<=2160]/best', resolution: '🎬 4K Ultra HD (2160p)', ext: 'mp4', note: 'Ultra HD' },
      { id: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best', resolution: '🎬 1080p Full HD', ext: 'mp4', note: 'Full HD' },
      { id: 'bestvideo[height<=720]+bestaudio/best[height<=720]/best', resolution: '🎬 720p HD', ext: 'mp4', note: 'Standart HD' },
      { id: 'bestvideo[height<=480]+bestaudio/best[height<=480]/best', resolution: '🎬 480p SD', ext: 'mp4', note: 'Hızlı İndirme' },
      { id: 'bestaudio/best', resolution: '🎵 MP3 / Sadece Ses', ext: 'mp3', note: 'En Yüksek Ses Kalitesi' }
    ]

    const initialData = {
      ...data,
      url: resolvedUrl,
      formats: defaultFormats,
      selectedFormat: data.asAudio ? 'bestaudio/best' : 'best',
      title: initialTitle,
      loading: !isGen && !resolvedUrl.endsWith('.pdf')
    }

    // ANINDA PENCEREYİ AÇ (IDM gibi doğrudan ekrana fırlatılır!)
    createDownloadDialogWindow(initialData)

    // Arka planda kaliteleri analiz et ve pencereye ilet:
    if (!isGen && !resolvedUrl.endsWith('.pdf')) {
      const isYT = /youtube\.com|youtu\.be|googlevideo\.com/i.test(resolvedUrl) || (data.pageUrl && /youtube\.com|youtu\.be/i.test(data.pageUrl))
      const target = isYT && data.pageUrl && /youtube\.com|youtu\.be/i.test(data.pageUrl) ? data.pageUrl : resolvedUrl
      const waitTime = isYT ? 10000 : 3500
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), waitTime))
      
      Promise.race([analyzeUrl(target), timeoutPromise]).then((res: any) => {
        const enrichedFormats = (res?.formats && res.formats.length > 0) ? res.formats : defaultFormats
        const analyzed = {
          ...initialData,
          ...(res || {}),
          formats: enrichedFormats,
          selectedFormat: data.asAudio ? (enrichedFormats.find((f: any) => f.isAudioOnly)?.id || 'bestaudio/best') : (enrichedFormats[0]?.id || 'best'),
          loading: false
        }
        lastDownloadDialogData = analyzed
        if (downloadDialogWindow && !downloadDialogWindow.isDestroyed()) {
          downloadDialogWindow.webContents.send('show-download-dialog', analyzed)
        }
      }).catch(err => {
        console.warn('[VoltGet] analyze warning/timeout, using default formats:', err?.message || err)
        const fallback = {
          ...initialData,
          loading: false,
          formats: defaultFormats
        }
        lastDownloadDialogData = fallback
        if (downloadDialogWindow && !downloadDialogWindow.isDestroyed()) {
          downloadDialogWindow.webContents.send('show-download-dialog', fallback)
        }
      })
    }
    return
  }
  // Video arka plan yakalamalarında masaüstüne bildirim atılmaz (Kullanıcı isteği doğrultusunda sessiz çalışır)
}

app.setName('VoltGet')
if (process.platform === 'win32') {
  app.setAppUserModelId('com.voltget.app')
}

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.log('[VoltGet] Another instance is already running. Focusing existing window...')
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  function isDownloadableUrl(text: string): boolean {
    if (!text || typeof text !== 'string') return false
    text = text.trim()
    if (!text.startsWith('http://') && !text.startsWith('https://')) return false
    if (text.length > 2000) return false
    const videoSites = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|reddit\.com|vimeo\.com|dailymotion\.com|twitch\.tv|ddizi|dizibox|hdfilmcehennemi/i
    const mediaExts = /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|mov|flv|zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i
    return videoSites.test(text) || mediaExts.test(text)
  }

  let lastClipboardText = ''
  function startClipboardWatcher() {
    setInterval(() => {
      try {
        if (!appConfig.clipboardWatcher) return
        const { clipboard } = require('electron')
        const text = clipboard.readText().trim()
        if (!text || text === lastClipboardText) return
        lastClipboardText = text
        if (isDownloadableUrl(text)) {
          console.log('[VoltGet] Clipboard media URL detected:', text.slice(0, 70))
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('clipboard-url-detected', { url: text })
          }
        }
      } catch {}
    }, 1200)
  }

  app.whenReady().then(() => {
    ensureDir(getDefaultDownloadDir())
    try {
      app.setLoginItemSettings({
        openAtLogin: !!appConfig.openAtLogin,
        openAsHidden: !!appConfig.startMinimized,
        path: process.execPath,
        args: appConfig.startMinimized ? ['--hidden'] : []
      })
    } catch {}
    startSniffServer()
    createWindow()
    createTray()
    startClipboardWatcher()
  })

  app.on('window-all-closed', () => {
    if (!appConfig.closeToTray) {
      try{ wss?.close(); sniffServer?.close()}catch{};
      if (process.platform !== 'darwin') app.quit()
    }
  })
  app.on('before-quit', () => {
    isQuitting = true
    try{ wss?.close(); sniffServer?.close()}catch{}
  })
}

function findYtDlp(): string {
  if (isValidExecutable(ytDlpPath)) return ytDlpPath
  const refreshed = resolveYtDlpPath()
  if (isValidExecutable(refreshed)) {
    ytDlpPath = refreshed
    return refreshed
  }
  return 'yt-dlp'
}
function parseYtDlpJson(out: string): any {
  const lines = out.split('\n').map(l=> l.trim()).filter(Boolean)
  const jsonLine = lines.find(l=> l.startsWith('{')) || lines[0]
  if (!jsonLine) throw new Error('yt-dlp boş çıktı döndürdü')
  return JSON.parse(jsonLine)
}

// Standalone analiz fonksiyonu (IPC handler ve sniff server içinden çağrılabilir)
async function analyzeUrl(url: string): Promise<any> {
  let normUrl = normalizeToMasterPlaylist(url)
  if (isPlayerOrEmbedUrl(normUrl)) {
    const matched = recentStreamsByPage.get(normUrl) || recentStreamsByPage.get('latest')
    if (matched && isStreamUrl(matched)) {
      normUrl = matched
    }
  }

  if (normUrl.includes('master.txt') || normUrl.includes('.m3u8') || normUrl.includes('/hls/') || normUrl.includes('playmix') || normUrl.includes('cdnimages') || normUrl.includes('/q/') || normUrl.includes('molystream')) {
    const fn = normUrl.split('/').slice(-2, -1)[0] || normUrl.split('/').pop()?.split('?')[0] || 'HLS Video Akışı'
    return {
      title: fn.replace(/\.mp4$/i, ''),
      thumbnail: '',
      duration: 0,
      uploader: 'HLS Stream',
      extractor: 'generic:hls',
      formats: [
        { id: 'best', resolution: '🎬 En İyi Kalite (Hızlı İndir)', ext: 'mp4', height: 1080, tbr: 0, filesize: 0, note: 'Otomatik Önerilen' },
        { id: 'bestaudio/best', resolution: '🎵 Sadece Ses (MP3)', ext: 'mp3', height: 0, tbr: 0, filesize: 0, isAudioOnly: true, note: 'Ses Akışı' }
      ],
      videoFormats: [{ id: 'best', resolution: '🎬 En İyi Kalite (Hızlı İndir)', ext: 'mp4', height: 1080, note: 'HLS Akışı' }],
      audioFormats: [{ id: 'bestaudio/best', resolution: '🎵 Sadece Ses (MP3)', ext: 'mp3', height: 0, isAudioOnly: true, note: 'MP3' }]
    }
  }
  const isDirectFile = /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(normUrl)
  if (isDirectFile) {
    const fn = normUrl.split('/').pop()?.split('?')[0] || 'İndirilen Dosya'
    return {
      title: fn,
      thumbnail: '',
      duration: 0,
      uploader: 'Doğrudan İndirme',
      extractor: 'http',
      formats: [
        { id: 'direct', resolution: 'Dosya İndirme', ext: fn.split('.').pop() || 'bin', height: 0, tbr: 0, filesize: 0, note: '8 Parçalı Hızlı İndirme' }
      ],
      videoFormats: [],
      audioFormats: []
    }
  }

  const isYouTube = /youtube\.com|youtu\.be/i.test(normUrl)
  const ytdlp = findYtDlp()
  const args = [
    '--dump-json',
    '--no-playlist',
    '--js-runtimes', 'node',
    '--remote-components', 'ejs:github',
    '--no-warnings'
  ]
  if (!isYouTube) {
    args.push('--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
  }
  args.push(normUrl)
  return new Promise((resolve, reject) => {
    let proc: ChildProcess
    try {
      proc = spawn(ytdlp, args, { shell: false, windowsHide: true })
    } catch (e: any) {
      console.warn('[VoltGet] analyzeUrl primary spawn failed, trying fallback:', e.message)
      try {
        proc = spawn('yt-dlp', args, { shell: false, windowsHide: true })
      } catch (e2: any) {
        proc = spawn('yt-dlp', args, { shell: true, windowsHide: true })
      }
    }
    let out = '', err = ''
    proc.stdout?.on('data', (d: Buffer) => out += d.toString('utf-8'))
    proc.stderr?.on('data', (d: Buffer) => err += d.toString('utf-8'))
    proc.on('close', code => {
      if (code === 0) {
        try { resolve(parseInfo(parseYtDlpJson(out))) }
        catch (e: any) { reject(`JSON parse hatası: ${e.message}\nÇıktı: ${out.slice(0, 800)}\nHata: ${err.slice(0, 800)}`) }
      } else {
        reject(`${err.slice(0, 1500) || `yt-dlp çıkış kodu ${code}`}\nKomut: ${ytdlp} ${args.join(' ')}`)
      }
    })
    proc.on('error', (e: any) => reject(`yt-dlp çalıştırılamadı: ${e.message}\nYol: ${ytdlp}`))
  })
}

ipcMain.handle('analyze-url', async (_e, rawUrl: string) => {
  const url = normalizeToMasterPlaylist(rawUrl)
  return analyzeUrl(url)
})
function parseInfo(info:any){
  const rawFormats = info.formats || []
  const videoFormats: any[] = []
  const audioFormats: any[] = []

  rawFormats.forEach((f:any) => {
    const isAudioOnly = (f.vcodec === 'none' || !f.vcodec) && f.acodec !== 'none'
    const isVideo = f.vcodec && f.vcodec !== 'none'
    const item = {
      id: f.format_id,
      ext: f.ext,
      resolution: f.resolution || (f.height ? `${f.width}x${f.height}` : 'Audio Only'),
      height: f.height || 0,
      fps: f.fps || 0,
      vcodec: f.vcodec,
      acodec: f.acodec,
      filesize: f.filesize || f.filesize_approx || 0,
      tbr: f.tbr || 0,
      isAudioOnly,
      note: f.format_note || (isAudioOnly ? 'Ses Akışı' : '')
    }
    if (isAudioOnly) {
      audioFormats.push(item)
    } else if (isVideo) {
      videoFormats.push(item)
    }
  })

  videoFormats.sort((a,b) => (b.height - a.height) || (b.tbr - a.tbr))
  audioFormats.sort((a,b) => (b.tbr - a.tbr) || (b.filesize - a.filesize))

  return {
    title: info.title,
    thumbnail: info.thumbnail,
    duration: info.duration,
    uploader: info.uploader,
    extractor: info.extractor,
    webpage_url: info.webpage_url,
    description: (info.description||'').slice(0,500),
    formats: [...videoFormats, ...audioFormats],
    videoFormats,
    audioFormats,
    best: videoFormats[0] || audioFormats[0]
  }
}

// queue helpers
function canStart(){ return activeDownloads.size < appConfig.concurrent }
function processPending(){
  if(!canStart() || pendingQueue.length===0) return
  const next = pendingQueue.shift()!
  doStartDownload(next.id, next.opts)
}
function doStartDownload(id:string, opts:any){
  let finalUrl = normalizeToMasterPlaylist(opts.url || '')
  opts.url = finalUrl

  const isYouTube = /youtube\.com|youtu\.be|googlevideo\.com/i.test(finalUrl) ||
                    (opts.pageUrl && /youtube\.com|youtu\.be/i.test(opts.pageUrl))

  if (isYouTube) {
    if (opts.pageUrl && /youtube\.com|youtu\.be/i.test(opts.pageUrl)) {
      finalUrl = opts.pageUrl
      opts.url = opts.pageUrl
    } else if (finalUrl.includes('googlevideo.com')) {
      // Find matching youtube page from recentStreamsByPage
      for (const [key] of recentStreamsByPage.entries()) {
        if (/youtube\.com\/watch|youtu\.be\//i.test(key)) {
          finalUrl = key
          opts.url = key
          break
        }
      }
    }
  }

  // 1. Embed veya oynatıcı sayfası geldiyse hafızadaki gerçek akış URL'si ile eşle
  if (!isYouTube && isPlayerOrEmbedUrl(finalUrl)) {
    const pageHost = (() => { try { return new URL(opts.pageUrl).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' } })()
    const urlHost = (() => { try { return new URL(opts.url).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' } })()
    const matched = recentStreamsByPage.get(opts.pageUrl) ||
                    recentStreamsByPage.get(opts.url) ||
                    (pageHost ? recentStreamsByPage.get(pageHost) : null) ||
                    (urlHost ? recentStreamsByPage.get(urlHost) : null) ||
                    recentStreamsByPage.get('latest')
    if (matched && isStreamUrl(matched)) {
      console.log('[VoltGet] doStartDownload resolved embed URL to real stream:', matched)
      finalUrl = matched
      opts.url = matched
    }
  }

  if (!opts.title || opts.title === 'Video' || opts.title === 'Dosya' || opts.title === 'İndiriliyor...') {
    if (opts.pageUrl) {
      try {
        const u = new URL(opts.pageUrl)
        const pathSlug = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ')
        if (pathSlug && pathSlug.length > 3) {
          opts.title = pathSlug.charAt(0).toUpperCase() + pathSlug.slice(1)
        }
      } catch {}
    }
  }

  // 2. Web scripti (.js) veya stil indirme girişimlerini kesinlikle engelle
  if (/\.(js|mjs|cjs|jsx|ts|tsx|css|scss|map)($|\?)/i.test(finalUrl) ||
      /\.(js|mjs|cjs|jsx|ts|tsx|css|scss|map)($|\?)/i.test(opts.filename || '')) {
    console.log('[VoltGet] Rejected script download attempt:', finalUrl)
    return
  }

  // 3. Normal dosya indirmesi ise doğrudan 8 parçalı yüksek hızlı HTTP indiriciye aktar
  const isGeneric = opts.isHttp ||
                    /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(finalUrl) ||
                    (opts.filename && /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(opts.filename))
  if (isGeneric) {
    const baseOut = opts.outDir || getDefaultDownloadDir()
    const outDir = getSiteFolder(baseOut, finalUrl)
    ensureDir(outDir)
    const filename = opts.filename || finalUrl.split('/').pop()?.split('?')[0] || `file_${Date.now()}`
    const outPath = path.join(outDir, filename)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-started', { id, opts: { ...opts, title: filename }, outDir })
      mainWindow.webContents.send('switch-to-download-tab')
    }
    runMultiPartHttpDownload(id, opts, outDir, outPath, filename)
    return
  }

  // 4. Medya / Video indirmesi
  const baseOut = opts.outDir || getDefaultDownloadDir()
  const outDir = getSiteFolder(baseOut, finalUrl)
  ensureDir(outDir)
  const ytdlp = findYtDlp()
  const isHls = finalUrl.includes('.m3u8') || finalUrl.includes('master.txt') || finalUrl.includes('/hls/') || finalUrl.includes('playmix') || finalUrl.includes('cdnimages') || finalUrl.includes('/q/') || finalUrl.includes('molystream')

  const args: string[] = ['--js-runtimes', 'node', '--remote-components', 'ejs:github', '--no-warnings', '--concurrent-fragments', '16']
  if (appConfig.speedLimitKB > 0) args.push('--limit-rate', `${appConfig.speedLimitKB}K`)

  // HLS URL'den ID çıkar: ...-Pq7eJSHPqS3.mp4 -> Pq7eJSHPqS3 (Sadece hdfilm / cdn siteleri için)
  let embedId = ''
  const isHdFilmSite = finalUrl.includes('cdnimages') || finalUrl.includes('playmix') || finalUrl.includes('hdfilmcehennemi') || (opts.pageUrl && opts.pageUrl.includes('hdfilmcehennemi'))
  if (isHdFilmSite) {
    try { const m = finalUrl.match(/-([A-Za-z0-9]{8,12})\.mp4/); if (m) embedId = m[1] } catch {}
  }

  const isVideoPlatform = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|reddit\.com|twitch\.tv|vimeo\.com|soundcloud\.com/i.test(finalUrl) ||
                          (opts.pageUrl && /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|reddit\.com|twitch\.tv|vimeo\.com|soundcloud\.com/i.test(opts.pageUrl))

  if (isHls) {
    args.push('--extractor-args', 'generic:variant_query', '--extractor-args', 'generic:fragment_query', '--hls-use-mpegts')
    if (isHdFilmSite && embedId) {
      args.push('--add-header', `Referer:https://hdfilmcehennemi.mobi/video/embed/${embedId}/`)
      args.push('--add-header', 'Origin:https://hdfilmcehennemi.mobi')
    } else if (finalUrl.includes('molystream')) {
      args.push('--add-header', 'Referer:https://dbx.molystream.org/')
      args.push('--add-header', 'Origin:https://dbx.molystream.org')
    } else if (opts.pageUrl && !isVideoPlatform) {
      try {
        args.push('--add-header', `Referer:${opts.pageUrl}`)
        args.push('--add-header', `Origin:${new URL(opts.pageUrl).origin}`)
      } catch {}
    }
    args.push('--downloader', 'm3u8:native', '-N', '8')
  } else if (opts.pageUrl && !isVideoPlatform) {
    try {
      args.push('--add-header', `Referer:${opts.pageUrl}`)
      args.push('--add-header', `Origin:${new URL(opts.pageUrl).origin}`)
    } catch {}
  }

  if (!isYouTube) {
    args.push('--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    if (opts.cookie) {
      args.push('--add-header', `Cookie:${opts.cookie}`)
    }
  }

  if (opts.asAudio) {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0')
  } else if (opts.formatId && opts.formatId !== 'best' && opts.formatId !== 'direct') {
    const isAudio = opts.isAudioOnly || opts.formatId.includes('audio')
    if (isAudio) {
      args.push('-f', opts.formatId)
    } else if (opts.formatId.includes('+') || opts.formatId.includes('/')) {
      args.push('-f', opts.formatId)
    } else {
      args.push('-f', `${opts.formatId}+bestaudio/best`)
    }
    args.push('--merge-output-format', 'mp4')
  } else {
    // Hem HLS hem standart videolar (YouTube, Twitter, Instagram, TikTok, Reddit vs.) için en iyi video + ses:
    args.push('-f', 'bv*+ba/b')
    args.push('--merge-output-format', 'mp4')
  }

  let filename = opts.filename
  if (!filename && opts.title && opts.title !== 'Video' && opts.title !== 'Dosya') {
    const cleanTitle = opts.title.replace(/[\\/:*?"<>|]/g, '_').trim()
    if (cleanTitle) {
      filename = `${cleanTitle}.%(ext)s`
    }
  }
  const tmpl = filename || appConfig.filenameTemplate || '%(title)s.%(ext)s'
  const tempDir = path.join(outDir, '.voltget_tmp')
  ensureDir(tempDir)
  args.push('-P', `temp:${tempDir}`, '-P', `home:${outDir}`)
  args.push('-o', tmpl, '--no-playlist', '--newline', '--progress', '--continue')
  if (ffmpegPath) {
    const loc = (ffmpegPath !== 'ffmpeg' && fs.existsSync(ffmpegPath)) ? path.dirname(ffmpegPath) : ffmpegPath
    args.push('--ffmpeg-location', loc)
  }
  args.push(finalUrl)

  console.log('[VoltGet] starting download process:', id, ytdlp, args.join(' '))
  let proc: ChildProcess
  try {
    proc = spawn(ytdlp, args, { shell: false })
  } catch (err: any) {
    console.error('[VoltGet] spawn failed with primary ytdlp:', ytdlp, err)
    try {
      proc = spawn('yt-dlp', args, { shell: false })
    } catch (err2: any) {
      console.error('[VoltGet] spawn fallback also failed, trying shell:true:', err2)
      proc = spawn('yt-dlp', args, { shell: true })
    }
  }

  proc.on('error', (procErr: any) => {
    console.error('[VoltGet] download process emitted error:', procErr)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-error', { id, error: `İndirme başlatılamadı: ${procErr.message}` })
    }
  })

  activeDownloads.set(id, proc)
  activeOpts.set(id, { ...opts, url: finalUrl })

  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('download-started', { id, opts: { ...opts, url: finalUrl }, outDir })
    mainWindow.webContents.send('switch-to-download-tab')
  }

  let downloadedFilePath = ''

  proc.stdout?.on('data', (d: Buffer) => {
    const text = d.toString()
    const mDest = text.match(/\[(?:download|Merger|ExtractAudio)\]\s+(?:Destination:\s+|Merging formats into\s+["']?|)(.+?\.[a-zA-Z0-9]{2,5})(?:["']|\s*$)/m)
    if (mDest && mDest[1]) {
      const cand = mDest[1].trim()
      if (path.isAbsolute(cand)) downloadedFilePath = cand
      else downloadedFilePath = path.join(outDir, cand)
    }

    const m = text.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+(?:~\s*)?([^\s]+)(?:\s+at\s+([^\s]+))?(?:\s+ETA\s+([^\s]+))?/)
    if (m && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-progress', {
        id,
        percent: parseFloat(m[1]),
        total: m[2] || '',
        speed: m[3] || '',
        eta: m[4] || '',
        raw: text.trim().slice(0, 200),
        title: activeOpts.get(id)?.title || opts?.title
      })
    } else if (mainWindow && !mainWindow.isDestroyed() && (text.includes('[download]') || text.includes('[ExtractAudio]') || text.includes('[Merger]'))) {
      mainWindow.webContents.send('download-log', { id, text: text.trim().slice(0, 300) })
    }
  })

  proc.stderr?.on('data', (d: Buffer) => {
    const errText = d.toString()
    console.error('[yt-dlp error output]:', errText.slice(0, 300))
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-log', { id, text: errText.trim().slice(0, 400) })
  })

  proc.on('close', (code) => {
    activeDownloads.delete(id)
    activeOpts.delete(id)
    if (pausingIds.has(id)) {
      pausingIds.delete(id)
      processPending()
      return
    }

    // Geçici voltget klasörünü temizle
    try {
      if (fs.existsSync(tempDir)) {
        const remaining = fs.readdirSync(tempDir)
        if (remaining.length === 0) fs.rmdirSync(tempDir)
      }
    } catch {}

    // Eğer yt-dlp hata verdiyse ve HLS / doğrudan akış ise otomatik FFmpeg fallback çalıştır!
    if (code !== 0 && isHls) {
      console.log('[VoltGet] yt-dlp exited with code', code, 'triggering ffmpeg fallback for HLS:', finalUrl)
      let ffHeaders = 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n'
      if (embedId) {
        ffHeaders += `Referer: https://hdfilmcehennemi.mobi/video/embed/${embedId}/\r\nOrigin: https://hdfilmcehennemi.mobi\r\n`
      } else if (opts.pageUrl && !isVideoPlatform) {
        try { ffHeaders += `Referer: ${opts.pageUrl}\r\nOrigin: ${new URL(opts.pageUrl).origin}\r\n` } catch {}
      }
      if (opts.cookie) ffHeaders += `Cookie: ${opts.cookie}\r\n`

      const rawFileName = opts.filename || (opts.title ? `${opts.title.replace(/[\\/:*?"<>|]/g, '_')}.mp4` : `video_${Date.now()}.mp4`)
      const actualOut = path.join(outDir, rawFileName)
      const tempOut = path.join(tempDir, `ff_${id}_${rawFileName}`)
      const ffArgs = [
        '-headers', ffHeaders,
        '-allowed_segment_extensions', 'ALL',
        '-allowed_extensions', 'ALL',
        '-extension_picky', '0',
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', finalUrl,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        tempOut
      ]
      
      console.log('[VoltGet ffmpeg fallback]', ffArgs.join(' ').slice(0, 300))
      const ffProc = spawn(ffmpegPath, ffArgs)
      activeDownloads.set(id, ffProc)

      ffProc.stderr.on('data', (d: Buffer) => {
        const t = d.toString()
        const tm = t.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)\s+bitrate=\s*([^\s]+)\s+speed=\s*([^\s]+)/)
        if (tm && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-progress', {
            id,
            percent: 50,
            total: 'HLS Akışı',
            speed: tm[3] || '',
            eta: tm[1] || '',
            raw: `FFmpeg indiriyor: ${tm[1]} (${tm[3]})`
          })
        } else if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-log', { id, text: '[ffmpeg] ' + t.trim().slice(0, 400) })
        }
      })

      ffProc.on('close', (ffCode) => {
        activeDownloads.delete(id)
        if (ffCode === 0 && fs.existsSync(tempOut)) {
          try {
            fs.renameSync(tempOut, actualOut)
          } catch {
            try { fs.copyFileSync(tempOut, actualOut); fs.unlinkSync(tempOut) } catch {}
          }
        } else {
          try { fs.unlinkSync(tempOut) } catch {}
        }
        try {
          if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) fs.rmdirSync(tempDir)
        } catch {}

        let statSize = 0
        if (ffCode === 0 && fs.existsSync(actualOut)) {
          try { statSize = fs.statSync(actualOut).size } catch {}
          addDownloadToHistory({
            id,
            url: finalUrl,
            title: opts.title || path.basename(actualOut),
            fileName: path.basename(actualOut),
            filePath: actualOut,
            fileSize: statSize,
            date: Date.now()
          })
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-done', {
            id,
            code: ffCode,
            outDir,
            filePath: ffCode === 0 ? actualOut : undefined,
            fileName: path.basename(actualOut),
            size: statSize
          })
        }
        try {
          if (ffCode === 0) new Notification({ title: 'İndirme tamamlandı (VoltGet)', body: (opts.title || finalUrl).slice(0, 60) }).show()
          else new Notification({ title: 'İndirme hatası', body: `FFmpeg Hata Kodu ${ffCode}` }).show()
        } catch {}
        processPending()
      })

      ffProc.on('error', (e: any) => {
        activeDownloads.delete(id)
        try { fs.unlinkSync(tempOut) } catch {}
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-error', { id, error: String(e) })
        processPending()
      })
      return
    }

    if (code === 0) {
      if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
        try {
          const files = fs.readdirSync(outDir)
            .map(f => ({ name: f, path: path.join(outDir, f), mtime: fs.statSync(path.join(outDir, f)).mtimeMs }))
            .filter(f => !f.name.startsWith('.') && !isTemporaryOrPartialFile(f.name))
            .sort((a, b) => b.mtime - a.mtime)
          if (files.length > 0 && (Date.now() - files[0].mtime) < 45000) {
            downloadedFilePath = files[0].path
          }
        } catch {}
      }

      let statSize = 0
      if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
        try { statSize = fs.statSync(downloadedFilePath).size } catch {}
        addDownloadToHistory({
          id,
          url: finalUrl,
          title: opts.title || path.basename(downloadedFilePath),
          fileName: path.basename(downloadedFilePath),
          filePath: downloadedFilePath,
          fileSize: statSize,
          date: Date.now()
        })
      }
    }

    let fileSize = 0
    try { if (downloadedFilePath && fs.existsSync(downloadedFilePath)) fileSize = fs.statSync(downloadedFilePath).size } catch {}

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-done', {
        id,
        code,
        outDir,
        filePath: downloadedFilePath || undefined,
        fileName: downloadedFilePath ? path.basename(downloadedFilePath) : undefined,
        size: fileSize
      })
    }
    try {
      if (code === 0) new Notification({ title: 'İndirme tamamlandı (VoltGet)', body: (opts.title || finalUrl).slice(0, 60) }).show()
      else new Notification({ title: 'İndirme hatası', body: `Kod ${code} • ${finalUrl.slice(0, 40)}` }).show()
    } catch {}
    processPending()
  })

  proc.on('error', (e: any) => {
    activeDownloads.delete(id)
    activeOpts.delete(id)
    if (mainWindow) mainWindow.webContents.send('download-error', { id, error: String(e) })
    processPending()
  })
}

ipcMain.handle('start-download', async (_e, opts:any)=>{
  const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6)
  // site klasörü ve queue
  if(!canStart()){
    pendingQueue.push({id, opts})
    if(mainWindow) {
      mainWindow.webContents.send('download-queued',{id, opts, position: pendingQueue.length})
      mainWindow.webContents.send('switch-to-download-tab')
    }
    return { id, queued:true, position: pendingQueue.length }
  }
  doStartDownload(id, opts)
  if(mainWindow) mainWindow.webContents.send('switch-to-download-tab')
  return { id, outDir: getSiteFolder(opts.outDir||getDefaultDownloadDir(), opts.url) }
})
ipcMain.handle('cancel-download', async (_e, id:string)=>{
  // pending'te ise sil
  const idx=pendingQueue.findIndex(q=> q.id===id)
  if(idx!==-1){ pendingQueue.splice(idx,1); if(mainWindow) mainWindow.webContents.send('download-canceled',{id}); return true }
  const p=activeDownloads.get(id); if(p){ p.kill(); activeDownloads.delete(id); activeOpts.delete(id); pausedDownloads.delete(id); if(mainWindow) mainWindow.webContents.send('download-canceled',{id}); processPending(); return true }
  return false
})
ipcMain.handle('pause-download', async (_e, id:string)=>{
  // pending'te ise duraklat (kaldır ve kaydet)
  const idx=pendingQueue.findIndex(q=> q.id===id)
  if(idx!==-1){ const [job]=pendingQueue.splice(idx,1); pausedDownloads.set(id, job.opts); if(mainWindow) mainWindow.webContents.send('download-paused',{id}); return true }
  const p=activeDownloads.get(id)
  if(p){
    const opts = activeOpts.get(id)
    if(opts) pausedDownloads.set(id, opts)
    pausingIds.add(id)
    if(typeof (p as any).pause === 'function') {
      ;(p as any).pause()
    } else if(typeof p.kill === 'function') {
      p.kill()
    }
    activeDownloads.delete(id)
    activeOpts.delete(id)
    if(mainWindow) mainWindow.webContents.send('download-paused',{id})
    processPending()
    return true
  }
  return false
})
ipcMain.handle('retry-download', async (_e, opts:any)=>{
  const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6)
  if(!canStart()){ pendingQueue.push({id, opts}); if(mainWindow) mainWindow.webContents.send('download-queued',{id,opts}); return {id, queued:true} }
  if(opts.isHttp) {
    if(mainWindow) mainWindow.webContents.send('download-started', { id, opts: {...opts, title: opts.filename}, outDir: opts.outDir })
    runMultiPartHttpDownload(id, opts, opts.outDir, opts.outPath, opts.filename)
    return { id, outPath: opts.outPath }
  }
  doStartDownload(id, opts); return {id, outDir: getSiteFolder(opts.outDir||getDefaultDownloadDir(), opts.url)}
})
ipcMain.handle('resume-download', async (_e, payload:any)=>{
  const id = typeof payload==='string' ? payload : payload?.id
  const opts = pausedDownloads.get(id) || payload?.opts
  if(!id || !opts) return { error: 'no paused download found for id' }
  pausedDownloads.delete(id)
  if(opts.isHttp){
    if(!canStart()){ pendingQueue.push({id, opts}); if(mainWindow) mainWindow.webContents.send('download-queued',{id,opts}); return {id, queued:true} }
    if(mainWindow) mainWindow.webContents.send('download-started', { id, opts: {...opts, title: opts.filename}, outDir: opts.outDir })
    runMultiPartHttpDownload(id, opts, opts.outDir, opts.outPath, opts.filename)
    return { id, outPath: opts.outPath }
  }
  if(!canStart()){ pendingQueue.push({id, opts}); if(mainWindow) mainWindow.webContents.send('download-queued',{id,opts}); return {id, queued:true} }
  doStartDownload(id, opts); return {id, outDir: getSiteFolder(opts.outDir||getDefaultDownloadDir(), opts.url)}
})
ipcMain.handle('select-folder', async ()=>{ const r=await dialog.showOpenDialog({properties:['openDirectory']}); if(r.canceled) return null; return r.filePaths[0] })
ipcMain.handle('open-folder', async (_e, dir:string)=>{ shell.openPath(dir||getDefaultDownloadDir()) })
ipcMain.handle('get-default-dir', async ()=> getDefaultDownloadDir())
ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('get-disk-space', async (_e, dirPath?: string) => {
  try {
    const target = dirPath || getDefaultDownloadDir()
    ensureDir(target)
    const stats = (fs as any).statfsSync(target)
    const freeBytes = stats.bavail * stats.bsize
    const totalBytes = stats.blocks * stats.bsize
    const formatGb = (b: number) => (b / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
    return {
      free: formatGb(freeBytes),
      total: formatGb(totalBytes),
      freeBytes,
      totalBytes
    }
  } catch {
    return { free: 'Bilinmiyor', total: '', freeBytes: 0, totalBytes: 0 }
  }
})

ipcMain.handle('queue-download', async (_e, opts: any) => {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  pendingQueue.push({ id, opts })
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('download-queued', { id, opts, position: pendingQueue.length })
    mainWindow.webContents.send('switch-to-download-tab')
  }
  return { id, queued: true, position: pendingQueue.length }
})

ipcMain.handle('read-clipboard', async () => {
  try {
    const { clipboard } = require('electron')
    return clipboard.readText().trim()
  } catch {
    return ''
  }
})

ipcMain.handle('minimize-dialog', () => {
  if (downloadDialogWindow && !downloadDialogWindow.isDestroyed()) downloadDialogWindow.minimize()
})

ipcMain.handle('close-dialog', () => {
  if (downloadDialogWindow && !downloadDialogWindow.isDestroyed()) downloadDialogWindow.close()
})

function isTemporaryOrPartialFile(name: string): boolean {
  if (!name || typeof name !== 'string') return true
  if (name.startsWith('.') || name.startsWith('~')) return true
  // Geçici veya indirme parçaları uzantıları (.part, .ytdl, .tmp, .temp, .crdownload vb.)
  if (/\.(part|ytdl|tmp|temp|crdownload|download)$/i.test(name)) return true
  // yt-dlp ara akış veya birleştirilmemiş parçalar: film.f2708.mp4, film.f137.mp4, film.fgroup_closedual-Turkish.mp4, film.temp.mp4
  if (/\.(f[0-9a-zA-Z_.-]+|temp)\.(mp4|m4a|webm|mkv|aac|ts|m4v)$/i.test(name)) return true
  // Fragman veya parça dosyaları: part-Frag1, part_0, etc.
  if (/part[-_]?(?:frag)?[0-9]+/i.test(name)) return true
  return false
}

function scanDownloadedFiles(dir: string, baseDir: string): any[] {
  if (!fs.existsSync(dir)) return []
  const results: any[] = []
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name.startsWith('.tmp') || entry.name.startsWith('.voltget_')) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        results.push(...scanDownloadedFiles(fullPath, baseDir))
      } else if (entry.isFile()) {
        if (isTemporaryOrPartialFile(entry.name)) continue
        try {
          const stat = fs.statSync(fullPath)
          if (stat.size === 0) continue // 0 baytlık boş/henüz yazılmamış dosyaları gösterme
          const ext = path.extname(entry.name).slice(1).toLowerCase()
          const relative = path.relative(baseDir, fullPath)
          const folder = path.dirname(relative) === '.' ? 'Ana Klasör' : path.dirname(relative)
          let category = 'other'
          if (['mp4','mkv','webm','avi','mov','flv','ts','m4v'].includes(ext)) category = 'video'
          else if (['mp3','m4a','flac','wav','aac','ogg','wma'].includes(ext)) category = 'audio'
          else if (['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','epub','csv'].includes(ext)) category = 'document'
          else if (['zip','rar','7z','tar','gz','iso','torrent'].includes(ext)) category = 'archive'
          else if (['exe','msi','apk','dmg','deb','rpm'].includes(ext)) category = 'installer'

          results.push({
            name: entry.name,
            path: fullPath,
            relativePath: relative,
            folder,
            size: stat.size,
            mtime: stat.mtimeMs,
            ext,
            category
          })
        } catch {}
      }
    }
  } catch {}
  return results
}

ipcMain.handle('list-files', async (_e, mode?: string, customDir?: string) => {
  if (mode === 'all') {
    const targetDir = customDir || getDefaultDownloadDir()
    ensureDir(targetDir)
    const files = scanDownloadedFiles(targetDir, targetDir)
    return files.sort((a, b) => b.mtime - a.mtime)
  }

  // Default: 'voltget' (Sadece VoltGet ile indirilen dosyalar ve disk kontrolü)
  syncHistoryFromQueue()
  const history = loadHistory()
  return history.map(item => {
    const exists = fs.existsSync(item.filePath)
    let size = item.fileSize || 0
    let mtime = item.date || Date.now()
    if (exists) {
      try {
        const s = fs.statSync(item.filePath)
        if (s.size > 0) size = s.size
        mtime = s.mtimeMs
      } catch {}
    }
    const ext = path.extname(item.filePath).slice(1).toLowerCase()
    return {
      id: item.id,
      name: item.fileName || path.basename(item.filePath),
      path: item.filePath,
      relativePath: item.fileName || path.basename(item.filePath),
      folder: path.dirname(item.filePath),
      size,
      mtime,
      ext,
      category: item.category || getCategoryFromExt(ext),
      url: item.url,
      exists,
      deletedFromDisk: !exists
    }
  }).sort((a, b) => b.mtime - a.mtime)
})

ipcMain.handle('check-file-exists', async (_e, filePath: string) => {
  if (!filePath) return false
  return fs.existsSync(filePath)
})

ipcMain.handle('open-file', async (_e, filePath: string) => {
  if (filePath && fs.existsSync(filePath)) {
    return shell.openPath(filePath)
  }
  return 'Dosya bulunamadı'
})

ipcMain.handle('show-in-folder', async (_e, filePath: string) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath)
    return true
  }
  return false
})

ipcMain.handle('remove-from-history', async (_e, idOrPath: string) => {
  if (!idOrPath) return false
  removeDownloadFromHistory(idOrPath)
  const q = loadQueue()
  const updated = q.filter(x => x.id !== idOrPath && x.filePath !== idOrPath && x.opts?.outPath !== idOrPath)
  if (updated.length !== q.length) saveQueue(updated)
  return true
})

ipcMain.handle('delete-file', async (_e, payload: any) => {
  const filePath = typeof payload === 'string' ? payload : payload?.filePath
  const deleteFromDisk = typeof payload === 'object' ? payload?.deleteFromDisk !== false : true
  const id = typeof payload === 'object' ? payload?.id : undefined
  try {
    if (deleteFromDisk && filePath && fs.existsSync(filePath)) {
      await shell.trashItem(filePath)
    }
    if (id || filePath) {
      removeDownloadFromHistory(id || filePath)
      const q = loadQueue()
      const updated = q.filter(x => x.id !== id && x.filePath !== filePath && x.opts?.outPath !== filePath)
      if (updated.length !== q.length) saveQueue(updated)
    }
    return { success: true }
  } catch (err: any) {
    try {
      if (deleteFromDisk && filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
      if (id || filePath) {
        removeDownloadFromHistory(id || filePath)
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }
})
ipcMain.handle('get-config', async ()=> loadConfig())
ipcMain.handle('set-config', async (_e, patch:any)=>{
  appConfig={...loadConfig(), ...patch}
  saveConfig(appConfig)
  if(patch.openAtLogin !== undefined || patch.startMinimized !== undefined){
    try {
      app.setLoginItemSettings({
        openAtLogin: !!appConfig.openAtLogin,
        openAsHidden: !!appConfig.startMinimized,
        path: process.execPath,
        args: appConfig.startMinimized ? ['--hidden'] : []
      })
    } catch {}
  }
  return appConfig
})
ipcMain.handle('open-external', async (_e, url: string) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url)
    return true
  }
  return false
})
ipcMain.handle('get-yt-dlp-status', async ()=>{
  const binExists=fs.existsSync(ytDlpPath); let pathExists=false; try{ const {execSync}=await import('child_process'); execSync('yt-dlp --version',{stdio:'ignore'}); pathExists=true }catch{}
  let ffmpegOk=false; try{ const {execSync}=await import('child_process'); execSync('ffmpeg -version',{stdio:'ignore'}); ffmpegOk=true }catch{}
  let ytdlpVer=''; try{ const {execSync}=await import('child_process'); ytdlpVer=execSync(`${findYtDlp()} --version`,{encoding:'utf-8'}).trim() }catch{}
  return { binExists, pathExists, ytDlpPath, ffmpegOk, ffmpegPath, ytdlpVer, config: loadConfig() }
})
ipcMain.handle('check-yt-dlp-update', async ()=>{
  try{
    const https=await import('https')
    const get=(url:string)=> new Promise<string>((res,rej)=>{ https.get(url,{headers:{'User-Agent':'VoltGet'}},r=>{ let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)) }).on('error',rej) })
    const data=await get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest') as any
    const j=JSON.parse(data as any); const latest=j.tag_name||j.name; let cur=''; try{ const {execSync}=await import('child_process'); cur=execSync(`${findYtDlp()} --version`,{encoding:'utf-8'}).trim() }catch{}
    return { latest, current: cur, hasUpdate: latest && cur && !latest.includes(cur), url: j.html_url }
  }catch(e:any){ return { error:String(e) } }
})
ipcMain.handle('download-yt-dlp', async () => {
  const targetBin = isValidExecutable(ytDlpPath) ? ytDlpPath : path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..'), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
  const binDir = path.dirname(targetBin)
  ensureDir(binDir)
  const tempPath = `${targetBin}.download.tmp`
  const initialUrl = process.platform === 'win32' ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'

  const downloadWithRedirects = (url: string, redirectCount = 0): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (redirectCount > 5) return reject(new Error('Çok fazla yönlendirme'))
      const https = require('https')
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      }
      https.get(url, options, (res: any) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return downloadWithRedirects(res.headers.location, redirectCount + 1).then(resolve).catch(reject)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`İndirme başarısız (HTTP ${res.statusCode})`))
        }
        const fileStream = fs.createWriteStream(tempPath)
        res.pipe(fileStream)
        fileStream.on('finish', () => {
          fileStream.close(() => resolve())
        })
        fileStream.on('error', (err: any) => {
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath) } catch {}
          reject(err)
        })
      }).on('error', (err: any) => {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath) } catch {}
        reject(err)
      })
    })
  }

  try {
    await downloadWithRedirects(initialUrl)
    const stat = fs.statSync(tempPath)
    if (stat.size < 5000000) {
      try { fs.unlinkSync(tempPath) } catch {}
      throw new Error(`İndirilen dosya boyutu beklenenden küçük (${(stat.size / 1024).toFixed(1)} KB)`)
    }
    if (process.platform !== 'win32') fs.chmodSync(tempPath, 0o755)
    fs.renameSync(tempPath, targetBin)
    ytDlpPath = targetBin
    return targetBin
  } catch (err: any) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath) } catch {}
    throw err
  }
})
ipcMain.handle('sniffed-url', async (_e, data:any)=>{ if(mainWindow) mainWindow.webContents.send('sniffed-url', data); return true })
ipcMain.handle('direct-download', async (_e, opts: any) => {
  if (!opts?.url) throw new Error('URL eksik')
  opts.url = normalizeToMasterPlaylist(opts.url)
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  if (!canStart()) {
    pendingQueue.push({ id, opts })
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-queued', { id, opts, position: pendingQueue.length })
      mainWindow.webContents.send('switch-to-download-tab')
    }
    return { id, queued: true, position: pendingQueue.length }
  }
  doStartDownload(id, opts)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('switch-to-download-tab')
  }
  return { id, outDir: getSiteFolder(opts.outDir || getDefaultDownloadDir(), opts.url) }
})
ipcMain.handle('get-queue', async ()=> loadQueue())
ipcMain.handle('save-queue', async (_e, jobs:any[])=> saveQueue(jobs))
async function runMultiPartHttpDownload(id:string, opts:any, outDir:string, outPath:string, filename:string){
  const protocol = opts.url.startsWith('https') ? https : http
  const partsCount = 8 // IDM tarzı 8 parça
  const tempDir = path.join(outDir, `.tmp_${id}`)
  ensureDir(tempDir)

  // 1. HEAD isteği ile dosya boyutunu ve Range desteğini kontrol et
  const getHeaders = (rangeHeader?: string) => ({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...(opts.cookie ? { Cookie: opts.cookie } : {}),
    ...(rangeHeader ? { Range: rangeHeader } : {})
  })

  try {
    const headReq = await new Promise<{ totalSize: number, acceptRanges: boolean }>((resolve, reject) => {
      const parsedUrl = new URL(opts.url)
      const req = protocol.request({
        method: 'HEAD',
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: getHeaders()
      }, res => {
        const totalSize = parseInt(res.headers['content-length'] || '0')
        const acceptRanges = res.headers['accept-ranges'] === 'bytes' || !!res.headers['content-range']
        resolve({ totalSize, acceptRanges })
      })
      req.on('error', reject)
      req.end()
    })

    // Eğer Range desteklenmiyorsa veya dosya boyutu bilinmiyorsa standart tek akış indirmeye dön
    if (!headReq.acceptRanges || headReq.totalSize <= 0) {
      runHttpDownload(id, opts, outDir, outPath, filename)
      return
    }

    const totalSize = headReq.totalSize
    const partSize = Math.floor(totalSize / partsCount)
    const partProgress: number[] = new Array(partsCount).fill(0)
    const activeReqs: any[] = []
    let isAborted = false
    const startTime = Date.now()

    // Parça indirme fonksiyonu (Resume / Byte Offset destekli)
    const downloadPart = (index: number, start: number, end: number) => {
      return new Promise<void>((resolve, reject) => {
        const partFile = path.join(tempDir, `part_${index}`)
        let existingBytes = 0
        if (fs.existsSync(partFile)) {
          try { existingBytes = fs.statSync(partFile).size } catch {}
        }

        const requiredBytes = end - start + 1
        if (existingBytes >= requiredBytes) {
          partProgress[index] = requiredBytes
          return resolve()
        }

        partProgress[index] = existingBytes
        const actualStart = start + existingBytes
        const fileStream = fs.createWriteStream(partFile, { flags: existingBytes > 0 ? 'a' : 'w' })
        const parsedUrl = new URL(opts.url)

        const req = protocol.get({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: getHeaders(`bytes=${actualStart}-${end}`)
        }, res => {
          if (res.statusCode !== 206 && res.statusCode !== 200) {
            fileStream.close()
            return reject(new Error(`HTTP ${res.statusCode} for part ${index}`))
          }

          res.on('data', (chunk: Buffer) => {
            if (isAborted) {
              try { res.destroy() } catch {}
              return
            }
            partProgress[index] += chunk.length
            const currentTotal = partProgress.reduce((a, b) => a + b, 0)
            const percent = totalSize > 0 ? (currentTotal / totalSize) * 100 : 0
            const elapsedTime = Math.max(0.1, (Date.now() - startTime) / 1000)
            const currentSpeedKBps = (currentTotal / 1024) / elapsedTime

            if (appConfig.speedLimitKB > 0 && currentSpeedKBps > appConfig.speedLimitKB) {
              const delay = ((currentTotal / 1024) / appConfig.speedLimitKB) - elapsedTime
              if (delay > 0) {
                res.pause()
                setTimeout(() => { try { res.resume() } catch {} }, delay * 1000)
              }
            }

            const speed = (currentSpeedKBps > 1024 ? (currentSpeedKBps / 1024).toFixed(2) + ' MB/s' : currentSpeedKBps.toFixed(0) + ' KB/s')
            if (mainWindow) {
              mainWindow.webContents.send('download-progress', {
                id,
                percent: Math.round(percent),
                total: totalSize ? `${(totalSize / 1024 / 1024).toFixed(1)}MB` : '',
                speed,
                eta: '-',
                raw: `${percent.toFixed(1)}% • ${speed} (${partsCount} parça)`
              })
            }
          })

          res.pipe(fileStream)
          fileStream.on('finish', () => {
            fileStream.close()
            resolve()
          })
        })

        req.on('error', err => {
          fileStream.close()
          if (isAborted) {
            resolve()
          } else {
            reject(err)
          }
        })

        activeReqs.push(req)
      })
    }

    activeDownloads.set(id, {
      pause: () => {
        isAborted = true
        activeReqs.forEach(r => { try { r.destroy() } catch {} })
        // Pause edildiğinde tempDir korunur
      },
      kill: () => {
        isAborted = true
        activeReqs.forEach(r => { try { r.destroy() } catch {} })
        try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
      }
    } as any)
    activeOpts.set(id, { ...opts, isHttp: true, outDir, outPath, filename })

    // Parçaları paralel başlat
    const promises = []
    for (let i = 0; i < partsCount; i++) {
      const start = i * partSize
      const end = i === partsCount - 1 ? totalSize - 1 : (i + 1) * partSize - 1
      promises.push(downloadPart(i, start, end))
    }

    await Promise.all(promises)

    if (pausingIds.has(id) || isAborted) {
      pausingIds.delete(id)
      processPending()
      return
    }

    // Parçaları birleştir: Birleştirme tempDir içinde tamamlandıktan sonra asıl hedefe taşınır!
    const tempMergedPath = path.join(tempDir, `merged_${id}`)
    const finalStream = fs.createWriteStream(tempMergedPath)
    for (let i = 0; i < partsCount; i++) {
      const partFile = path.join(tempDir, `part_${i}`)
      if (fs.existsSync(partFile)) {
        const data = fs.readFileSync(partFile)
        finalStream.write(data)
      }
    }
    finalStream.end()
    await new Promise<void>((res) => finalStream.on('finish', () => res()))
    try {
      fs.renameSync(tempMergedPath, outPath)
    } catch {
      try { fs.copyFileSync(tempMergedPath, outPath); fs.unlinkSync(tempMergedPath) } catch {}
    }

    // Geçici klasörü temizle
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}

    activeDownloads.delete(id)
    activeOpts.delete(id)

    let statSize = 0
    try { if (fs.existsSync(outPath)) statSize = fs.statSync(outPath).size } catch {}
    addDownloadToHistory({
      id,
      url: opts.url,
      title: filename,
      fileName: filename,
      filePath: outPath,
      fileSize: statSize,
      date: Date.now()
    })

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-done', {
        id,
        code: 0,
        outDir,
        filePath: outPath,
        fileName: filename,
        size: statSize
      })
    }
    try { new Notification({ title: 'VoltGet: İndirme bitti (8 Parça)', body: filename.slice(0, 50) }).show() } catch {}
    processPending()

  } catch (err: any) {
    if (pausingIds.has(id)) {
      pausingIds.delete(id)
      processPending()
      return
    }
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
    // Hata durumunda standart tek akış indirmeyi dene
    console.warn('[MultiPart] fallback to standard http-download:', err.message)
    runHttpDownload(id, opts, outDir, outPath, filename)
  }
}

function runHttpDownload(id:string, opts:any, outDir:string, outPath:string, filename:string){
  const tempOutPath = outPath + '.part'
  const file = fs.createWriteStream(tempOutPath)
  const protocol = opts.url.startsWith('https') ? https : http
  const startTime = Date.now()
  const req = protocol.get(opts.url, { 
    headers: { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...(opts.cookie ? { Cookie: opts.cookie } : {})
    } 
  }, (res:any)=>{
    if(res.statusCode===301||res.statusCode===302||res.statusCode===303||res.statusCode===307){
      file.close(); fs.unlink(tempOutPath, ()=>{})
      const nextOpts = { ...opts, url: res.headers.location }
      runHttpDownload(id, nextOpts, outDir, outPath, filename)
      return
    }
    if (res.statusCode >= 400) {
      file.destroy(); fs.unlink(tempOutPath, ()=>{}); activeDownloads.delete(id); activeOpts.delete(id)
      if(mainWindow) mainWindow.webContents.send('download-error', {id, error: `HTTP ${res.statusCode}: ${res.statusMessage}`})
      processPending()
      return
    }
    const totalSize = parseInt(res.headers['content-length'] || '0')
    let downloadedSize = 0
    res.on('data', (chunk:Buffer)=>{
      downloadedSize += chunk.length
      const percent = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0
      const speed = ((downloadedSize / 1024 / 1024) / Math.max(0.1,(Date.now() - startTime) / 1000)).toFixed(2) + ' MB/s'
      if(mainWindow) mainWindow.webContents.send('download-progress', {id, percent: Math.round(percent), total: totalSize? `${(totalSize/1024/1024).toFixed(1)}MB`:'', speed, eta: '-', raw: `${percent.toFixed(1)}% • ${speed}`})
    })
    res.pipe(file)
  }).on('error', (e:any)=>{
    file.destroy(); fs.unlink(tempOutPath, ()=>{}); activeDownloads.delete(id); activeOpts.delete(id)
    if(mainWindow) mainWindow.webContents.send('download-error', {id, error: String(e)})
    processPending()
  })
  activeDownloads.set(id, { kill: ()=> { req.destroy(); try { fs.unlinkSync(tempOutPath) } catch {} } })
  activeOpts.set(id, { ...opts, isHttp: true, outDir, outPath, filename })
  file.on('finish', ()=>{
    file.close()
    try {
      fs.renameSync(tempOutPath, outPath)
    } catch {
      try { fs.copyFileSync(tempOutPath, outPath); fs.unlinkSync(tempOutPath) } catch {}
    }
    activeDownloads.delete(id); activeOpts.delete(id)
    if(pausingIds.has(id)){ pausingIds.delete(id); processPending(); return }

    let statSize = 0
    try { if (fs.existsSync(outPath)) statSize = fs.statSync(outPath).size } catch {}
    addDownloadToHistory({
      id,
      url: opts.url,
      title: filename,
      fileName: filename,
      filePath: outPath,
      fileSize: statSize,
      date: Date.now()
    })

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('download-done', {
        id,
        code: 0,
        outDir,
        filePath: outPath,
        fileName: filename,
        size: statSize
      })
    }
    try{ new Notification({title: 'VoltGet: İndirme bitti', body: filename.slice(0,50)}).show()}catch{}
    processPending()
  })
}
ipcMain.handle('http-download', async (_e, opts:any)=>{
  const outDir=getSiteFolder(opts.outDir||getDefaultDownloadDir(), opts.url); ensureDir(outDir)
  const filename = opts.filename || (opts.url.split('/').pop()?.split('?')[0] || `file_${Date.now()}`)
  const outPath=path.join(outDir, filename)
  const id=Date.now().toString(36)
  const enrichedOpts = { ...opts, isHttp: true, outDir, outPath, filename, title: filename }
  if(!canStart()){
    pendingQueue.push({id, opts: enrichedOpts});
    if(mainWindow) {
      mainWindow.webContents.send('download-queued',{id, opts: enrichedOpts});
      mainWindow.webContents.send('switch-to-download-tab');
    }
    return {id, queued:true}
  }
  if(mainWindow) {
    mainWindow.webContents.send('download-started', { id, opts: enrichedOpts, outDir });
    mainWindow.webContents.send('switch-to-download-tab');
  }
  runMultiPartHttpDownload(id, enrichedOpts, outDir, outPath, filename)
  return {id, outPath}
})

function getExtensionDir(): string {
  const p1 = path.join(app.getAppPath(), 'extension')
  if (fs.existsSync(p1)) return p1
  const p2 = path.join(__dirname, '../../extension')
  if (fs.existsSync(p2)) return p2
  const p3 = path.join(process.resourcesPath, 'extension')
  if (fs.existsSync(p3)) return p3
  return p1
}

ipcMain.handle('open-extension-folder', async () => {
  const extDir = getExtensionDir()
  if (fs.existsSync(extDir)) {
    await shell.openPath(extDir)
    return { success: true, path: extDir }
  }
  return { success: false, error: 'Eklenti klasörü bulunamadı: ' + extDir }
})

ipcMain.handle('export-extension-zip', async () => {
  const extDir = getExtensionDir()
  if (!fs.existsSync(extDir)) {
    throw new Error('Eklenti klasörü bulunamadı: ' + extDir)
  }
  const outDir = getDefaultDownloadDir()
  ensureDir(outDir)
  const zipPath = path.join(outDir, 'voltget-eklenti.zip')

  return new Promise((resolve, reject) => {
    // Windows PowerShell Compress-Archive komutu ile sıfır bağımlılıkla hızlıca zip oluştur
    const psCmd = `Compress-Archive -Path "${extDir}\\*" -DestinationPath "${zipPath}" -Force`
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCmd])
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(zipPath)) {
        shell.showItemInFolder(zipPath)
        resolve({ success: true, zipPath })
      } else {
        reject(new Error(`ZIP paketi oluşturulamadı (çıkış kodu: ${code})`))
      }
    })
    proc.on('error', (err) => reject(err))
  })
})

ipcMain.handle('get-extension-status', async () => {
  const count = getExtensionConnectedCount()
  return { connected: count > 0, count }
})

