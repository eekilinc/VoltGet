// VoltGet Yakalayıcı - Background Service Worker (Manifest V3)
// IDM Tarzı Video Üstü İndirme ve Medya / Dosya Yakalama

const MEDIA_PAT = /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|flv|mov)($|\?)/i
const DOC_PAT = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|epub|txt|csv)($|\?)/i
const ARCHIVE_PAT = /\.(zip|rar|7z|gz|tar|iso|torrent)($|\?)/i
const INSTALLER_PAT = /\.(exe|msi|apk|dmg|pkg|deb|rpm)($|\?)/i
const ANY_FILE = /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|flv|mov|zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i
const EXCLUDE = /(youtube\.com\/s\/search\/audio|generate_204|google.*\/search|chrome-extension|s\.pinimg|doubleclick|googletag|analytics|collect\?|beacon|\.jpg(\?|$)|image\d+\.jpg|\.png(\?|$)|favicon|\.css(\?|$)|\.js(\?|$)|adservice|ads\.|track|pixel)/i
const SITE_CDN = /(playmix|cdnimages|molystream|stream\d*|video\d*|hls\d*|master\.(txt|m3u8)|\/hls\/|\/stream\/|\/playlist|\/manifest|googlevideo|manifest\.googlevideo|\.m3u8(\?|$)|\.mpd(\?|$)|videoplayback\?)/i
const IGNORED_DOWNLOAD_EXTS = /\.(js|mjs|cjs|jsx|ts|tsx|css|scss|less|html|htm|xhtml|php|asp|aspx|jsp|json|xml|map|svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|otf)($|\?)/i
const IGNORED_MIME = /(javascript|ecmascript|css|html|json|xml|image\/|font\/|text\/plain)/i

// Segment ve chunk filtreleri (Flood engelleme)
function isChunkOrSegment(url) {
  if (!url || typeof url !== 'string') return true
  if (url.includes('range=') || url.includes('.ts?') || url.includes('sq=') || url.includes('seq=')) return true
  if (url.includes('segment-') || url.includes('init=') || url.includes('frag=')) return true
  if (url.includes('/s/search/audio/') || url.includes('generate_204')) return true
  return false
}

const sentUrlCache = new Map() // url -> timestamp

function shouldSend(url, pageUrl) {
  if (!url || isChunkOrSegment(url)) return false
  const key = (pageUrl ? pageUrl.split('#')[0] : '') + '|' + url.split('?')[0]
  const lastTime = sentUrlCache.get(key) || 0
  const now = Date.now()
  if (now - lastTime < 60000) { // 60 saniye boyunca aynı medya floodunu engelle
    return false
  }
  sentUrlCache.set(key, now)
  return true
}

function detectType(url) {
  if (url.includes('/q/') || url.includes('master.txt') || url.includes('.m3u8') || url.includes('/hls/')) return 'm3u8'
  if (url.includes('.mpd')) return 'mpd'
  if (url.includes('videoplayback') || url.includes('googlevideo')) return 'mp4'
  const clean = url.split('?')[0].split('#')[0]
  const lastPart = clean.split('/').pop() || ''
  const m = lastPart.match(/\.([a-z0-9]{2,5})$/i)
  if (m) return m[1].toLowerCase()
  return 'file'
}

function normalizeToMasterPlaylist(url) {
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

// WebSocket bağlantısı yönetimi (Keepalive ile Service Worker uyanık tutulur)
let socket = null
let isConnecting = false
let keepAliveTimer = null

function initWebSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
  isConnecting = true
  try {
    socket = new WebSocket('ws://127.0.0.1:8765')
    socket.onopen = () => {
      console.log('[VoltGet] WebSocket connected to desktop app')
      isConnecting = false
      if (keepAliveTimer) clearInterval(keepAliveTimer)
      keepAliveTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }))
        }
      }, 15000)
    }
    socket.onclose = () => {
      if (keepAliveTimer) clearInterval(keepAliveTimer)
      socket = null
      isConnecting = false
      setTimeout(initWebSocket, 2500)
    }
    socket.onerror = () => {
      if (socket) socket.close()
    }
  } catch (e) {
    isConnecting = false
    setTimeout(initWebSocket, 2500)
  }
}

