import { app, BrowserWindow, ipcMain, dialog, shell, Notification } from 'electron'
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

let mainWindow: BrowserWindow | null = null
let downloadDialogWindow: BrowserWindow | null = null

function createDownloadDialogWindow(sniffData: any) {
  if (downloadDialogWindow && !downloadDialogWindow.isDestroyed()) {
    downloadDialogWindow.focus()
    downloadDialogWindow.webContents.send('show-download-dialog', sniffData)
    return
  }

  downloadDialogWindow = new BrowserWindow({
    width: 480,
    height: 440,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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

  downloadDialogWindow.webContents.on('did-finish-load', () => {
    downloadDialogWindow?.webContents.send('show-download-dialog', sniffData)
    downloadDialogWindow?.show()
  })

  downloadDialogWindow.on('closed', () => {
    downloadDialogWindow = null
  })
}
const activeDownloads = new Map<string, ChildProcess | { kill: ()=>void }>()
const activeOpts = new Map<string, any>()
const pendingQueue: Array<{ id:string, opts:any }> = []
const pausedDownloads = new Map<string, any>()
const pausingIds = new Set<string>()

const isDev = !app.isPackaged && process.env.ELECTRON_IS_DEV !== '0'
const ytDlpPath = path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..'), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
function resolveFfmpegPath(): string {
  const bundled = path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..'), 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
  if (fs.existsSync(bundled)) return bundled
  return 'ffmpeg'
}
const ffmpegPath = resolveFfmpegPath()
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
}
const defaultConfig: AppConfig = { concurrent: 3, speedLimitKB: 0, siteFolders: true, filenameTemplate: '%(title)s.%(ext)s', autoUpdateCheck: true, sniffNotifications: true, sniffDebounceMs: 8000, theme: 'dark', accentColor: 'blue', language: 'tr', interceptBrowserDownloads: true, captureMediaRequests: true, captureDocuments: true, captureArchives: true, captureInstallers: true, openAtLogin: false, startMinimized: false }
function configPath(){ return path.join(app.getPath('userData'), 'config.json') }
function queuePath(){ return path.join(app.getPath('userData'), 'queue.json') }
function loadConfig(): AppConfig {
  try { if (fs.existsSync(configPath())) return { ...defaultConfig, ...JSON.parse(fs.readFileSync(configPath(),'utf-8')) } } catch {}
  return { ...defaultConfig }
}
function saveConfig(c:AppConfig){ try{ ensureDir(path.dirname(configPath())); fs.writeFileSync(configPath(), JSON.stringify(c,null,2)) }catch(e){ console.error(e)} }
let appConfig = loadConfig()

function getDefaultDownloadDir() {
  // config overrides? for now use Downloads/Flexplorer
  try {
    const c = loadConfig()
    // @ts-ignore custom outDir in config
    if ((c as any).customOutDir && fs.existsSync((c as any).customOutDir)) return (c as any).customOutDir
  } catch {}
  return path.join(os.homedir(), 'Downloads', 'Flexplorer')
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

function createWindow() {
  let preloadPath = path.join(__dirname, 'preload.cjs')
  if (!fs.existsSync(preloadPath)) preloadPath = path.join(__dirname, 'preload.js')
  const iconPath = path.join(app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..'), 'assets', 'icon.png')
  mainWindow = new BrowserWindow({
    width: 1220, height: 760, minWidth: 1020, minHeight: 620, backgroundColor: '#0a0a0f', title: 'Flexplorer - İndirme Yöneticisi', icon: fs.existsSync(iconPath)? iconPath: undefined,
    webPreferences: { preload: preloadPath, nodeIntegration: false, contextIsolation: true, sandbox: false }, autoHideMenuBar: true,
  })
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(() => mainWindow?.loadFile(path.join(__dirname, '../renderer/index.html')))
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' } })
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
function startSniffServer() {
  sniffServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }
    if (req.url === '/sniff' && req.method === 'POST') {
      let body=''; req.on('data', c=> body+=c); req.on('end', async ()=>{
        try{
          const data=JSON.parse(body)
          const sniffId = Date.now().toString(36)+Math.random().toString(36).slice(2,6)
          if (wss) {
            wss.clients.forEach((client: WebSocket) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'sniffed-url', data: { ...data, sniffId, time: new Date().toLocaleTimeString() } }));
              }
            });
          }
          if (mainWindow) mainWindow.webContents.send('sniffed-url', { ...data, sniffId, time: new Date().toLocaleTimeString() })
          // IDM Tarzı: Arka planda analiz et ve modalı aç
          const isGen = /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(data.url)
          let analyzedData: any = { ...data, formats: null, title: data.filename || data.url.split('/').pop()?.split('?')[0] }
          if (!isGen && !data.url.endsWith('.pdf')) {
            try {
              const target = (data.url.includes('googlevideo.com') || data.url.includes('youtube.com')) && data.pageUrl ? data.pageUrl : data.url
              const res = await analyzeUrl(target)
              analyzedData = { ...data, ...res }
            } catch(e) { console.error('[Flexplorer] analyze error', e) }
          }
          createDownloadDialogWindow(analyzedData)
          if (mainWindow && !mainWindow.isFocused()) { mainWindow.flashFrame(true) }
          const notifyKey = notifyKeyFor(data)
          if(shouldNotifySniff(notifyKey)){
            try{
              const site = (()=>{ try{ return new URL(data.pageUrl).hostname.replace('www.','') } catch{ return data.type||'media' } })()
              const n = new Notification({ title:`🎯 Flexplorer: ${site} yakalandı`, body: `${data.type} • Tıkla → Yakalayıcı'da gör`, silent:false })
              n.on('click', ()=>{
                if(mainWindow){
                  mainWindow.show(); mainWindow.focus()
                  createDownloadDialogWindow(analyzedData) // IDM Tarzı: Bildirime tıklandığında analiz edilmiş veriyle aç!
                }
              })
              n.show()
            }catch{}
          }
          res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true}))
        }catch(e:any){ res.writeHead(400); res.end(String(e)) }
      }); return
    }
    if (req.url === '/status'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:true, app:'Flexplorer', sniff:true})); return }
    res.writeHead(404); res.end('not found')
  })
  sniffServer.listen(8765,'127.0.0.1',()=>{
    console.log('[Flexplorer] sniff server http://127.0.0.1:8765/sniff')
        wss = new WebSocketServer({ server: sniffServer! });
    wss.on('connection', ws => {
      console.log('[Flexplorer] WebSocket connected');
      ws.on('message', (message: string) => {
        try {
          const msg = JSON.parse(message.toString());
          if (msg.type === 'sniffed-url' && mainWindow) {
            const data = msg.data;
            const sniffId = Date.now().toString(36)+Math.random().toString(36).slice(2,6)
            mainWindow.webContents.send('sniffed-url', { ...data, sniffId, time: new Date().toLocaleTimeString() });
            if (!mainWindow.isFocused()) { mainWindow.flashFrame(true) }
            const notifyKey = notifyKeyFor(data)
            if(shouldNotifySniff(notifyKey)){
              try{
                const site = (()=>{ try{ return new URL(data.pageUrl).hostname.replace('www.','') } catch{ return data.type||'media' } })()
                const n = new Notification({ title:`🎯 Flexplorer: ${site} yakalandı`, body: `${data.type} • Tıkla → Yakalayıcı'da gör`, silent:false })
                n.on('click', ()=>{
                  if(mainWindow){
                    mainWindow.show(); mainWindow.focus()
                    mainWindow.webContents.send('open-sniff-item', { sniffId, url: data.url, pageUrl: data.pageUrl })
                    mainWindow.webContents.send('switch-to-sniff-tab')
                  }
                })
                n.show()
              }catch{}
            }
          }
        } catch (e: any) {
          console.error('[Flexplorer] WebSocket message error', e);
        }
      });
      ws.on('close', () => console.log('[Flexplorer] WebSocket disconnected'));
      ws.on('error', (e: Error) => console.error('[Flexplorer] WebSocket error', e));
    });
  })
  sniffServer.on('error',(e:any)=> console.error('[sniff server]',e.message))
}

