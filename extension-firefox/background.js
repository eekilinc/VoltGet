// VoltGet Download Manager - Pro Background Service Worker (Manifest V3)
// Chrome, Edge, Brave, Opera, Vivaldi & Firefox MV3 uyumlu çekirdek

const DESKTOP_HOST = 'http://127.0.0.1:8765';
const DESKTOP_WS = 'ws://127.0.0.1:8765';
const NM_HOST_NAME = 'com.voltget.nm';

const MEDIA_PAT = /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|flv|mov)($|\?)/i;
const DOC_PAT = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|epub|txt|csv)($|\?)/i;
const ARCHIVE_PAT = /\.(zip|rar|7z|gz|tar|iso|torrent)($|\?)/i;
const INSTALLER_PAT = /\.(exe|msi|apk|dmg|pkg|deb|rpm)($|\?)/i;
const ANY_FILE =
  /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|flv|mov|zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i;
const EXCLUDE =
  /(youtube\.com\/s\/search\/audio|generate_204|google.*\/search|chrome-extension|moz-extension|s\.pinimg|doubleclick|googletag|analytics|collect\?|beacon|\.jpg(\?|$)|image\d+\.jpg|\.png(\?|$)|favicon|\.css(\?|$)|\.js(\?|$)|adservice|ads\.|track|pixel)/i;
const SITE_CDN =
  /(playmix|cdnimages|molystream|stream\d*|video\d*|hls\d*|master\.(txt|m3u8)|\/hls\/|\/stream\/|\/playlist|\/manifest|googlevideo|manifest\.googlevideo|\.m3u8(\?|$)|\.mpd(\?|$)|videoplayback\?)/i;
const IGNORED_DOWNLOAD_EXTS =
  /\.(js|mjs|cjs|jsx|ts|tsx|css|scss|less|html|htm|xhtml|php|asp|aspx|jsp|json|xml|map|svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot|otf)($|\?)/i;
const IGNORED_MIME = /(javascript|ecmascript|css|html|json|xml|image\/|font\/|text\/plain)/i;
const VIDEO_PORTAL_RE =
  /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i;

const DEFAULT_SETTINGS = {
  captureEnabled: true,
  interceptDownloads: true,
  showVideoOverlay: true,
  autoClearOnNavigate: false,
  excludedDomains: [],
};

let settingsCache = { ...DEFAULT_SETTINGS };
let socket = null;
let isConnecting = false;
let reconnectDelayMs = 2000;
let reconnectTimer = null;
let keepAliveTimer = null;
let lastDesktopSeenAt = 0;
let lastTokenAutoFetchAt = 0;

const sentUrlCache = new Map();
const interceptedDownloadUrls = new Map();
const tabMediaMap = new Map(); // tabId -> Array<{ url, type, time }>
const domainMediaMap = new Map(); // domain -> Array<{ url, type, time }>
const tabLastDomainMap = new Map(); // tabId -> domain
const globalMediaHistory = [];
let lastSniffedStream = null;