initWebSocket()
if (chrome.runtime.onStartup) chrome.runtime.onStartup.addListener(initWebSocket)
if (chrome.runtime.onInstalled) chrome.runtime.onInstalled.addListener(initWebSocket)

async function sendToVoltGet(data, opts = {}) {
  if (data && data.url) {
    data.url = normalizeToMasterPlaylist(data.url)
  }
  const userInitiated = !!opts.userInitiated || !!data.userInitiated
  if (!userInitiated && !opts.force && !shouldSend(data.url, data.pageUrl)) {
    return
  }

  let cookieHeader = ''
  try {
    const isYouTube = (data.url && (data.url.includes('youtube.com') || data.url.includes('youtu.be') || data.url.includes('googlevideo.com'))) ||
                      (data.pageUrl && (data.pageUrl.includes('youtube.com') || data.pageUrl.includes('youtu.be')))
    if (!isYouTube) {
      const cookies = await chrome.cookies.getAll({ domain: new URL(data.url).hostname })
      if (cookies && cookies.length) {
        cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
      } else if (data.pageUrl) {
        const pageCookies = await chrome.cookies.getAll({ url: data.pageUrl })
        if (pageCookies.length) cookieHeader = pageCookies.map(c => `${c.name}=${c.value}`).join('; ')
      }
    }
  } catch (e) {}

  const payload = {
    ...data,
    cookie: cookieHeader,
    userInitiated: userInitiated,
    showDialog: !!data.showDialog
  }

  let sent = false

  // 1. Tercih: Native Messaging (varsa doğrudan işletim sistemi üzerinden)
  try {
    const res = await new Promise((resolve) => {
      chrome.runtime.sendNativeMessage('com.voltget.nm', { type: 'download-request', data: payload }, (response) => {
        if (chrome.runtime.lastError) resolve(null)
        else resolve(response)
      })
    })
    if (res && res.success) {
      sent = true
      console.log('[VoltGet] sent via NM', data.url.slice(0, 60))
    }
  } catch (e) {}

  // 2. Tercih: WebSocket ile anında gönder
  if (!sent && socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: 'sniffed-url', data: payload }))
      sent = true
      console.log('[VoltGet] sent via WS', data.url.slice(0, 60))
    } catch (e) {
      console.log('[VoltGet] WS send error, falling back to HTTP')
    }
  }

  // 3. Yedek: HTTP POST fallback
  if (!sent) {
    try {
      await fetch('http://127.0.0.1:8765/sniff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      console.log('[VoltGet] sent via HTTP', data.url.slice(0, 60))
    } catch (e) {
      console.log('[VoltGet] sniff fail', e.message)
    }
  }

  // Eklenti Popup listesi için storage'a kaydet
  const { items = [] } = await chrome.storage.local.get('items')
  const existingIdx = items.findIndex(x => x.url === data.url)
  if (existingIdx !== -1) items.splice(existingIdx, 1)
  items.unshift({ ...payload, time: new Date().toLocaleTimeString(), tabUrl: data.pageUrl })
  await chrome.storage.local.set({ items: items.slice(0, 80) })
}

const tabMediaMap = new Map() // tabId -> [{ url, type, time }]
const domainMediaMap = new Map() // domain -> [{ url, type, time }]
const globalMediaHistory = [] // [{ url, type, time }]
let lastSniffedStream = null // { url, type, pageUrl, time }

function cleanDomain(u) {
  try { return new URL(u).hostname.replace(/^www\./i, '').toLowerCase() } catch { return '' }
}

