// Flexplorer Yakalayıcı - Background Service Worker (Manifest V3)
// IDM Tarzı Video Üstü İndirme ve Medya / Dosya Yakalama

const MEDIA_PAT = /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|flv|mov)($|\?)/i
const DOC_PAT = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|epub|txt|csv)($|\?)/i
const ARCHIVE_PAT = /\.(zip|rar|7z|gz|tar|iso|torrent)($|\?)/i
const INSTALLER_PAT = /\.(exe|msi|apk|dmg|pkg|deb|rpm)($|\?)/i
const ANY_FILE = /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|flv|mov|zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i
const EXCLUDE = /(youtube\.com\/s\/search\/audio|generate_204|google.*\/search|chrome-extension|s\.pinimg|doubleclick|googletag|analytics|collect\?|beacon|\.jpg(\?|$)|image\d+\.jpg|\.png(\?|$)|favicon|\.css(\?|$)|\.js(\?|$)|adservice|ads\.|track|pixel)/i
const SITE_CDN = /(playmix|cdnimages|hls\d*|master\.(txt|m3u8)|\/hls\/.*\.(m3u8|txt|mp4)|googlevideo|manifest\.googlevideo|\.m3u8(\?|$)|\.mpd(\?|$)|videoplayback\?)/i

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
  const m = url.match(/\.([a-z0-9]{2,5})($|\?)/i)
  if (m) return m[1].toLowerCase()
  if (url.includes('videoplayback') || url.includes('googlevideo')) return 'mp4'
  if (url.includes('master.txt') || url.includes('.m3u8')) return 'm3u8'
  if (url.includes('.mpd')) return 'mpd'
  return 'file'
}

function normalizeToMasterPlaylist(url) {
  if (!url || typeof url !== 'string') return url
  return url.replace(/\/(?:txt\/)?[a-zA-Z0-9_.-]*sublist[a-zA-Z0-9_.-]*\.(txt|m3u8).*/i, '/master.$1')
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
      console.log('[VoltGet] WebSocket connected to desktop app')
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

async function sendToFlexplorer(data, opts = {}) {
  if (data && data.url) {
    data.url = normalizeToMasterPlaylist(data.url)
  }
  const userInitiated = !!opts.userInitiated || !!data.userInitiated
  if (!userInitiated && !opts.force && !shouldSend(data.url, data.pageUrl)) {
    return
  }

  let cookieHeader = ''
  try {
    const cookies = await chrome.cookies.getAll({ domain: new URL(data.url).hostname })
    if (cookies && cookies.length) {
      cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
    } else if (data.pageUrl) {
      const pageCookies = await chrome.cookies.getAll({ url: data.pageUrl })
      if (pageCookies.length) cookieHeader = pageCookies.map(c => `${c.name}=${c.value}`).join('; ')
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
      chrome.runtime.sendNativeMessage('com.flexplorer.nm', { type: 'download-request', data: payload }, (response) => {
        if (chrome.runtime.lastError) resolve(null)
        else resolve(response)
      })
    })
    if (res && res.success) {
      sent = true
      console.log('[Flexplorer] sent via NM', data.url.slice(0, 60))
    }
  } catch (e) {}

  // 2. Tercih: WebSocket ile anında gönder
  if (!sent && socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: 'sniffed-url', data: payload }))
      sent = true
      console.log('[Flexplorer] sent via WS', data.url.slice(0, 60))
    } catch (e) {
      console.log('[Flexplorer] WS send error, falling back to HTTP')
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
      console.log('[Flexplorer] sent via HTTP', data.url.slice(0, 60))
    } catch (e) {
      console.log('[Flexplorer] sniff fail', e.message)
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
  }

  if (details.tabId >= 0) {
    const list = tabMediaMap.get(details.tabId) || []
    if (!list.some(x => x.url === normalizedUrl)) {
      list.unshift(mediaEntry)
      tabMediaMap.set(details.tabId, list.slice(0, 20))
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
    sendToFlexplorer({ url: targetUrl, type: detectedType, pageUrl }, { userInitiated: false })
  })
}, { urls: ["<all_urls>"] })

