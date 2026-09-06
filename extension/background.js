// Flexplorer yakalayıcı - medya + genel dosya indirmeleri (IDM tarzı)
const MEDIA_PAT = /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|flv|mov)($|\?)/i
const DOC_PAT = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|epub|txt|csv)($|\?)/i
const ARCHIVE_PAT = /\.(zip|rar|7z|gz|tar|iso|torrent)($|\?)/i
const INSTALLER_PAT = /\.(exe|msi|apk|dmg|pkg|deb|rpm)($|\?)/i
const ANY_FILE = /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|flv|mov|zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i
const EXCLUDE = /(youtube\.com\/s\/search\/audio|generate_204|google.*\/search|chrome-extension|s\.pinimg|doubleclick|googletag|analytics|collect\?|beacon|\.jpg(\?|$)|image\d+\.jpg|\.png(\?|$)|favicon|\.css(\?|$)|\.js(\?|$)|adservice|ads\.|track|pixel)/i
const SITE_CDN = /(playmix\.uno|hls\d*\.|master\.(txt|m3u8)|\/hls\/.*\.(m3u8|txt|mp4)|googlevideo|manifest\.googlevideo|\.m3u8(\?|$)|\.mpd(\?|$)|videoplayback\?)/i

const lastSentUrls = new Set()

function shouldSend(url){
  if (!url) return false
  const cleanUrl = url.split('?')[0].split('#')[0]
  if (lastSentUrls.has(cleanUrl)) return false
  lastSentUrls.add(cleanUrl)
  setTimeout(() => lastSentUrls.delete(cleanUrl), 20000) // 20 saniye boyunca flood engeli
  return true
}

function detectType(url){
  const m = url.match(/\.([a-z0-9]{2,5})($|\?)/i)
  if (m) return m[1].toLowerCase()
  if (url.includes('videoplayback') || url.includes('googlevideo')) return 'mp4'
  if (url.includes('master.txt') || url.includes('.m3u8')) return 'm3u8'
  if (url.includes('.mpd')) return 'mpd'
  return 'file'
}

// WebSocket bağlantısı yönetimi
let socket = null
let isConnecting = false

function initWebSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
  isConnecting = true
  try {
    socket = new WebSocket('ws://127.0.0.1:8765')
    socket.onopen = () => {
      console.log('[Flexplorer] WebSocket connected to desktop app')
      isConnecting = false
    }
    socket.onclose = () => {
      socket = null
      isConnecting = false
      setTimeout(initWebSocket, 3000)
    }
    socket.onerror = () => {
      if (socket) socket.close()
    }
  } catch (e) {
    isConnecting = false
    setTimeout(initWebSocket, 3000)
  }
}

initWebSocket()

async function sendToFlexplorer(data, opts={}){
  if (!opts.force && !shouldSend(data.url)) { console.log('[Flexplorer] debounced', data.url.slice(0,80)); return }
  let cookieHeader = ''
  try{
    const cookies = await chrome.cookies.getAll({ domain: new URL(data.url).hostname })
    if(cookies && cookies.length) cookieHeader = cookies.map(c=> `${c.name}=${c.value}`).join('; ')
    else if (data.pageUrl) {
      const pageCookies = await chrome.cookies.getAll({ url: data.pageUrl })
      if(pageCookies.length) cookieHeader = pageCookies.map(c=> `${c.name}=${c.value}`).join('; ')
    }
  }catch(e){}
  const payload = { ...data, cookie: cookieHeader }

  let sent = false

  // 1. Tercih: Native Messaging (varsa doğrudan işletim sistemi üzerinden)
  try {
    const res = await new Promise((resolve) => {
      chrome.runtime.sendNativeMessage('com.flexplorer.nm', { type: 'download-request', data: payload }, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null)
        } else {
          resolve(response)
        }
      })
    })
    if (res && res.success) {
      sent = true
      console.log('[Flexplorer] sniff sent via Native Messaging', data.url.slice(0,60), data.type)
    }
  } catch (e) {
    // Native messaging başarısız olursa diğer yolları dene
  }

  // 2. Tercih: WebSocket ile anında gönder
  if (!sent && socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: 'sniffed-url', data: payload }))
      sent = true
      console.log('[Flexplorer] sniff sent via WS', data.url.slice(0,60), data.type)
    } catch (e) {
      console.log('[Flexplorer] WS send error, falling back to HTTP', e.message)
    }
  }

  // 3. Yedek: HTTP POST fallback
  if (!sent) {
    try {
      const r = await fetch('http://127.0.0.1:8765/sniff', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      console.log('[Flexplorer] sniff sent via HTTP', r.status, data.url.slice(0,60), data.type)
    } catch (e) { console.log('[Flexplorer] sniff fail', e.message) }
  }

  const { items=[] } = await chrome.storage.local.get('items');
  const existingIdx = items.findIndex(x=> x.url===data.url)
  if (existingIdx!==-1) items.splice(existingIdx,1)
  items.unshift({ ...payload, time: new Date().toLocaleTimeString(), tabUrl: data.pageUrl });
  await chrome.storage.local.set({ items: items.slice(0,80) });
}