function cleanDomain(u) {
  try {
    return new URL(u).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function isDomainExcluded(urlOrDomain) {
  const dom = urlOrDomain?.includes('://')
    ? cleanDomain(urlOrDomain)
    : String(urlOrDomain || '')
        .replace(/^www\./i, '')
        .toLowerCase();
  if (!dom) return false;
  const list = Array.isArray(settingsCache.excludedDomains) ? settingsCache.excludedDomains : [];
  return list.some(d => dom === d || dom.endsWith('.' + d));
}

function isDesktopConnected() {
  if (socket && socket.readyState === WebSocket.OPEN) return true;
  return Date.now() - lastDesktopSeenAt < 20000;
}

function markDesktopAlive() {
  lastDesktopSeenAt = Date.now();
  try {
    chrome.storage?.session?.set({ lastDesktopSeenAt });
  } catch {}
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2000) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    return await fetch(url, { ...options, ...(ctrl ? { signal: ctrl.signal } : {}) });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeDesktop(tokenOverride) {
  const token =
    typeof tokenOverride === 'string'
      ? tokenOverride
      : (await chrome.storage.local.get('pairingToken')).pairingToken || '';
  const hasToken = /^[a-f0-9]{64}$/.test(token);

  // 1. Önce VoltGet açık mı kontrol et (token gerektirmeyen /health)
  let appRunning = false;
  try {
    const h = await fetchWithTimeout(`${DESKTOP_HOST}/health`, { method: 'GET' }, 1800);
    if (h.ok) {
      appRunning = true;
    } else if (h.status === 401 || h.status === 404) {
      // Eski masaüstü sürümü (/health yok ama sunucu ayakta!)
      appRunning = true;
    }
  } catch {
    return { appRunning: false, connected: false, needsPairing: !hasToken, hasToken };
  }

  if (!hasToken) {
    return { appRunning, connected: false, needsPairing: true, hasToken: false };
  }

  // 2. Token ile /status doğrula
  try {
    const r = await fetchWithTimeout(
      `${DESKTOP_HOST}/status`,
      { headers: { Authorization: 'Bearer ' + token } },
      1800
    );
    if (r.ok) {
      markDesktopAlive();
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        void initWebSocket(true);
      }
      return { appRunning: true, connected: true, needsPairing: false, hasToken: true };
    }
    if (r.status === 401) {
      return { appRunning: true, connected: false, needsPairing: true, hasToken: true };
    }
  } catch {
    return { appRunning: false, connected: false, needsPairing: false, hasToken };
  }

  return { appRunning, connected: isDesktopConnected(), needsPairing: false, hasToken };
}

function broadcastConnectionState(connected) {
  try {
    chrome.runtime.sendMessage({ type: 'connection_changed', connected }, () => {
      void chrome.runtime.lastError;
    });
  } catch {}
}

function notifyContentScriptsSettings() {
  try {
    chrome.tabs.query({}, tabs => {
      if (chrome.runtime.lastError || !Array.isArray(tabs)) return;
      for (const tab of tabs) {
        if (tab.id == null) continue;
        const allowed =
          settingsCache.captureEnabled !== false &&
          settingsCache.showVideoOverlay !== false &&
          !isDomainExcluded(tab.url || '');
        try {
          chrome.tabs.sendMessage(
            tab.id,
            { type: 'settings_updated', overlayEnabled: allowed },
            () => {
              void chrome.runtime.lastError;
            }
          );
        } catch {}
      }
    });
  } catch {}
}

function isChunkOrSegment(url) {
  if (!url || typeof url !== 'string') return true;
  if (url.includes('range=') || url.includes('.ts?') || url.includes('sq=') || url.includes('seq='))
    return true;
  if (url.includes('segment-') || url.includes('init=') || url.includes('frag=')) return true;
  if (url.includes('/s/search/audio/') || url.includes('generate_204')) return true;
  return false;
}

function shouldSend(url, pageUrl) {
  if (!url || isChunkOrSegment(url)) return false;
  const key = (pageUrl ? pageUrl.split('#')[0] : '') + '|' + url.split('?')[0];
  const lastTime = sentUrlCache.get(key) || 0;
  const now = Date.now();
  if (now - lastTime < 60000) return false;
  sentUrlCache.set(key, now);
  if (sentUrlCache.size > 500) {
    const firstKey = sentUrlCache.keys().next().value;
    if (firstKey) sentUrlCache.delete(firstKey);
  }
  return true;
}

function detectType(url) {
  if (!url) return 'file';
  if (
    url.includes('/q/') ||
    url.includes('master.txt') ||
    url.includes('.m3u8') ||
    url.includes('/hls/')
  )
    return 'm3u8';
  if (url.includes('.mpd')) return 'mpd';
  if (url.includes('videoplayback') || url.includes('googlevideo')) return 'mp4';
  const clean = url.split('?')[0].split('#')[0];
  const lastPart = clean.split('/').pop() || '';
  const m = lastPart.match(/\.([a-z0-9]{2,5})$/i);
  if (m) return m[1].toLowerCase();
  return 'file';
}

function normalizeToMasterPlaylist(url) {
  if (!url || typeof url !== 'string') return url;
  if (/molystream\.org\/embed\/([a-zA-Z0-9_-]+)($|\?)/i.test(url)) {
    return url.replace(
      /molystream\.org\/embed\/([a-zA-Z0-9_-]+)($|\?)/i,
      'https://dbx.molystream.org/embed/$1/q/1'
    );
  }
  if (/\/(?:txt\/)?[a-zA-Z0-9_.-]*sublist[a-zA-Z0-9_.-]*\.(txt|m3u8)/i.test(url)) {
    return url.replace(
      /\/(?:txt\/)?[a-zA-Z0-9_.-]*sublist[a-zA-Z0-9_.-]*\.(txt|m3u8).*/i,
      '/master.$1'
    );
  }
  if (/\/(?:tracks-[va]\d+|video_\d+|audio_\d+)\/[^/]+\.m3u8/i.test(url)) {
    return url.replace(/\/(?:tracks-[va]\d+|video_\d+|audio_\d+)\/[^/]+\.m3u8.*/i, '/master.m3u8');
  }
  return url;
}

async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
    settingsCache = {
      captureEnabled: stored.captureEnabled !== false,
      interceptDownloads: stored.interceptDownloads !== false,
      showVideoOverlay: stored.showVideoOverlay !== false,
      autoClearOnNavigate: !!stored.autoClearOnNavigate,
      excludedDomains: Array.isArray(stored.excludedDomains) ? stored.excludedDomains : [],
    };
    if (chrome.storage?.session) {
      const s = await chrome.storage.session.get('lastDesktopSeenAt');
      if (typeof s.lastDesktopSeenAt === 'number' && s.lastDesktopSeenAt > lastDesktopSeenAt) {
        lastDesktopSeenAt = s.lastDesktopSeenAt;
      }
    }
  } catch {}
  return settingsCache;
}