// Content script mesajlarını dinle (Video üstü buton veya sayfa tarayıcı)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'get_best_stream') {
    const tabId = sender?.tab?.id
    const pageUrl = msg.pageUrl || sender?.tab?.url || ''
    const dom = cleanDomain(pageUrl)
    
    let candidate = null
    if (tabId && tabMediaMap.has(tabId)) {
      const list = tabMediaMap.get(tabId)
      candidate = list?.find(x => x.type === 'm3u8' || x.type === 'mpd' || x.url.includes('master.txt') || x.url.includes('.mp4')) || list?.[0]
    }
    if (!candidate && dom && domainMediaMap.has(dom)) {
      const list = domainMediaMap.get(dom)
      candidate = list?.find(x => x.type === 'm3u8' || x.type === 'mpd' || x.url.includes('master.txt') || x.url.includes('.mp4')) || list?.[0]
    }
    if (!candidate && lastSniffedStream && (Date.now() - lastSniffedStream.time < 180000)) {
      candidate = lastSniffedStream
    }
    if (candidate && candidate.url) {
      candidate = { ...candidate, url: normalizeToMasterPlaylist(candidate.url) }
    }
    sendResponse(candidate || null)
    return true
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
    sendToFlexplorer(cleanData, { userInitiated: false })
  } else if (msg?.type === 'user_request_download') {
    let downloadData = { ...msg.data }
    if (downloadData.url) downloadData.url = normalizeToMasterPlaylist(downloadData.url)
    const isVideoPortal = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(downloadData.pageUrl || '')
    
    // Eğer video portalı değilse ve gelen URL bir embed sayfasıysa veya m3u8/mp4 değilse,
    // bu sekme veya alan adı için yakalanmış en taze gerçek akış URL'sini kullan!
    const isStreamUrl = downloadData.url.includes('master.txt') || downloadData.url.includes('.m3u8') || downloadData.url.includes('.mpd') || downloadData.url.includes('/hls/') || downloadData.url.includes('.mp4')
    const isEmbedOrPage = !isStreamUrl && (downloadData.url.includes('/embed/') || downloadData.url.includes('rapidrame_id') || !MEDIA_PAT.test(downloadData.url))
    if (!isVideoPortal && isEmbedOrPage) {
      const tabId = sender?.tab?.id
      const dom = cleanDomain(downloadData.pageUrl || '')
      
      let candidate = null
      if (tabId && tabMediaMap.has(tabId)) {
        const list = tabMediaMap.get(tabId)
        candidate = list?.find(x => x.type === 'm3u8' || x.type === 'mpd' || x.url.includes('master.txt') || x.url.includes('.mp4')) || list?.[0]
      }
      if (!candidate && dom && domainMediaMap.has(dom)) {
        const list = domainMediaMap.get(dom)
        candidate = list?.find(x => x.type === 'm3u8' || x.type === 'mpd' || x.url.includes('master.txt') || x.url.includes('.mp4')) || list?.[0]
      }
      if (!candidate && lastSniffedStream && (Date.now() - lastSniffedStream.time < 180000)) {
        candidate = lastSniffedStream
      }

      if (candidate) {
        const realStreamUrl = normalizeToMasterPlaylist(candidate.url)
        console.log('[VoltGet] Replacing embed URL with real stream URL:', realStreamUrl)
        downloadData.url = realStreamUrl
        downloadData.type = candidate.type || 'm3u8'
      }
    }
    sendToFlexplorer(downloadData, { force: true, userInitiated: true })
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
  sendToFlexplorer({ url, type: detectType(url), pageUrl: tab?.url || info.pageUrl || '' }, { force: true, userInitiated: true })
})

// Tarayıcı doğrudan dosya indirmelerini yakala (IDM Download Intercept)
const interceptedDownloadUrls = new Map() // url -> timestamp

function notifyVoltGetGenericDownload(item, rawName) {
  const url = item.finalUrl || item.url
  const lastTime = interceptedDownloadUrls.get(url) || 0
  if (Date.now() - lastTime < 3500) return
  interceptedDownloadUrls.set(url, Date.now())

  const type = detectType(rawName) || detectType(url) || 'file'
  sendToFlexplorer({
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
    if (EXCLUDE.test(url)) return

    const cleanUrl = url.split('?')[0]
    if (ANY_FILE.test(cleanUrl) && !cleanUrl.endsWith('.html') && !cleanUrl.endsWith('.htm')) {
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
    if (EXCLUDE.test(url)) {
      if (typeof suggest === 'function') suggest()
      return
    }

    const rawName = item.filename ? item.filename.split(/[\\/]/).pop() : (url.split('/').pop()?.split('?')[0] || 'indirilen_dosya')
    const isDocOrArchive = ANY_FILE.test(url) || ANY_FILE.test(rawName)
    const mime = (item.mime || '').toLowerCase()
    const isBinary = mime && !mime.startsWith('text/') && !mime.includes('html') && !mime.includes('javascript')
    const isLarge = item.fileSize && item.fileSize > 256 * 1024

    // Dosya uzantısı, binary mime türü veya büyük boyuttaysa tarayıcı indirmesini iptal edip VoltGet'e aktar!
    if (isDocOrArchive || isBinary || isLarge) {
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