// Ağ isteklerini dinle (Sadece ana medyalar, segmentler elenir)
chrome.webRequest.onBeforeRequest.addListener((details) => {
  const url = details.url
  if (!url || url.length < 20) return
  if (isChunkOrSegment(url)) return
  if (EXCLUDE.test(url)) return

  const isMedia = MEDIA_PAT.test(url) || SITE_CDN.test(url)
  const isFile = DOC_PAT.test(url) || ARCHIVE_PAT.test(url) || INSTALLER_PAT.test(url)
  if (!isMedia && !isFile) return
  if (['stylesheet', 'image', 'font', 'ping', 'script'].includes(details.type)) return

  const normalizedUrl = normalizeToMasterPlaylist(url)
  const detectedType = detectType(normalizedUrl)
  const mediaEntry = { url: normalizedUrl, type: detectedType, time: Date.now() }

  if (isMedia) {
    lastSniffedStream = mediaEntry
    if (!globalMediaHistory.some(x => x.url === normalizedUrl)) {
      globalMediaHistory.unshift(mediaEntry)
      if (globalMediaHistory.length > 40) globalMediaHistory.pop()
    }
  }

  if (details.tabId >= 0) {
    const list = tabMediaMap.get(details.tabId) || []
    if (!list.some(x => x.url === normalizedUrl)) {
      list.unshift(mediaEntry)
      tabMediaMap.set(details.tabId, list.slice(0, 20))
    }
  }

  if (details.initiator && isMedia) {
    const initDom = cleanDomain(details.initiator)
    if (initDom) {
      const idlist = domainMediaMap.get(initDom) || []
      if (!idlist.some(x => x.url === normalizedUrl)) {
        idlist.unshift(mediaEntry)
        domainMediaMap.set(initDom, idlist.slice(0, 20))
      }
    }
  }

  chrome.tabs.get(details.tabId, (tab) => {
    const pageUrl = tab?.url || ''
    const dom = cleanDomain(pageUrl)
    if (dom && isMedia) {
      const dlist = domainMediaMap.get(dom) || []
      if (!dlist.some(x => x.url === normalizedUrl)) {
        dlist.unshift(mediaEntry)
        domainMediaMap.set(dom, dlist.slice(0, 20))
      }
    }

    const isVideoSite = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com/i.test(pageUrl)
    const targetUrl = isVideoSite ? pageUrl : normalizedUrl
    sendToVoltGet({ url: targetUrl, type: detectedType, pageUrl }, { userInitiated: false })
  })
}, { urls: ["<all_urls>"] })

function pickBestStreamFromList(list) {
  if (!list || !list.length) return null
  // 1. En yüksek öncelik: master akışlar veya /q/ akışları (Hem video hem ses içeren ana playlist)
  const master = list.find(x => /master\.(txt|m3u8)|manifest\.mpd|\/q\/\d+/i.test(x.url))
  if (master) return master

  // 2. İkinci öncelik: playlist.m3u8 veya index.m3u8 (video/audio alt kanalı olmayan ana oynatma listesi)
  const mainPlaylist = list.find(x => /(playlist|index)\.m3u8/i.test(x.url) && !/(?:video|audio|_vid|_aud|tracks-v)/i.test(x.url))
  if (mainPlaylist) return mainPlaylist

  // 3. Üçüncü öncelik: doğrudan tek parça MP4 (ses ve video gömülü)
  const mp4 = list.find(x => /\.mp4($|\?)/i.test(x.url) && !/frag|segment|part|f[0-9]+/i.test(x.url))
  if (mp4) return mp4

  // 4. Genel m3u8 akışları (ses olmayan alt akışları hariç tutmaya çalış)
  const anyM3u8 = list.find(x => (x.type === 'm3u8' || x.url.includes('.m3u8') || x.url.includes('/q/')) && !/(?:_aud|audio)/i.test(x.url))
  if (anyM3u8) return anyM3u8

  return list[0]
}