async function persistTabMedia(tabId, list) {
  try {
    if (chrome.storage?.session) {
      await chrome.storage.session.set({ [`tabMedia_${tabId}`]: list });
    }
  } catch {}
}

async function getTabMedia(tabId) {
  if (tabMediaMap.has(tabId)) return tabMediaMap.get(tabId);
  try {
    if (chrome.storage?.session) {
      const key = `tabMedia_${tabId}`;
      const res = await chrome.storage.session.get(key);
      if (Array.isArray(res[key])) {
        tabMediaMap.set(tabId, res[key]);
        return res[key];
      }
    }
  } catch {}
  return [];
}

function recordTabMedia(tabId, entry) {
  if (typeof tabId !== 'number' || tabId < 0) return;
  const list = tabMediaMap.get(tabId) || [];
  if (!list.some(x => x.url === entry.url)) {
    const next = [entry, ...list].slice(0, 25);
    tabMediaMap.set(tabId, next);
    void persistTabMedia(tabId, next);
    void updateBadgeForTab(tabId);
  }
}

async function updateBadgeForTab(tabId) {
  try {
    if (!chrome.action?.setBadgeText) return;
    if (!settingsCache.captureEnabled) {
      await chrome.action.setBadgeText({ text: 'OFF', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#64748b', tabId });
      return;
    }
    const list = typeof tabId === 'number' && tabId >= 0 ? await getTabMedia(tabId) : [];
    const connected = isDesktopConnected();
    if (list.length > 0) {
      await chrome.action.setBadgeText({ text: String(Math.min(99, list.length)), tabId });
      await chrome.action.setBadgeBackgroundColor({
        color: connected ? '#2563eb' : '#d97706',
        tabId,
      });
    } else if (!connected) {
      await chrome.action.setBadgeText({ text: '!', tabId });
      await chrome.action.setBadgeBackgroundColor({ color: '#dc2626', tabId });
    } else {
      await chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch {}
}

async function refreshActiveTabBadge() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) await updateBadgeForTab(tab.id);
  } catch {}
}

// Native Messaging üzerinden sıfır-adım otomatik eşleştirme (2 sn timeout korumalı)
async function tryNativeAutoPair(force = false) {
  if (!chrome.runtime?.sendNativeMessage) return null;
  if (!force && Date.now() - lastTokenAutoFetchAt < 10000) return null;
  lastTokenAutoFetchAt = Date.now();
  return new Promise(resolve => {
    let settled = false;
    const finish = val => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), 2000);
    try {
      chrome.runtime.sendNativeMessage(NM_HOST_NAME, { type: 'get-token' }, async res => {
        if (chrome.runtime.lastError || !res?.token || !/^[a-f0-9]{64}$/.test(res.token)) {
          finish(null);
          return;
        }
        try {
          await chrome.storage.local.set({ pairingToken: res.token });
        } catch {}
        finish(res.token);
      });
    } catch {
      finish(null);
    }
  });
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void initWebSocket(false);
  }, reconnectDelayMs);
  reconnectDelayMs = Math.min(10000, Math.round(reconnectDelayMs * 1.4));
}

async function initWebSocket(forceReset = false) {
  if (forceReset && socket) {
    try {
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    } catch {}
    socket = null;
    isConnecting = false;
  }
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  if (isConnecting) return;
  isConnecting = true;
  try {
    let { pairingToken = '' } = await chrome.storage.local.get('pairingToken');
    if (!/^[a-f0-9]{64}$/.test(pairingToken)) {
      const autoToken = await tryNativeAutoPair(false);
      if (autoToken) {
        pairingToken = autoToken;
      } else {
        isConnecting = false;
        void refreshActiveTabBadge();
        return;
      }
    }

    const ws = new WebSocket(DESKTOP_WS, ['voltget', 'token.' + pairingToken]);
    socket = ws;

    ws.onopen = () => {
      if (socket !== ws) return;
      isConnecting = false;
      reconnectDelayMs = 2000;
      markDesktopAlive();
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      keepAliveTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          markDesktopAlive();
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 15000);
      void refreshActiveTabBadge();
      broadcastConnectionState(true);
    };
    ws.onmessage = ev => {
      markDesktopAlive();
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === 'pong') return;
      } catch {}
    };
    ws.onclose = () => {
      if (socket === ws) {
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        socket = null;
        isConnecting = false;
        void refreshActiveTabBadge();
        broadcastConnectionState(false);
        scheduleReconnect();
      }
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
    };
  } catch {
    isConnecting = false;
    scheduleReconnect();
  }
}