chrome.webRequest.onBeforeRequest.addListener((details)=>{
  const url = details.url;
  if (!url || url.length < 20) return
  if (url.includes('/video/embed/')) return
  if (EXCLUDE.test(url)) return
  const isMedia = MEDIA_PAT.test(url) || SITE_CDN.test(url)
  const isFile = DOC_PAT.test(url) || ARCHIVE_PAT.test(url) || INSTALLER_PAT.test(url)
  if (!isMedia && !isFile) return
  if (['stylesheet','image','font','ping','script'].includes(details.type)) return
  if (url.includes('/s/search/audio/')) return
  chrome.tabs.get(details.tabId, (tab)=>{
    const pageUrl = tab?.url || ''
    // YouTube gibi sitelerde doğrudan ana sayfa URL'sini gönder
    const isVideoSite = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com/i.test(pageUrl)
    const targetUrl = isVideoSite ? pageUrl : url
    sendToFlexplorer({ url: targetUrl, type: detectType(url), pageUrl })
  })
}, { urls: ["<all_urls>"] })

chrome.runtime.onMessage.addListener((msg)=>{
  if(msg?.type==='sniffed'){ sendToFlexplorer(msg.data) }
})

chrome.runtime.onInstalled.addListener(()=>{
  chrome.contextMenus.removeAll(()=>{
    chrome.contextMenus.create({ id:'flex-link', title:'Flexplorer ile indir', contexts:['link','video','audio','image'] })
    chrome.contextMenus.create({ id:'flex-page', title:'Bu sayfayı Flexplorer ile indir', contexts:['page'] })
  })
})

chrome.contextMenus.onClicked.addListener((info, tab)=>{
  const url = info.srcUrl || info.linkUrl || info.pageUrl || tab?.url
  if(!url) return
  sendToFlexplorer({ url, type: detectType(url), pageUrl: tab?.url || info.pageUrl || '' }, { force:true })
})

// IDM tarzı: tarayıcı indirmelerini yakala ve uygulamaya yönlendir
chrome.downloads.onCreated.addListener(async (item)=>{
  try{
    const url = item.finalUrl || item.url
    if(!url || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('chrome') || url.startsWith('edge')) return
    if(EXCLUDE.test(url)) return
    const mime = (item.mime || '').toLowerCase()
    const name = (item.filename || '').toLowerCase()
    const byExt = ANY_FILE.test(url) || ANY_FILE.test(name)
    const byMime = mime && !mime.startsWith('text/') && !mime.includes('html') && !mime.includes('javascript') && !mime.startsWith('image/')
    const bigEnough = (item.fileSize || 0) > 128 * 1024
    if (!byExt && !(byMime && bigEnough) && !(item.fileSize > 1024 * 1024)) return
    try{ await chrome.downloads.cancel(item.id); await chrome.downloads.erase({ id: item.id }) }catch(e){}
    const type = detectType(url) || detectType(name) || 'file'
    sendToFlexplorer({
      url,
      type,
      pageUrl: item.referrer || '',
      filename: item.filename ? item.filename.split(/[\\/]/).pop() : undefined
    }, { force:true })
  }catch(e){ console.log('[Flexplorer] download intercept', e.message) }
})