// Content script mesajlarını dinle (Video üstü buton veya sayfa tarayıcı)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'get_best_stream') {
    const tabId = sender?.tab?.id
    const pageUrl = msg.pageUrl || sender?.tab?.url || ''
    const dom = cleanDomain(pageUrl)
    
    let candidate = null
    if (tabId && tabMediaMap.has(tabId)) {
      candidate = pickBestStreamFromList(tabMediaMap.get(tabId))
    }
    if (!candidate && dom && domainMediaMap.has(dom)) {
      candidate = pickBestStreamFromList(domainMediaMap.get(dom))
    }
    if (!candidate && globalMediaHistory.length) {
      candidate = pickBestStreamFromList(globalMediaHistory)
    }
    if (!candidate && lastSniffedStream && (Date.now() - lastSniffedStream.time < 300000)) {
      candidate = lastSniffedStream
    }
    if (candidate && candidate.url) {
      candidate = { ...candidate, url: normalizeToMasterPlaylist(candidate.url) }
    }
    sendResponse(candidate || null)
    return false
  }

  if (msg?.type === 'sniffed') {
    const cleanUrl = normalizeToMasterPlaylist(msg.data.url)
    const cleanData = { ...msg.data, url: cleanUrl }
    if (sender?.tab?.id) {
      const list = tabMediaMap.get(sender.tab.id) || []
      if (!list.some(x => x.url === cleanUrl)) {
        list.unshift({ url: cleanUrl, type: cleanData.type, time: Date.now() })
        tabMediaMap.set(sender.tab.id, list.slice(0, 20))
      }
    }
    sendToVoltGet(cleanData, { userInitiated: false })
  } else if (msg?.type === 'user_request_download') {
    let downloadData = { ...msg.data }
    const isVideoPortal = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(downloadData.pageUrl || '') ||
                          /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(downloadData.url || '') ||
                          (downloadData.url && downloadData.url.includes('googlevideo.com'))
    if (isVideoPortal) {
      if (downloadData.pageUrl && /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(downloadData.pageUrl)) {
        downloadData.url = downloadData.pageUrl
      } else if (sender?.tab?.url && /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(sender.tab.url)) {
        downloadData.url = sender.tab.url
        downloadData.pageUrl = sender.tab.url
      }
    }
    
    // Eğer video portalı değilse ve gelen URL doğrudan bir medya akışı (.m3u8, .mp4, master.txt) DEĞİLSE
    // (örneğin embed sayfası, player linki, .html, .php vs. ise hafızadaki gerçek stream ile değiştir)
    const isDirectMedia = /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a)($|\?)/i.test(downloadData.url) || downloadData.url.includes('master.txt') || downloadData.url.includes('/q/')
    if (!isVideoPortal && !isDirectMedia) {
      const tabId = sender?.tab?.id
      const dom = cleanDomain(downloadData.pageUrl || '')
      
      let candidate = null
      if (tabId && tabMediaMap.has(tabId)) {
        candidate = pickBestStreamFromList(tabMediaMap.get(tabId))
      }
      if (!candidate && dom && domainMediaMap.has(dom)) {
        candidate = pickBestStreamFromList(domainMediaMap.get(dom))
      }
      if (!candidate && globalMediaHistory.length) {
        candidate = pickBestStreamFromList(globalMediaHistory)
      }
      if (!candidate && lastSniffedStream && (Date.now() - lastSniffedStream.time < 300000)) {
        candidate = lastSniffedStream
      }

      if (candidate) {
        const realStreamUrl = normalizeToMasterPlaylist(candidate.url)
        console.log('[VoltGet] Replacing non-media embed URL with real stream URL:', realStreamUrl)
        downloadData.url = realStreamUrl
        downloadData.type = candidate.type || 'm3u8'
      }
    }
    sendToVoltGet(downloadData, { force: true, userInitiated: true })
  }
})