// Top-level MV3 alarm dinleyicisi (Service Worker uyandığında güvenle yakalar)
if (chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm?.name === 'voltget-keepalive') {
      void loadSettings().then(() => {
        void initWebSocket(false);
        void refreshActiveTabBadge();
      });
    }
  });
}

function ensureKeepAliveAlarm() {
  try {
    chrome.alarms?.create('voltget-keepalive', { periodInMinutes: 1 });
  } catch {}
}

chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let settingsChanged = false;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (changes[key]) {
      settingsCache[key] = changes[key].newValue;
      settingsChanged = true;
    }
  }
  if (settingsChanged) {
    void refreshActiveTabBadge();
    notifyContentScriptsSettings();
  }
  if (changes.pairingToken) {
    reconnectDelayMs = 2000;
    void initWebSocket(true);
  }
});

// Sekme olayları ve autoClearOnNavigate
chrome.tabs.onActivated.addListener(({ tabId }) => {
  void updateBadgeForTab(tabId);
});

chrome.tabs.onRemoved.addListener(tabId => {
  tabMediaMap.delete(tabId);
  tabLastDomainMap.delete(tabId);
  try {
    chrome.storage?.session?.remove(`tabMedia_${tabId}`);
  } catch {}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    const newDom = cleanDomain(changeInfo.url);
    const prevDom = tabLastDomainMap.get(tabId);
    if (prevDom && newDom && prevDom !== newDom) {
      tabMediaMap.delete(tabId);
      try {
        chrome.storage?.session?.remove(`tabMedia_${tabId}`);
      } catch {}
      if (settingsCache.autoClearOnNavigate) {
        try {
          const { items = [] } = await chrome.storage.local.get('items');
          const kept = items.filter(
            i => cleanDomain(i.pageUrl) !== prevDom && cleanDomain(i.tabUrl || '') !== prevDom
          );
          await chrome.storage.local.set({ items: kept });
        } catch {}
      }
    }
    if (newDom) tabLastDomainMap.set(tabId, newDom);
    void updateBadgeForTab(tabId);
  } else if (changeInfo.status === 'complete' && tab?.id != null) {
    void updateBadgeForTab(tab.id);
  }
});

async function sendToVoltGet(data, opts = {}) {
  if (!data?.url) return { ok: false, reason: 'missing_url' };
  data.url = normalizeToMasterPlaylist(data.url);
  const userInitiated = !!opts.userInitiated || !!data.userInitiated;

  if (!userInitiated) {
    if (!settingsCache.captureEnabled) return { ok: false, reason: 'paused' };
    if (isDomainExcluded(data.pageUrl || data.url)) return { ok: false, reason: 'excluded' };
    if (!opts.force && !shouldSend(data.url, data.pageUrl)) return { ok: false, reason: 'deduped' };
  }

  let cookieHeader = '';
  try {
    const isYouTube =
      (data.url && /youtube\.com|youtu\.be|googlevideo\.com/i.test(data.url)) ||
      (data.pageUrl && /youtube\.com|youtu\.be/i.test(data.pageUrl));
    if (!isYouTube) {
      const cookies = await chrome.cookies.getAll({ domain: new URL(data.url).hostname });
      if (cookies?.length) {
        cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      } else if (data.pageUrl) {
        const pageCookies = await chrome.cookies.getAll({ url: data.pageUrl });
        if (pageCookies?.length) {
          cookieHeader = pageCookies.map(c => `${c.name}=${c.value}`).join('; ');
        }
      }
    }
  } catch {}

  const payload = {
    ...data,
    cookie: cookieHeader,
    userInitiated,
    showDialog: !!data.showDialog,
  };

  let { pairingToken = '' } = await chrome.storage.local.get('pairingToken');
  if (!/^[a-f0-9]{64}$/.test(pairingToken)) {
    const autoToken = await tryNativeAutoPair(userInitiated);
    if (autoToken) pairingToken = autoToken;
  }

  let sent = false;
  let failReason = 'offline';

  // 1. Tercih: WebSocket (en hızlı)
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: 'sniffed-url', data: payload }));
      sent = true;
      markDesktopAlive();
    } catch {}
  }

  // 2. Tercih: HTTP POST
  if (!sent && /^[a-f0-9]{64}$/.test(pairingToken)) {
    try {
      const response = await fetchWithTimeout(
        `${DESKTOP_HOST}/sniff`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + pairingToken,
          },
          body: JSON.stringify(payload),
        },
        3000
      );
      if (response.ok) {
        sent = true;
        markDesktopAlive();
        void initWebSocket(false);
      } else if (response.status === 401) {
        failReason = 'unauthorized';
        const refreshed = await tryNativeAutoPair(true);
        if (refreshed) {
          const retry = await fetchWithTimeout(
            `${DESKTOP_HOST}/sniff`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + refreshed },
              body: JSON.stringify(payload),
            },
            3000
          );
          if (retry.ok) {
            sent = true;
            markDesktopAlive();
            void initWebSocket(true);
          }
        }
      }
    } catch {
      failReason = 'offline';
    }
  } else if (!sent && !/^[a-f0-9]{64}$/.test(pairingToken)) {
    // Anahtar yok: uygulama açık mı diye bak ki doğru hata mesajı dönsün
    const probe = await probeDesktop('');
    failReason = probe.appRunning ? 'unauthorized' : 'offline';
  }

  // 3. Yedek: Native Messaging
  if (!sent && chrome.runtime?.sendNativeMessage) {
    try {
      const res = await new Promise(resolve => {
        const t = setTimeout(() => resolve(null), 2000);
        chrome.runtime.sendNativeMessage(
          NM_HOST_NAME,
          { type: 'download-request', data: payload, token: pairingToken },
          response => {
            clearTimeout(t);
            if (chrome.runtime.lastError) resolve(null);
            else resolve(response);
          }
        );
      });
      if (res?.success) {
        sent = true;
        markDesktopAlive();
      }
    } catch {}
  }

  try {
    const { items = [] } = await chrome.storage.local.get('items');
    const existingIdx = items.findIndex(x => x.url === data.url);
    if (existingIdx !== -1) items.splice(existingIdx, 1);
    items.unshift({
      ...payload,
      time: new Date().toLocaleTimeString(),
      tabUrl: data.pageUrl,
    });
    await chrome.storage.local.set({ items: items.slice(0, 80) });
  } catch {}

  return { ok: sent, reason: sent ? 'sent' : failReason };
}

