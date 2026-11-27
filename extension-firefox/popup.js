function escapeHTML(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function cleanDomain(u) {
  try {
    return new URL(u).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function shortUrl(u) {
  try {
    const p = new URL(u);
    const pathPart = p.pathname.length > 32 ? p.pathname.slice(0, 32) + '…' : p.pathname;
    return p.hostname.replace(/^www\./i, '') + pathPart;
  } catch {
    return String(u || '').slice(0, 44);
  }
}

let filter = 'current';
let searchQuery = '';
let currentTabUrl = '';
let currentDomain = '';
let appState = {
  appRunning: false,
  connected: false,
  needsPairing: false,
  hasToken: false,
  domainExcluded: false,
  settings: {
    captureEnabled: true,
    interceptDownloads: true,
    showVideoOverlay: true,
    autoClearOnNavigate: false,
    excludedDomains: [],
  },
};

function sendMsg(msg) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(msg, res => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(res);
      });
    } catch {
      resolve(null);
    }
  });
}

async function directProbeDesktop() {
  const { pairingToken = '' } = await chrome.storage.local.get('pairingToken');
  const hasToken = /^[a-f0-9]{64}$/.test(pairingToken);
  let appRunning = false;
  try {
    const h = await fetch('http://127.0.0.1:8765/health');
    if (h.ok || h.status === 401 || h.status === 404) appRunning = true;
  } catch {
    return { appRunning: false, connected: false, needsPairing: !hasToken, hasToken };
  }
  if (!hasToken) {
    return { appRunning, connected: false, needsPairing: true, hasToken: false };
  }
  try {
    const r = await fetch('http://127.0.0.1:8765/status', {
      headers: { Authorization: 'Bearer ' + pairingToken },
    });
    if (r.ok) return { appRunning: true, connected: true, needsPairing: false, hasToken: true };
    if (r.status === 401)
      return { appRunning: true, connected: false, needsPairing: true, hasToken: true };
  } catch {}
  return { appRunning, connected: false, needsPairing: !hasToken, hasToken };
}

function updateHeaderUI() {
  const pill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  if (appState.connected) {
    pill.className = 'status-pill online';
    statusText.textContent = 'Bağlı';
  } else if (appState.appRunning && appState.needsPairing) {
    pill.className = 'status-pill warning';
    statusText.textContent = 'Anahtar Gerekli';
  } else {
    pill.className = 'status-pill offline';
    statusText.textContent = 'VoltGet Kapalı';
  }

  const capBtn = document.getElementById('toggleCapture');
  const enabled = appState.settings.captureEnabled !== false;
  capBtn.textContent = enabled ? 'Yakalama: Açık' : 'Duraklatıldı';
  capBtn.className = 'pill-btn ' + (enabled ? '' : 'paused');

  const domLabel = document.getElementById('domainLabel');
  domLabel.innerHTML = `Site: <strong>${escapeHTML(currentDomain || '—')}</strong>`;

  const exBtn = document.getElementById('excludeSiteBtn');
  exBtn.disabled = !currentDomain;
  exBtn.textContent = appState.domainExcluded ? 'Hariç Tutuldu (Aç)' : 'Siteyi Hariç Tut';
  exBtn.className = 'pill-btn ' + (appState.domainExcluded ? 'excluded' : '');

  const pairBanner = document.getElementById('pairBanner');
  const pairTitle = pairBanner.querySelector('.pair-title');
  if (!appState.connected) {
    pairBanner.classList.add('visible');
    if (pairTitle) {
      pairTitle.textContent = appState.appRunning
        ? 'VoltGet Açık — Bağlantı Anahtarını Girin veya Eşleştirin'
        : 'VoltGet Kapalı — Masaüstü Uygulamasını Başlatın';
    }
  } else {
    pairBanner.classList.remove('visible');
  }

  document.getElementById('optIntercept').checked = appState.settings.interceptDownloads !== false;
  document.getElementById('optOverlay').checked = appState.settings.showVideoOverlay !== false;
  document.getElementById('optAutoClear').checked = !!appState.settings.autoClearOnNavigate;
}

async function refreshState() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabUrl = tab?.url || '';
  currentDomain = cleanDomain(currentTabUrl);

  const [st, direct] = await Promise.all([sendMsg({ type: 'get_state' }), directProbeDesktop()]);

  const connected = !!(st?.connected || direct.connected);
  const appRunning = !!(st?.appRunning || direct.appRunning || connected);
  const hasToken = !!(st?.hasToken || direct.hasToken);
  const needsPairing = !connected && (st?.needsPairing || direct.needsPairing || !hasToken);

  appState = {
    appRunning,
    connected,
    needsPairing,
    hasToken,
    domainExcluded: !!st?.domainExcluded,
    settings: { ...appState.settings, ...(st?.settings || {}) },
  };

  if (direct.connected && !st?.connected) {
    void sendMsg({ type: 'reconnect_ws' });
  }

  updateHeaderUI();
}

let lastFilteredItems = [];