// Sağ tık menüsü
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'flex-link', title: 'VoltGet ile indir', contexts: ['link', 'video', 'audio', 'image'] })
    chrome.contextMenus.create({ id: 'flex-page', title: 'Bu sayfadaki medyayı VoltGet ile indir', contexts: ['page'] })
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.srcUrl || info.linkUrl || info.pageUrl || tab?.url
  if (!url) return
  sendToVoltGet({ url, type: detectType(url), pageUrl: tab?.url || info.pageUrl || '' }, { force: true, userInitiated: true })
})

// Tarayıcı doğrudan dosya indirmelerini yakala (IDM Download Intercept)
const interceptedDownloadUrls = new Map() // url -> timestamp

function notifyVoltGetGenericDownload(item, rawName) {
  const url = item.finalUrl || item.url
  const lastTime = interceptedDownloadUrls.get(url) || 0
  if (Date.now() - lastTime < 3500) return
  interceptedDownloadUrls.set(url, Date.now())

  const type = detectType(rawName) || detectType(url) || 'file'
  sendToVoltGet({
    url: url,
    filename: rawName,
    title: rawName,
    fileSize: item.fileSize || 0,
    type: type,
    pageUrl: item.referrer || '',
    isGenericDownload: true
  }, { force: true, userInitiated: true })
}

// 1. Erken yakalama: Doğrudan dosya bağlantısına tıklandığında hemen iptal et
chrome.downloads.onCreated.addListener((item) => {
  try {
    const url = item.finalUrl || item.url
    if (!url || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('chrome') || url.startsWith('edge')) return
    if (EXCLUDE.test(url) || IGNORED_DOWNLOAD_EXTS.test(url)) return

    const cleanUrl = url.split('?')[0]
    if (ANY_FILE.test(cleanUrl) && !IGNORED_DOWNLOAD_EXTS.test(cleanUrl)) {
      chrome.downloads.cancel(item.id, () => {
        chrome.downloads.erase({ id: item.id }, () => {})
      })
      const rawName = cleanUrl.split('/').pop() || 'indirilen_dosya'
      notifyVoltGetGenericDownload(item, rawName)
    }
  } catch (e) {}
})

// 2. Tam başlık & MIME tespiti yapıldığında yakalama (IDM Davranışı)
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  try {
    const url = item.finalUrl || item.url
    if (!url || url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('chrome') || url.startsWith('edge')) {
      if (typeof suggest === 'function') suggest()
      return
    }
    if (EXCLUDE.test(url) || IGNORED_DOWNLOAD_EXTS.test(url)) {
      if (typeof suggest === 'function') suggest()
      return
    }

    const rawName = item.filename ? item.filename.split(/[\\/]/).pop() : (url.split('/').pop()?.split('?')[0] || 'indirilen_dosya')
    const mime = (item.mime || '').toLowerCase()

    // Web scriptleri (.js), stiller (.css), sayfalar (.html, .php) ASLA indirme yöneticisine aktarılmaz!
    if (IGNORED_DOWNLOAD_EXTS.test(rawName) || IGNORED_MIME.test(mime)) {
      if (typeof suggest === 'function') suggest({ filename: item.filename })
      return
    }

    const isDocOrArchive = ANY_FILE.test(url) || ANY_FILE.test(rawName)
    const isBinary = mime && (mime.includes('octet-stream') || mime.includes('application/zip') || mime.includes('application/x-') || mime.includes('application/pdf')) && !IGNORED_MIME.test(mime)

    // Sadece gerçek arşiv, kurulum, belge veya medya dosyalarını yakala
    if (isDocOrArchive || isBinary) {
      chrome.downloads.cancel(item.id, () => {
        chrome.downloads.erase({ id: item.id }, () => {})
      })

      if (typeof suggest === 'function') {
        try { suggest({ filename: rawName }) } catch (e) {}
      }

      notifyVoltGetGenericDownload(item, rawName)
      return
    }

    // Normal sayfa ise Chrome olağan devam etsin
    if (typeof suggest === 'function') suggest({ filename: item.filename })
  } catch (e) {
    console.log('[VoltGet] download intercept error', e.message)
    if (typeof suggest === 'function') suggest()
  }
})