async function openOrFocusDesktopApp() {
  const { pairingToken = '' } = await chrome.storage.local.get('pairingToken');
  if (/^[a-f0-9]{64}$/.test(pairingToken)) {
    try {
      const r = await fetchWithTimeout(
        `${DESKTOP_HOST}/focus`,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + pairingToken },
        },
        2000
      );
      if (r.ok) {
        markDesktopAlive();
        return { ok: true, method: 'http' };
      }
      // Eski masaüstü sürümünde /focus yoksa /status ile açık olduğunu doğrula
      const s = await fetchWithTimeout(
        `${DESKTOP_HOST}/status`,
        { headers: { Authorization: 'Bearer ' + pairingToken } },
        1500
      );
      if (s.ok) {
        markDesktopAlive();
        return { ok: true, method: 'status' };
      }
    } catch {}
  }
  if (chrome.runtime?.sendNativeMessage) {
    const nmRes = await new Promise(resolve => {
      const t = setTimeout(() => resolve(null), 2000);
      try {
        chrome.runtime.sendNativeMessage(NM_HOST_NAME, { type: 'focus-app' }, res => {
          clearTimeout(t);
          if (chrome.runtime.lastError) resolve(null);
          else resolve(res);
        });
      } catch {
        clearTimeout(t);
        resolve(null);
      }
    });
    if (nmRes?.success) return { ok: true, method: 'native' };
  }
  return { ok: false, protocolUrl: 'voltget://focus' };
}

chrome.webRequest.onBeforeRequest.addListener(
  details => {
    if (!settingsCache.captureEnabled) return;
    const url = details.url;
    if (!url || url.length < 20) return;
    if (isChunkOrSegment(url)) return;
    if (EXCLUDE.test(url)) return;

    const isMedia = MEDIA_PAT.test(url) || SITE_CDN.test(url);
    const isFile = DOC_PAT.test(url) || ARCHIVE_PAT.test(url) || INSTALLER_PAT.test(url);
    if (!isMedia && !isFile) return;
    if (['stylesheet', 'image', 'font', 'ping', 'script'].includes(details.type)) return;

    const normalizedUrl = normalizeToMasterPlaylist(url);
    const detectedType = detectType(normalizedUrl);
    const mediaEntry = { url: normalizedUrl, type: detectedType, time: Date.now() };

    if (isMedia) {
      lastSniffedStream = mediaEntry;
      if (!globalMediaHistory.some(x => x.url === normalizedUrl)) {
        globalMediaHistory.unshift(mediaEntry);
        if (globalMediaHistory.length > 40) globalMediaHistory.pop();
      }
    }

    if (details.tabId >= 0) {
      recordTabMedia(details.tabId, mediaEntry);
    }

    if (details.initiator && isMedia) {
      const initDom = cleanDomain(details.initiator);
      if (initDom) {
        const idlist = domainMediaMap.get(initDom) || [];
        if (!idlist.some(x => x.url === normalizedUrl)) {
          domainMediaMap.set(initDom, [mediaEntry, ...idlist].slice(0, 20));
        }
      }
    }

    if (details.tabId >= 0) {
      chrome.tabs.get(details.tabId, tab => {
        if (chrome.runtime.lastError) return;
        const pageUrl = tab?.url || '';
        if (isDomainExcluded(pageUrl)) return;
        const dom = cleanDomain(pageUrl);
        if (dom && isMedia) {
          const dlist = domainMediaMap.get(dom) || [];
          if (!dlist.some(x => x.url === normalizedUrl)) {
            domainMediaMap.set(dom, [mediaEntry, ...dlist].slice(0, 20));
          }
        }
        const targetUrl = VIDEO_PORTAL_RE.test(pageUrl) ? pageUrl : normalizedUrl;
        void sendToVoltGet(
          { url: targetUrl, type: detectedType, pageUrl, title: tab?.title || '' },
          { userInitiated: false }
        );
      });
    }
  },
  { urls: ['<all_urls>'] }
);