async function renderList() {
  const { items = [] } = await chrome.storage.local.get('items');
  const pageItems = currentDomain
    ? items.filter(
        i => cleanDomain(i.pageUrl) === currentDomain || cleanDomain(i.tabUrl) === currentDomain
      )
    : [];

  document.getElementById('cntPage').textContent = String(pageItems.length);
  document.getElementById('cntAll').textContent = String(items.length);

  let filtered = filter === 'current' ? pageItems : items;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      i =>
        String(i.title || '')
          .toLowerCase()
          .includes(q) ||
        String(i.url || '')
          .toLowerCase()
          .includes(q) ||
        String(i.type || '')
          .toLowerCase()
          .includes(q)
    );
  }
  lastFilteredItems = filtered;

  const batchBtn = document.getElementById('batchBtn');
  if (filtered.length >= 2) {
    batchBtn.style.display = 'inline-flex';
    batchBtn.textContent = `Tümünü İndir (${filtered.length})`;
  } else {
    batchBtn.style.display = 'none';
  }

  const listEl = document.getElementById('list');
  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="empty">
        <strong>${filter === 'current' ? 'Bu sayfada yakalanan medya yok' : 'Henüz medya yakalanmadı'}</strong>
        <span>${
          appState.domainExcluded
            ? 'Bu site hariç tutulanlar listesinde.'
            : 'Bir video oynatın veya dosya indirmeye başlayın; otomatik listelenir.'
        }</span>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .slice(0, 15)
    .map(i => {
      const realIdx = items.indexOf(i);
      const isMedia = /^(m3u8|mpd|mp4|webm|mkv|mov|flv)$/i.test(i.type || '');
      const title = i.title || i.filename || shortUrl(i.url);
      return `
        <div class="card">
          <div class="card-top">
            <span class="type-badge">${escapeHTML(i.type || 'file')}</span>
            <span class="meta">${escapeHTML(i.time || '')} • ${escapeHTML(cleanDomain(i.pageUrl || i.url))}</span>
          </div>
          <div class="card-title" title="${escapeHTML(title)}">${escapeHTML(title)}</div>
          <div class="card-url" title="${escapeHTML(i.url)}">${escapeHTML(shortUrl(i.url))}</div>
          <div class="card-actions">
            <button class="btn" style="flex:1" data-idx="${realIdx}" data-act="send">VoltGet ile İndir</button>
            ${
              isMedia
                ? `<button class="btn-secondary" data-idx="${realIdx}" data-act="audio">MP3</button>`
                : ''
            }
            <button class="btn-secondary" data-idx="${realIdx}" data-act="copy">Kopyala</button>
          </div>
        </div>`;
    })
    .join('');

  listEl.querySelectorAll('button[data-act]').forEach(btn => {
    btn.onclick = async () => {
      const it = items[parseInt(btn.dataset.idx, 10)];
      if (!it) return;
      const act = btn.dataset.act;
      if (act === 'copy') {
        const toCopy = it.pageUrl?.includes('youtube.com/watch') ? it.pageUrl : it.url;
        await navigator.clipboard.writeText(toCopy);
        btn.textContent = 'Kopyalandı ✓';
        setTimeout(() => (btn.textContent = 'Kopyala'), 1200);
        return;
      }

      const prevText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Gönderiliyor...';
      const res = await sendMsg({
        type: 'user_request_download',
        data: {
          ...it,
          asAudio: act === 'audio',
          showDialog: true,
          userInitiated: true,
        },
      });
      btn.disabled = false;
      if (res?.ok) {
        btn.textContent = 'Gönderildi ✓';
      } else if (res?.reason === 'unauthorized') {
        btn.textContent = 'Anahtar Gerekli';
        document.getElementById('pairBanner').classList.add('visible');
      } else {
        btn.textContent = 'VoltGet Kapalı';
      }
      setTimeout(() => (btn.textContent = prevText), 1500);
    };
  });
}

// Canlı bağlantı değişimlerini arka plandan dinle
try {
  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === 'connection_changed') {
      void refreshState();
    }
  });
} catch {}

// Event bindings
document.getElementById('tabCurrent').onclick = () => {
  filter = 'current';
  document.getElementById('tabCurrent').classList.add('active');
  document.getElementById('tabAll').classList.remove('active');
  void renderList();
};

document.getElementById('tabAll').onclick = () => {
  filter = 'all';
  document.getElementById('tabAll').classList.add('active');
  document.getElementById('tabCurrent').classList.remove('active');
  void renderList();
};

document.getElementById('searchInput').oninput = e => {
  searchQuery = e.target.value.trim();
  void renderList();
};

document.getElementById('toggleCapture').onclick = async () => {
  const next = !appState.settings.captureEnabled;
  const res = await sendMsg({ type: 'update_settings', patch: { captureEnabled: next } });
  if (res?.settings) appState.settings = res.settings;
  updateHeaderUI();
};