app.whenReady().then(() => {
  app.setName('Flexplorer')
  ensureDir(getDefaultDownloadDir())
  app.setLoginItemSettings({ openAtLogin: !!appConfig.openAtLogin, openAsHidden: appConfig.startMinimized })
  startSniffServer()
  createWindow()
})
app.on('window-all-closed', () => { try{ wss?.close(); sniffServer?.close()}catch{}; if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { try{ wss?.close(); sniffServer?.close()}catch{} })

function findYtDlp(): string { if (fs.existsSync(ytDlpPath)) return ytDlpPath; return 'yt-dlp' }
function parseYtDlpJson(out: string): any {
  const lines = out.split('\n').map(l=> l.trim()).filter(Boolean)
  const jsonLine = lines.find(l=> l.startsWith('{')) || lines[0]
  if (!jsonLine) throw new Error('yt-dlp boş çıktı döndürdü')
  return JSON.parse(jsonLine)
}

// Standalone analiz fonksiyonu (IPC handler ve sniff server içinden çağrılabilir)
async function analyzeUrl(url: string): Promise<any> {
  if(url.includes('hdfilmcehennemi.mobi/video/embed') || url.includes('/video/embed/')){
    throw new Error(`Bu sayfa analiz edilmez (embed HTML).`)
  }
  if(url.includes('master.txt') || url.includes('/hls/') && (url.includes('cdnimages') || url.includes('playmix'))){
    throw new Error(`Bu HLS master linki analiz edilmez — direkt HLS playlist.`)
  }
  const ytdlp=findYtDlp(); const args=['--dump-json','--no-playlist','--js-runtimes','node','--no-warnings',url]
  return new Promise((resolve, reject)=>{
    const proc=spawn(ytdlp,args,{shell:false,windowsHide:true}); let out='',err=''
    proc.stdout.on('data',(d:Buffer)=> out+=d.toString('utf-8')); proc.stderr.on('data',(d:Buffer)=> err+=d.toString('utf-8'))
    proc.on('close',code=>{
      if(code===0){ try{ resolve(parseInfo(parseYtDlpJson(out))) }catch(e:any){ reject(`JSON parse hatası: ${e.message}\nÇıktı: ${out.slice(0,800)}\nHata: ${err.slice(0,800)}`) } }
      else {
        let hint=''
        if(err.includes('No supported JavaScript runtime')) hint='\nİpucu: deno kurulmadı ama --js-runtimes node eklendi'
        else if(err.includes('Unsupported URL') && url.includes('hdfilmcehennemi')) hint='\nİpucu: hdfilmcehennemi yt-dlp ile desteklenmiyor — Yakalayıcı ile master.txt yakalayıp Hızlı İndir kullanın'
        reject(`${err.slice(0,1500)||`yt-dlp çıkış kodu ${code}`}${hint}\nKomut: ${ytdlp} ${args.join(' ')}`)
      }
    })
    proc.on('error',(e:any)=> reject(`yt-dlp çalıştırılamadı: ${e.message}\nYol: ${ytdlp}`))
  })
}

ipcMain.handle('analyze-url', async (_e, url: string) => {
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
  const baseOut = opts.outDir || getDefaultDownloadDir()
  const outDir = getSiteFolder(baseOut, opts.url)
  ensureDir(outDir)
  const ytdlp=findYtDlp()
  const args:string[]=['--js-runtimes','node','--no-warnings','--concurrent-fragments','16']
  if(appConfig.speedLimitKB>0) args.push('--limit-rate', `${appConfig.speedLimitKB}K`)
  if(opts.asAudio){ args.push('-x','--audio-format','mp3','--audio-quality','0') }
  else if(opts.formatId){
    // Eğer seçilen format zaten bir ses formatıysa bestaudio ekleme
    const isAudio = opts.isAudioOnly || opts.formatId.includes('audio')
    if (isAudio) {
      args.push('-f', opts.formatId)
    } else {
      args.push('-f', opts.formatId+'+bestaudio/best')
    }
    args.push('--merge-output-format','mp4')
  }
  else { args.push('-f','bv*+ba/b'); args.push('--merge-output-format','mp4') }
  const tmpl = opts.filename || appConfig.filenameTemplate || '%(title)s.%(ext)s'
  const outTemplate = path.join(outDir, tmpl)
  args.push('-o', outTemplate, '--no-playlist','--newline','--progress', '--continue')
  if(ffmpegPath!=='ffmpeg') args.push('--ffmpeg-location', ffmpegPath)
  args.push(opts.url)
  const proc=spawn(ytdlp,args,{shell:false})
  activeDownloads.set(id, proc)
  activeOpts.set(id, opts)
  // persist queue
  if(mainWindow) mainWindow.webContents.send('download-started', { id, opts, outDir })
  proc.stdout.on('data',(d:Buffer)=>{
    const text=d.toString()
    const m=text.match(/\[download\]\s+(\d+\.?\d*)%.*?of\s+([^\s]+).*?at\s+([^\s]+).*?ETA\s+([^\s]+)/)
    if(m && mainWindow) mainWindow.webContents.send('download-progress',{id,percent:parseFloat(m[1]),total:m[2],speed:m[3],eta:m[4],raw:text.trim().slice(0,200)})
    else if(mainWindow && (text.includes('[download]')||text.includes('[ExtractAudio]')||text.includes('[Merger]'))) mainWindow.webContents.send('download-log',{id,text:text.trim().slice(0,300)})
  })
  proc.stderr.on('data',(d:Buffer)=>{ if(mainWindow) mainWindow.webContents.send('download-log',{id,text:d.toString().trim().slice(0,400)}) })
  proc.on('close',(code)=>{
    activeDownloads.delete(id)
    activeOpts.delete(id)
    if(pausingIds.has(id)){
      pausingIds.delete(id)
      processPending()
      return
    }
    if(mainWindow) mainWindow.webContents.send('download-done',{id,code,outDir})
    // notification
    try{
      if(code===0) new Notification({ title:'İndirme tamamlandı', body: (opts.title||opts.url).slice(0,60)}).show()
      else new Notification({ title:'İndirme hatası', body: `Kod ${code} • ${opts.url.slice(0,40)}`}).show()
    }catch{}
    processPending()
  })
  proc.on('error',(e:any)=>{ activeDownloads.delete(id); activeOpts.delete(id); if(mainWindow) mainWindow.webContents.send('download-error',{id,error:String(e)}); processPending() })
}

ipcMain.handle('start-download', async (_e, opts:any)=>{
  const id=Date.now().toString(36)+Math.random().toString(36).slice(2,6)
  // site klasörü ve queue
  if(!canStart()){
    pendingQueue.push({id, opts})
    if(mainWindow) mainWindow.webContents.send('download-queued',{id, opts, position: pendingQueue.length})
    return { id, queued:true, position: pendingQueue.length }
  }
  doStartDownload(id, opts)
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
    p.kill()
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
  doStartDownload(id, opts); return {id, outDir: getSiteFolder(opts.outDir||getDefaultDownloadDir(), opts.url)}
})
ipcMain.handle('resume-download', async (_e, payload:any)=>{
  const id = typeof payload==='string' ? payload : payload?.id
  const opts = pausedDownloads.get(id) || payload?.opts
  if(!id || !opts) return { error: 'no paused download found for id' }
  pausedDownloads.delete(id)
  if(!canStart()){ pendingQueue.push({id, opts}); if(mainWindow) mainWindow.webContents.send('download-queued',{id,opts}); return {id, queued:true} }
  doStartDownload(id, opts); return {id, outDir: getSiteFolder(opts.outDir||getDefaultDownloadDir(), opts.url)}
})
ipcMain.handle('select-folder', async ()=>{ const r=await dialog.showOpenDialog({properties:['openDirectory']}); if(r.canceled) return null; return r.filePaths[0] })
ipcMain.handle('open-folder', async (_e, dir:string)=>{ shell.openPath(dir||getDefaultDownloadDir()) })
ipcMain.handle('get-default-dir', async ()=> getDefaultDownloadDir())
ipcMain.handle('get-config', async ()=> loadConfig())
ipcMain.handle('set-config', async (_e, patch:any)=>{
  appConfig={...loadConfig(), ...patch}
  saveConfig(appConfig)
  if(patch.openAtLogin !== undefined || patch.startMinimized !== undefined){
    app.setLoginItemSettings({ openAtLogin: !!appConfig.openAtLogin, openAsHidden: appConfig.startMinimized })
  }
  return appConfig
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
    const get=(url:string)=> new Promise<string>((res,rej)=>{ https.get(url,{headers:{'User-Agent':'Flexplorer'}},r=>{ let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)) }).on('error',rej) })
    const data=await get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest') as any
    const j=JSON.parse(data as any); const latest=j.tag_name||j.name; let cur=''; try{ const {execSync}=await import('child_process'); cur=execSync(`${findYtDlp()} --version`,{encoding:'utf-8'}).trim() }catch{}
    return { latest, current: cur, hasUpdate: latest && cur && !latest.includes(cur), url: j.html_url }
  }catch(e:any){ return { error:String(e) } }
})
ipcMain.handle('download-yt-dlp', async ()=>{
  const binDir=path.dirname(ytDlpPath); ensureDir(binDir)
  const url=process.platform==='win32'?'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe':'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
  return new Promise((resolve,reject)=>{
    const https=require('https'); const file=fs.createWriteStream(ytDlpPath)
    https.get(url,(res:any)=>{
      if(res.statusCode===302||res.statusCode===301){ https.get(res.headers.location,(r2:any)=>{ r2.pipe(file); r2.on('end',()=>{ file.close(); if(process.platform!=='win32') fs.chmodSync(ytDlpPath,0o755); resolve(ytDlpPath)})}).on('error',reject)}
      else { res.pipe(file); res.on('end',()=>{ file.close(); if(process.platform!=='win32') fs.chmodSync(ytDlpPath,0o755); resolve(ytDlpPath)})}
    }).on('error',reject)
  })
})
ipcMain.handle('sniffed-url', async (_e, data:any)=>{ if(mainWindow) mainWindow.webContents.send('sniffed-url', data); return true })
ipcMain.handle('direct-download', async (_e, opts:any)=>{
  const outDir=getSiteFolder(opts.outDir||getDefaultDownloadDir(), opts.url); ensureDir(outDir)
  const filename=opts.filename||`video_${Date.now()}.mp4`; const outPath=path.join(outDir, filename)
  const ytdlp=findYtDlp(); const id=Date.now().toString(36)
  if(!canStart()){ pendingQueue.push({id, opts:{...opts, url:opts.url, outDir: outDir, filename}}); if(mainWindow) mainWindow.webContents.send('download-queued',{id, opts}); return {id, queued:true} }
  const args:string[]=['--js-runtimes','node','--no-warnings',
    '--extractor-args','generic:variant_query','--extractor-args','generic:fragment_query','--hls-use-mpegts','--concurrent-fragments','16','--extractor-args','generic:impersonate=chrome']
  if(appConfig.speedLimitKB>0) args.push('--limit-rate', `${appConfig.speedLimitKB}K`)
  const headers:string[]=[]
  // HLS URL'den ID çıkar: ...-Pq7eJSHPqS3.mp4 -> Pq7eJSHPqS3
  let embedId = ''
  try{ const m=opts.url.match(/-([A-Za-z0-9]{8,12})\.mp4/); if(m) embedId=m[1] }catch{}
  // HLS için tek doğru Referer: embed ID'li olan — çoklu Referer 404 yapıyor
  const isHlsUrl = opts.url.includes('cdnimages') || opts.url.includes('playmix') || opts.url.includes('master.txt') || opts.url.includes('/hls/')
  if(isHlsUrl && embedId){
    headers.push(`Referer:https://hdfilmcehennemi.mobi/video/embed/${embedId}/`)
    headers.push(`Origin:https://hdfilmcehennemi.mobi`)
  } else if(opts.pageUrl){
    try{ headers.push(`Referer:${opts.pageUrl}`); headers.push(`Origin:${new URL(opts.pageUrl).origin}`) }catch{}
  } else if(embedId){
    headers.push(`Referer:https://hdfilmcehennemi.mobi/video/embed/${embedId}/`)
  }
  if(opts.cookie) headers.push(`Cookie:${opts.cookie}`)
  headers.forEach(h=> { args.push('--add-header', h) })
  args.push('--add-header','User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
  if(!opts.cookie) args.push('--cookies-from-browser','chrome')
  if(opts.url.includes('master.txt') || opts.url.includes('/hls/') || opts.url.includes('cdnimages')) args.push('--hls-use-mpegts')
  args.push('-o', outPath, '--continue', opts.url)
  console.log('[direct-download]', ytdlp, args.join(' '))
  const proc=spawn(ytdlp, args)
  activeDownloads.set(id, proc)
  activeOpts.set(id, opts)
  proc.stdout.on('data',(d:Buffer)=>{ const t=d.toString(); if(t.includes('[download]') && mainWindow) mainWindow.webContents.send('download-log',{id,text:t.trim().slice(0,400)}) })
  proc.stderr.on('data',(d:Buffer)=>{ const txt=d.toString(); if(mainWindow) mainWindow.webContents.send('download-log',{id,text:txt.trim().slice(0,500)}); console.error('[yt-dlp]', txt.slice(0,500)) })
  proc.on('close',code=>{
    activeDownloads.delete(id)
    activeOpts.delete(id)
    if(pausingIds.has(id)){ pausingIds.delete(id); processPending(); return }
    const isHls = opts.url.includes('master.txt') || opts.url.includes('/hls/') || opts.url.includes('playmix') || opts.url.includes('cdnimages')
    if(code!==0 && isHls){
      console.log('[direct-download] yt-dlp failed code',code,'try ffmpeg fallback for HLS')
      let ffHeaders = `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n`
      let eid=''; try{ const mm=opts.url.match(/-([A-Za-z0-9]{8,12})\.mp4/); if(mm) eid=mm[1] }catch{}
      const isHls2 = opts.url.includes('cdnimages') || opts.url.includes('playmix') || opts.url.includes('master.txt')
      if(isHls2 && eid) ffHeaders+=`Referer: https://hdfilmcehennemi.mobi/video/embed/${eid}/\r\nOrigin: https://hdfilmcehennemi.mobi\r\n`
      else if(opts.pageUrl){ try{ ffHeaders+=`Referer: ${opts.pageUrl}\r\nOrigin: ${new URL(opts.pageUrl).origin}\r\n` }catch{} }
      else if(eid) ffHeaders+=`Referer: https://hdfilmcehennemi.mobi/video/embed/${eid}/\r\n`
      if(opts.cookie) ffHeaders+=`Cookie: ${opts.cookie}\r\n`
      const ffArgs=['-headers', ffHeaders, '-i', opts.url, '-c','copy', '-bsf:a','aac_adtstoasc', outPath]
      console.log('[ffmpeg fallback]', ffArgs.join(' ').slice(0,300))
      const ffProc=spawn('ffmpeg', ffArgs)
      activeDownloads.set(id+'_ff', ffProc)
      ffProc.stderr.on('data',(d:Buffer)=>{ const t=d.toString(); if(mainWindow) mainWindow.webContents.send('download-log',{id,text:'[ffmpeg] '+t.trim().slice(0,500)}); console.log('[ffmpeg]',t.slice(0,500)) })
      ffProc.on('close',ffCode=>{
        activeDownloads.delete(id+'_ff')
        if(mainWindow) mainWindow.webContents.send('download-done',{id,code:ffCode,outDir})
        try{ new Notification({title: ffCode===0?'İndirme bitti (ffmpeg)':'Hata', body: opts.url.slice(0,50)}).show()}catch{}
        if(ffCode!==0 && mainWindow) mainWindow.webContents.send('download-log',{id,text:`[ffmpeg] HATA ${ffCode} — Cookie/CF gerekli olabilir. Chrome'da videoyu tekrar oynatıp hemen indirin, veya Ayarlar'da çerez iznini kontrol edin.`})
        processPending()
      })
      ffProc.on('error',(e:any)=>{ activeDownloads.delete(id+'_ff'); if(mainWindow) mainWindow.webContents.send('download-error',{id,error:String(e)}); processPending() })
      return
    }
    if(mainWindow) mainWindow.webContents.send('download-done',{id,code,outDir})
    try{ new Notification({title: code===0?'İndirme bitti':'Hata', body: opts.url.slice(0,50)}).show()}catch{}
    if(code!==0 && mainWindow) mainWindow.webContents.send('download-log',{id,text:`HATA: ${code} - Cookie/Referer/expire. Videoyu tekrar oynatıp taze yakalayın, Hızlı İndir'e hemen basın.`})
    processPending()
  })
  proc.on('error',(e:any)=>{ activeDownloads.delete(id); activeOpts.delete(id); if(mainWindow) mainWindow.webContents.send('download-error',{id,error:String(e)}); processPending() })
  return {id, outPath}
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
    const startTime = Date.now()

    const downloadPart = (index: number, start: number, end: number) => {
      return new Promise<void>((resolve, reject) => {
        const partFile = path.join(tempDir, `part_${index}`)
        const fileStream = fs.createWriteStream(partFile)
        const parsedUrl = new URL(opts.url)

        const req = protocol.get({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: getHeaders(`bytes=${start}-${end}`)
        }, res => {
          if (res.statusCode !== 206 && res.statusCode !== 200) {
            fileStream.close()
            return reject(new Error(`HTTP ${res.statusCode} for part ${index}`))
          }

          res.on('data', (chunk: Buffer) => {
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
          reject(err)
        })

        activeReqs.push(req)
      })
    }

    activeDownloads.set(id, {
      kill: () => {
        activeReqs.forEach(r => { try { r.destroy() } catch {} })
        try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
      }
    })
    activeOpts.set(id, opts)

    // Parçaları paralel başlat
    const promises = []
    for (let i = 0; i < partsCount; i++) {
      const start = i * partSize
      const end = i === partsCount - 1 ? totalSize - 1 : (i + 1) * partSize - 1
      promises.push(downloadPart(i, start, end))
    }

    await Promise.all(promises)

    // Parçaları birleştir
    const finalStream = fs.createWriteStream(outPath)
    for (let i = 0; i < partsCount; i++) {
      const partFile = path.join(tempDir, `part_${i}`)
      const data = fs.readFileSync(partFile)
      finalStream.write(data)
    }
    finalStream.end()

    // Geçici klasörü temizle
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}

    activeDownloads.delete(id)
    activeOpts.delete(id)

    if (pausingIds.has(id)) {
      pausingIds.delete(id)
      processPending()
      return
    }

    if (mainWindow) mainWindow.webContents.send('download-done', { id, code: 0, outDir })
    try { new Notification({ title: 'Flexplorer: İndirme bitti (8 Parça)', body: filename.slice(0, 50) }).show() } catch {}
    processPending()

  } catch (err: any) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
    // Hata durumunda standart tek akış indirmeyi dene
    console.warn('[MultiPart] fallback to standard http-download:', err.message)
    runHttpDownload(id, opts, outDir, outPath, filename)
  }
}

function runHttpDownload(id:string, opts:any, outDir:string, outPath:string, filename:string){
  const file = fs.createWriteStream(outPath)
  const protocol = opts.url.startsWith('https') ? https : http
  const startTime = Date.now()
  const req = protocol.get(opts.url, { 
    headers: { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...(opts.cookie ? { Cookie: opts.cookie } : {})
    } 
  }, (res:any)=>{
    if(res.statusCode===301||res.statusCode===302||res.statusCode===303||res.statusCode===307){
      file.close(); fs.unlink(outPath, ()=>{})
      const nextOpts = { ...opts, url: res.headers.location }
      runHttpDownload(id, nextOpts, outDir, outPath, filename)
      return
    }
    if (res.statusCode >= 400) {
      file.destroy(); fs.unlink(outPath, ()=>{}); activeDownloads.delete(id); activeOpts.delete(id)
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
    file.destroy(); fs.unlink(outPath, ()=>{}); activeDownloads.delete(id); activeOpts.delete(id)
    if(mainWindow) mainWindow.webContents.send('download-error', {id, error: String(e)})
    processPending()
  })
  activeDownloads.set(id, { kill: ()=> req.destroy() })
  activeOpts.set(id, opts)
  file.on('finish', ()=>{
    file.close(); activeDownloads.delete(id); activeOpts.delete(id)
    if(pausingIds.has(id)){ pausingIds.delete(id); processPending(); return }
    if(mainWindow) mainWindow.webContents.send('download-done', {id, code:0, outDir})
    try{ new Notification({title: 'Flexplorer: İndirme bitti', body: filename.slice(0,50)}).show()}catch{}
    processPending()
  })
}
ipcMain.handle('http-download', async (_e, opts:any)=>{
  const outDir=getSiteFolder(opts.outDir||getDefaultDownloadDir(), opts.url); ensureDir(outDir)
  const filename = opts.filename || (opts.url.split('/').pop()?.split('?')[0] || `file_${Date.now()}`)
  const outPath=path.join(outDir, filename)
  const id=Date.now().toString(36)
  if(!canStart()){ pendingQueue.push({id, opts:{...opts, outDir, filename}}); if(mainWindow) mainWindow.webContents.send('download-queued',{id, opts}); return {id, queued:true} }
  if(mainWindow) mainWindow.webContents.send('download-started', { id, opts: {...opts, title: filename}, outDir })
  runMultiPartHttpDownload(id, opts, outDir, outPath, filename)
  return {id, outPath}
})