function pickBestStreamFromList(list) {
  if (!list || !list.length) return null;
  const master = list.find(x => /master\.(txt|m3u8)|manifest\.mpd|\/q\/\d+/i.test(x.url));
  if (master) return master;
  const mainPlaylist = list.find(
    x => /(playlist|index)\.m3u8/i.test(x.url) && !/(?:video|audio|_vid|_aud|tracks-v)/i.test(x.url)
  );
  if (mainPlaylist) return mainPlaylist;
  const mp4 = list.find(
    x => /\.mp4($|\?)/i.test(x.url) && !/frag|segment|part|f[0-9]+/i.test(x.url)
  );
  if (mp4) return mp4;
  const anyM3u8 = list.find(
    x =>
      (x.type === 'm3u8' || x.url.includes('.m3u8') || x.url.includes('/q/')) &&
      !/(?:_aud|audio)/i.test(x.url)
  );
  if (anyM3u8) return anyM3u8;
  return list[0];
}

// Mesajlaşma (Content script + Popup) — tüm async handler'lar güvenli try/catch ile sarılı
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'get_content_settings') {
    (async () => {
      try {
        await loadSettings();
        const pageUrl = msg.pageUrl || sender?.tab?.url || '';
        const overlayEnabled =
          settingsCache.captureEnabled !== false &&
          settingsCache.showVideoOverlay !== false &&
          !isDomainExcluded(pageUrl);
        sendResponse({ overlayEnabled });
      } catch {
        sendResponse({ overlayEnabled: true });
      }
    })();
    return true;
  }

  if (msg?.type === 'get_state') {
    (async () => {
      try {
        await loadSettings();
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const curDomain = cleanDomain(tab?.url || '');
        const probe = await probeDesktop();
        sendResponse({
          appRunning: probe.appRunning,
          connected: probe.connected,
          needsPairing: probe.needsPairing,
          hasToken: probe.hasToken,
          settings: settingsCache,
          currentDomain: curDomain,
          domainExcluded: isDomainExcluded(curDomain),
        });
      } catch {
        sendResponse({
          appRunning: false,
          connected: false,
          needsPairing: true,
          hasToken: false,
          settings: settingsCache,
          currentDomain: '',
          domainExcluded: false,
        });
      }
    })();
    return true;
  }

  if (msg?.type === 'reconnect_ws') {
    (async () => {
      try {
        if (typeof msg.token === 'string' && /^[a-f0-9]{64}$/.test(msg.token)) {
          await chrome.storage.local.set({ pairingToken: msg.token });
        }
        reconnectDelayMs = 2000;
        const probe = await probeDesktop(msg.token);
        if (probe.connected) {
          await initWebSocket(true);
        }
        sendResponse(probe);
      } catch {
        sendResponse({ appRunning: false, connected: false, needsPairing: true });
      }
    })();
    return true;
  }

  if (msg?.type === 'auto_pair') {
    (async () => {
      try {
        const token = await tryNativeAutoPair(true);
        if (token) {
          reconnectDelayMs = 2000;
          await initWebSocket(true);
          const probe = await probeDesktop(token);
          sendResponse({ ok: probe.connected, ...probe });
        } else {
          sendResponse({ ok: false });
        }
      } catch {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }

  if (msg?.type === 'open_desktop_app') {
    openOrFocusDesktopApp()
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, protocolUrl: 'voltget://focus' }));
    return true;
  }

  if (msg?.type === 'update_settings') {
    (async () => {
      try {
        const patch = msg.patch || {};
        const next = { ...settingsCache, ...patch };
        settingsCache = next;
        await chrome.storage.local.set(patch);
        await refreshActiveTabBadge();
        notifyContentScriptsSettings();
        sendResponse({ ok: true, settings: next });
      } catch {
        sendResponse({ ok: false, settings: settingsCache });
      }
    })();
    return true;
  }

  if (msg?.type === 'toggle_domain_exclude') {
    (async () => {
      try {
        const dom = cleanDomain(msg.domain?.includes('://') ? msg.domain : `https://${msg.domain}`);
        if (!dom) {
          sendResponse({ ok: false });
          return;
        }
        const list = new Set(settingsCache.excludedDomains || []);
        let excluded = false;
        if (list.has(dom)) {
          list.delete(dom);
          excluded = false;
        } else {
          list.add(dom);
          excluded = true;
        }
        const nextList = [...list];
        settingsCache.excludedDomains = nextList;
        await chrome.storage.local.set({ excludedDomains: nextList });
        notifyContentScriptsSettings();
        sendResponse({ ok: true, excluded, excludedDomains: nextList });
      } catch {
        sendResponse({ ok: false });
      }
    })();
    return true;
  }

  if (msg?.type === 'batch_download') {
    (async () => {
      try {
        const entries = Array.isArray(msg.items) ? msg.items : [];
        let sentCount = 0;
        let lastReason = 'offline';
        for (const it of entries) {
          const itemToSend = {
            ...it,
            userInitiated: true,
            showDialog: false,
          };
          if (it.pageUrl && VIDEO_PORTAL_RE.test(it.pageUrl)) {
            itemToSend.url = it.pageUrl;
          }
          const res = await sendToVoltGet(itemToSend, { force: true, userInitiated: true });
          if (res.ok) sentCount++;
          else if (res.reason) lastReason = res.reason;
        }
        sendResponse({ ok: sentCount > 0, sentCount, total: entries.length, reason: lastReason });
      } catch {
        sendResponse({ ok: false, sentCount: 0, total: 0, reason: 'offline' });
      }
    })();
    return true;
  }

  if (msg?.type === 'get_best_stream') {
    (async () => {
      try {
        const tabId = sender?.tab?.id;
        const pageUrl = msg.pageUrl || sender?.tab?.url || '';
        const dom = cleanDomain(pageUrl);
        let candidate = null;
        if (tabId != null) {
          const list = await getTabMedia(tabId);
          candidate = pickBestStreamFromList(list);
        }
        if (!candidate && dom && domainMediaMap.has(dom)) {
          candidate = pickBestStreamFromList(domainMediaMap.get(dom));
        }
        if (!candidate && globalMediaHistory.length) {
          candidate = pickBestStreamFromList(globalMediaHistory);
        }
        if (!candidate && lastSniffedStream && Date.now() - lastSniffedStream.time < 300000) {
          candidate = lastSniffedStream;
        }
        if (candidate?.url) {
          candidate = { ...candidate, url: normalizeToMasterPlaylist(candidate.url) };
        }
        sendResponse(candidate || null);
      } catch {
        sendResponse(null);
      }
    })();
    return true;
  }

  if (msg?.type === 'sniffed') {
    const cleanUrl = normalizeToMasterPlaylist(msg.data?.url);
    const cleanData = { ...msg.data, url: cleanUrl };
    if (sender?.tab?.id != null) {
      recordTabMedia(sender.tab.id, { url: cleanUrl, type: cleanData.type, time: Date.now() });
    }
    void sendToVoltGet(cleanData, { userInitiated: false });
    return false;
  }

  if (msg?.type === 'user_request_download') {
    (async () => {
      try {
        const downloadData = { ...msg.data };
        const isVideoPortal =
          VIDEO_PORTAL_RE.test(downloadData.pageUrl || '') ||
          VIDEO_PORTAL_RE.test(downloadData.url || '') ||
          (downloadData.url && downloadData.url.includes('googlevideo.com'));
        if (isVideoPortal) {
          if (downloadData.pageUrl && VIDEO_PORTAL_RE.test(downloadData.pageUrl)) {
            downloadData.url = downloadData.pageUrl;
          } else if (sender?.tab?.url && VIDEO_PORTAL_RE.test(sender.tab.url)) {
            downloadData.url = sender.tab.url;
            downloadData.pageUrl = sender.tab.url;
          }
        }

        const isDirectMedia =
          /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a)($|\?)/i.test(downloadData.url || '') ||
          (downloadData.url || '').includes('master.txt') ||
          (downloadData.url || '').includes('/q/');
        if (!isVideoPortal && !isDirectMedia) {
          const tabId = sender?.tab?.id;
          const dom = cleanDomain(downloadData.pageUrl || '');
          let candidate = null;
          if (tabId != null) {
            candidate = pickBestStreamFromList(await getTabMedia(tabId));
          }
          if (!candidate && dom && domainMediaMap.has(dom)) {
            candidate = pickBestStreamFromList(domainMediaMap.get(dom));
          }
          if (!candidate && globalMediaHistory.length) {
            candidate = pickBestStreamFromList(globalMediaHistory);
          }
          if (!candidate && lastSniffedStream && Date.now() - lastSniffedStream.time < 300000) {
            candidate = lastSniffedStream;
          }
          if (candidate) {
            downloadData.url = normalizeToMasterPlaylist(candidate.url);
            downloadData.type = candidate.type || 'm3u8';
          }
        }
        const res = await sendToVoltGet(downloadData, { force: true, userInitiated: true });
        sendResponse(res);
      } catch {
        sendResponse({ ok: false, reason: 'offline' });
      }
    })();
    return true;
  }

  return false;
});

function registerContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'voltget-link',
      title: 'VoltGet ile indir',
      contexts: ['link', 'video', 'audio', 'image'],
    });
    chrome.contextMenus.create({
      id: 'voltget-page',
      title: 'Bu sayfadaki medyayı VoltGet ile indir',
      contexts: ['page'],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  registerContextMenus();
  ensureKeepAliveAlarm();
  void loadSettings().then(() => void initWebSocket(false));
});

if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    ensureKeepAliveAlarm();
    void loadSettings().then(() => void initWebSocket(false));
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const url = info.srcUrl || info.linkUrl || info.pageUrl || tab?.url;
  if (!url) return;
  void sendToVoltGet(
    {
      url,
      type: detectType(url),
      pageUrl: tab?.url || info.pageUrl || '',
      title: tab?.title || '',
      showDialog: true,
    },
    { force: true, userInitiated: true }
  );
});

// Güvenli Tarayıcı İndirme Devralma (Yalnızca VoltGet bağlı ve yakalama açıkken!)
function shouldInterceptDownload(url, referrer) {
  if (!settingsCache.captureEnabled || !settingsCache.interceptDownloads) return false;
  if (!isDesktopConnected()) return false;
  if (isDomainExcluded(referrer || url)) return false;
  if (
    !url ||
    url.startsWith('blob:') ||
    url.startsWith('data:') ||
    url.startsWith('chrome') ||
    url.startsWith('edge') ||
    url.startsWith('moz-extension')
  ) {
    return false;
  }
  if (EXCLUDE.test(url) || IGNORED_DOWNLOAD_EXTS.test(url)) return false;
  return true;
}