document.getElementById('excludeSiteBtn').onclick = async () => {
  if (!currentDomain) return;
  const res = await sendMsg({ type: 'toggle_domain_exclude', domain: currentDomain });
  if (res?.ok) {
    appState.domainExcluded = !!res.excluded;
    appState.settings.excludedDomains = res.excludedDomains || [];
    updateHeaderUI();
    void renderList();
  }
};

document.getElementById('batchBtn').onclick = async () => {
  const btn = document.getElementById('batchBtn');
  if (!lastFilteredItems.length) return;
  btn.disabled = true;
  btn.textContent = 'Gönderiliyor...';
  const res = await sendMsg({ type: 'batch_download', items: lastFilteredItems });
  btn.disabled = false;
  if (res?.ok) {
    btn.textContent = `${res.sentCount} öğe gönderildi ✓`;
  } else if (res?.reason === 'unauthorized') {
    btn.textContent = 'Anahtar gerekli';
    document.getElementById('pairBanner').classList.add('visible');
  } else {
    btn.textContent = 'VoltGet kapalı';
  }
  setTimeout(() => void renderList(), 1500);
};

document.getElementById('settingsBtn').onclick = () => {
  const drawer = document.getElementById('settingsDrawer');
  const btn = document.getElementById('settingsBtn');
  const isOpen = drawer.classList.toggle('open');
  btn.classList.toggle('active', isOpen);
};

document.getElementById('showPairBtn').onclick = () => {
  document.getElementById('pairBanner').classList.toggle('visible');
};

document.getElementById('optIntercept').onchange = async e => {
  await sendMsg({ type: 'update_settings', patch: { interceptDownloads: e.target.checked } });
  appState.settings.interceptDownloads = e.target.checked;
};

document.getElementById('optOverlay').onchange = async e => {
  await sendMsg({ type: 'update_settings', patch: { showVideoOverlay: e.target.checked } });
  appState.settings.showVideoOverlay = e.target.checked;
};

document.getElementById('optAutoClear').onchange = async e => {
  await sendMsg({ type: 'update_settings', patch: { autoClearOnNavigate: e.target.checked } });
  appState.settings.autoClearOnNavigate = e.target.checked;
};

document.getElementById('autoPairBtn').onclick = async () => {
  const statusEl = document.getElementById('pairStatus');
  statusEl.textContent = 'VoltGet ile otomatik eşleştiriliyor...';
  statusEl.style.color = '#94a3b8';
  const res = await sendMsg({ type: 'auto_pair' });
  if (res?.ok) {
    statusEl.textContent = 'Otomatik eşleştirildi ✓';
    statusEl.style.color = '#4ade80';
    await refreshState();
  } else {
    statusEl.textContent =
      'Otomatik eşleştirme için VoltGet → Eklenti Kur içinden "Otomatik Eşleştirme Kur" yapın veya 64 haneli anahtarı yapıştırın.';
    statusEl.style.color = '#fca5a5';
  }
};

document.getElementById('pairBtn').onclick = async () => {
  const input = document.getElementById('pairingToken');
  const statusEl = document.getElementById('pairStatus');
  const token = input.value.trim();
  if (!/^[a-f0-9]{64}$/.test(token)) {
    statusEl.textContent = '64 karakterlik geçerli VoltGet anahtarını girin.';
    statusEl.style.color = '#fca5a5';
    return;
  }
  statusEl.textContent = 'Bağlanıyor...';
  statusEl.style.color = '#94a3b8';
  try {
    const r = await fetch('http://127.0.0.1:8765/status', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (r.status === 401) {
      statusEl.textContent = 'Anahtar uyuşmuyor — VoltGet içinden yeniden kopyalayın.';
      statusEl.style.color = '#fca5a5';
      return;
    }
    if (!r.ok) throw new Error();
    await chrome.storage.local.set({ pairingToken: token });
    await sendMsg({ type: 'reconnect_ws', token });
    input.value = '';
    statusEl.textContent = 'Bağlandı ✓';
    statusEl.style.color = '#4ade80';
    await refreshState();
  } catch {
    statusEl.textContent =
      'VoltGet uygulamasına ulaşılamadı — uygulamanın açık olduğundan emin olun.';
    statusEl.style.color = '#fca5a5';
  }
};

document.getElementById('clearPage').onclick = async () => {
  const { items = [] } = await chrome.storage.local.get('items');
  const kept = items.filter(
    i => cleanDomain(i.pageUrl) !== currentDomain && cleanDomain(i.tabUrl) !== currentDomain
  );
  await chrome.storage.local.set({ items: kept });
  void renderList();
};

document.getElementById('clearAll').onclick = async () => {
  await chrome.storage.local.set({ items: [] });
  void renderList();
};

document.getElementById('openApp').onclick = async () => {
  const btn = document.getElementById('openApp');
  const res = await sendMsg({ type: 'open_desktop_app' });
  if (res?.ok) {
    btn.textContent = 'Açıldı ✓';
    setTimeout(() => (btn.textContent = 'Uygulamayı Aç'), 1200);
  } else if (res?.protocolUrl) {
    chrome.tabs.create({ url: res.protocolUrl });
  }
};

void refreshState().then(() => renderList());