function notifyVoltGetGenericDownload(item, rawName) {
  const url = item.finalUrl || item.url;
  const lastTime = interceptedDownloadUrls.get(url) || 0;
  if (Date.now() - lastTime < 3500) return;
  interceptedDownloadUrls.set(url, Date.now());

  const type = detectType(rawName) || detectType(url) || 'file';
  void sendToVoltGet(
    {
      url,
      filename: rawName,
      title: rawName,
      fileSize: item.fileSize || 0,
      type,
      pageUrl: item.referrer || '',
      isGenericDownload: true,
      showDialog: true,
    },
    { force: true, userInitiated: true }
  );
}

chrome.downloads.onCreated.addListener(item => {
  try {
    const url = item.finalUrl || item.url;
    if (!shouldInterceptDownload(url, item.referrer)) return;

    const cleanUrl = url.split('?')[0];
    if (ANY_FILE.test(cleanUrl) && !IGNORED_DOWNLOAD_EXTS.test(cleanUrl)) {
      chrome.downloads.cancel(item.id, () => {
        if (chrome.runtime.lastError) return;
        chrome.downloads.erase({ id: item.id }, () => {});
      });
      const rawName = decodeURIComponent(cleanUrl.split('/').pop() || 'indirilen_dosya');
      notifyVoltGetGenericDownload(item, rawName);
    }
  } catch {}
});

if (chrome.downloads.onDeterminingFilename) {
  chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    const done = arg => {
      if (typeof suggest === 'function') {
        try {
          if (arg) suggest(arg);
          else suggest();
        } catch {}
      }
    };
    try {
      const url = item.finalUrl || item.url;
      if (!shouldInterceptDownload(url, item.referrer)) {
        done();
        return;
      }

      const rawName = item.filename
        ? item.filename.split(/[\\/]/).pop()
        : decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'indirilen_dosya');
      const mime = (item.mime || '').toLowerCase();

      if (IGNORED_DOWNLOAD_EXTS.test(rawName) || IGNORED_MIME.test(mime)) {
        done({ filename: item.filename });
        return;
      }

      const isDocOrArchive = ANY_FILE.test(url) || ANY_FILE.test(rawName);
      const isBinary =
        mime &&
        (mime.includes('octet-stream') ||
          mime.includes('application/zip') ||
          mime.includes('application/x-') ||
          mime.includes('application/pdf')) &&
        !IGNORED_MIME.test(mime);

      if (isDocOrArchive || isBinary) {
        chrome.downloads.cancel(item.id, () => {
          if (chrome.runtime.lastError) return;
          chrome.downloads.erase({ id: item.id }, () => {});
        });
        done({ filename: rawName });
        notifyVoltGetGenericDownload(item, rawName);
        return;
      }

      done({ filename: item.filename });
    } catch {
      done();
    }
  });
}

// İlk başlatma — senkron WebSocket tetiklemesi + ayar yüklemesi
ensureKeepAliveAlarm();
void loadSettings().then(() => {
  void initWebSocket(false);
  void refreshActiveTabBadge();
});
