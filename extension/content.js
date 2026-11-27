// VoltGet - Pro Shadow DOM Video Üstü İndirme Çubuğu ve Medya Algılayıcı
(function () {
  'use strict';

  if (window.__voltget_injected) return;
  window.__voltget_injected = true;

  const VIDEO_PORTAL_RE =
    /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|vimeo\.com|dailymotion\.com/i;

  let overlayEnabled = true;
  let siteDismissed = false;
  let lastReportedMediaUrl = '';
  const reportedMedia = new Set();
  const activeVideoOverlays = new Map(); // videoEl -> { host, updatePosition, destroy }

  function cleanDomain(u) {
    try {
      return new URL(u).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      return '';
    }
  }

  function destroyAllOverlays() {
    for (const entry of activeVideoOverlays.values()) {
      entry.destroy();
    }
    activeVideoOverlays.clear();
  }

  function applyOverlayState(allowed) {
    overlayEnabled = !!allowed && !siteDismissed;
    if (!overlayEnabled) {
      destroyAllOverlays();
    } else {
      scanAndAttachVideos();
    }
  }

  function syncOverlayPermissions() {
    try {
      chrome.runtime.sendMessage({ type: 'get_content_settings', pageUrl: location.href }, res => {
        if (chrome.runtime.lastError) {
          applyOverlayState(true);
          return;
        }
        applyOverlayState(res ? res.overlayEnabled !== false : true);
      });
    } catch {
      applyOverlayState(true);
    }
  }

  try {
    chrome.runtime.onMessage.addListener(msg => {
      if (msg?.type === 'settings_updated') {
        applyOverlayState(msg.overlayEnabled !== false);
      }
    });
  } catch {}

  function isChunkOrSegment(url) {
    if (!url || typeof url !== 'string') return true;
    if (url.startsWith('blob:') || url.startsWith('data:')) return true;
    if (url.includes('generate_204') || url.includes('/s/search/audio/')) return true;
    if (
      url.includes('.ts?') ||
      url.includes('range=') ||
      url.includes('sq=') ||
      url.includes('seq=')
    )
      return true;
    if (url.includes('segment-') || url.includes('init=') || url.includes('frag=')) return true;
    if (/\.(jpg|jpeg|png|webp|gif|svg|css|js)(\?|$)/i.test(url)) return true;
    return false;
  }

  function isRealMedia(url) {
    if (isChunkOrSegment(url)) return false;
    if (url.length < 20) return false;
    if (url.includes('/video/embed/')) return false;
    const PAT =
      /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|mov|flv|zip|rar|7z|pdf|exe|msi|apk|dmg|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)(\?|$)/i;
    const CDN =
      /(playmix|cdnimages|hls\d*\.|master\.txt|\/hls\/.*\.(m3u8|txt|mp4)|googlevideo|manifest\.googlevideo|tiktokcdn|cdninstagram|fbcdn|twimg|vimeocdn)/i;
    return PAT.test(url) || CDN.test(url);
  }

  function reportMedia(url, type) {
    if (!url || isChunkOrSegment(url)) return;
    const clean = url.split('?')[0];
    lastReportedMediaUrl = url;
    if (reportedMedia.has(clean)) return;
    reportedMedia.add(clean);

    const extMatch = url.match(
      /\.(m3u8|mpd|mp4|webm|mkv|mp3|m4a|zip|rar|7z|pdf|exe|msi|apk|dmg|doc|xls|ppt|epub|torrent)/i
    );
    const finalType =
      type ||
      (extMatch
        ? extMatch[1].toLowerCase()
        : url.includes('master.txt') || url.includes('.m3u8')
          ? 'm3u8'
          : 'mp4');

    try {
      chrome.runtime.sendMessage({
        type: 'sniffed',
        data: {
          url,
          type: finalType,
          pageUrl: location.href,
          title: document.title,
          userInitiated: false,
        },
      });
    } catch {}
  }

  function syncStreamFromBackground() {
    try {
      chrome.runtime.sendMessage({ type: 'get_best_stream', pageUrl: location.href }, res => {
        if (chrome.runtime.lastError) return;
        if (res && res.url) lastReportedMediaUrl = res.url;
      });
    } catch {}
  }

  function getTargetUrlForVideo(videoEl) {
    if (VIDEO_PORTAL_RE.test(location.hostname)) return location.href;
    const src = videoEl.currentSrc || videoEl.src;
    if (src && !src.startsWith('blob:') && !src.startsWith('data:')) return src;
    const sources = videoEl.querySelectorAll('source');
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i].src;
      if (s && !s.startsWith('blob:') && !s.startsWith('data:')) return s;
    }
    try {
      const iframes = document.querySelectorAll('iframe');
      for (let j = 0; j < iframes.length; j++) {
        const isrc = iframes[j].src;
        if (
          isrc &&
          (isrc.includes('molystream') || isrc.includes('/embed/') || isrc.includes('/video/'))
        ) {
          return isrc;
        }
      }
    } catch {}
    if (lastReportedMediaUrl) return lastReportedMediaUrl;
    return location.href;
  }

  const SHADOW_STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .vg-wrap { position: relative; display: inline-block; user-select: none; }
    .vg-bar {
      display: inline-flex;
      align-items: center;
      background: rgba(12, 16, 28, 0.94);
      border: 1px solid rgba(59, 130, 246, 0.65);
      color: #f8fafc;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 700;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(12px);
      overflow: hidden;
    }
    .vg-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 6px 10px;
      cursor: pointer;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      transition: background 0.14s ease;
    }
    .vg-btn:hover { background: rgba(37, 99, 235, 0.28); }
    .vg-logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 5px;
      background: linear-gradient(135deg, #2563eb, #0284c7);
      color: #fff;
      flex-shrink: 0;
    }
    .vg-caret, .vg-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 7px;
      cursor: pointer;
      border: 0;
      border-left: 1px solid rgba(255, 255, 255, 0.12);
      background: transparent;
      color: #cbd5e1;
      transition: background 0.14s ease, color 0.14s ease;
    }
    .vg-caret:hover { background: rgba(37, 99, 235, 0.28); color: #fff; }
    .vg-close:hover { background: rgba(239, 68, 68, 0.25); color: #fca5a5; }
    .vg-menu {
      display: none;
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 224px;
      background: rgba(12, 16, 28, 0.98);
      border: 1px solid rgba(59, 130, 246, 0.45);
      border-radius: 12px;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.78);
      backdrop-filter: blur(16px);
      padding: 6px;
      flex-direction: column;
      gap: 3px;
    }
    .vg-menu.open { display: flex; }
    .vg-item {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 0;
      background: transparent;
      color: #f1f5f9;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      width: 100%;
      transition: background 0.12s ease;
    }
    .vg-item:hover { background: rgba(37, 99, 235, 0.24); }
    .vg-item.accent { color: #38bdf8; }
    .vg-item.danger { color: #fca5a5; }
    .vg-item.danger:hover { background: rgba(239, 68, 68, 0.18); }
    .vg-sep { height: 1px; background: rgba(255, 255, 255, 0.08); margin: 3px 4px; }
  `;

  const ICON_BOLT = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  const ICON_CHEVRON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
  const ICON_X = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const ICON_VIDEO = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>`;
  const ICON_AUDIO = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  const ICON_SLIDERS = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>`;
  const ICON_EYE_OFF = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>`;

  function createVideoOverlay(videoEl) {
    if (!overlayEnabled || activeVideoOverlays.has(videoEl)) return;

    const isYouTube = /youtube\.com|youtu\.be/i.test(location.hostname);
    if (
      !isYouTube &&
      videoEl.closest?.(
        '.ad-banner, .advertisement, [id*="google_ads"], .twitter-tweet, [data-testid="tweet"]'
      )
    ) {
      return;
    }

    const rect = videoEl.getBoundingClientRect();
    if (!isYouTube && (rect.width < 280 || rect.height < 160)) return;

    const host = document.createElement('div');
    host.className = 'voltget-video-host';
    host.style.cssText = [
      'position: absolute',
      'z-index: 2147483640',
      'pointer-events: auto',
      'opacity: 0',
      'transition: opacity 0.22s ease, transform 0.18s ease',
      'transform: translateY(-4px)',
    ].join(';');

    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>${SHADOW_STYLES}</style>
      <div class="vg-wrap">
        <div class="vg-bar">
          <button type="button" class="vg-btn vg-direct">
            <span class="vg-logo">${ICON_BOLT}</span>
            <span class="vg-label">VoltGet ile İndir</span>
          </button>
          <button type="button" class="vg-caret" title="Seçenekler">${ICON_CHEVRON}</button>
          <button type="button" class="vg-close" title="Gizle">${ICON_X}</button>
        </div>
        <div class="vg-menu">
          <button type="button" class="vg-item" data-action="video">${ICON_VIDEO}<span>Video İndir (En İyi Kalite)</span></button>
          <button type="button" class="vg-item" data-action="audio">${ICON_AUDIO}<span>Sadece Ses / Müzik (MP3)</span></button>
          <button type="button" class="vg-item accent" data-action="dialog">${ICON_SLIDERS}<span>Kalite Seç & Özellikler...</span></button>
          <div class="vg-sep"></div>
          <button type="button" class="vg-item danger" data-action="exclude-site">${ICON_EYE_OFF}<span>Bu sitede gösterme</span></button>
        </div>
      </div>
    `;

    const directBtn = shadow.querySelector('.vg-direct');
    const labelEl = shadow.querySelector('.vg-label');
    const caretBtn = shadow.querySelector('.vg-caret');
    const closeBtn = shadow.querySelector('.vg-close');
    const menu = shadow.querySelector('.vg-menu');
    const items = shadow.querySelectorAll('.vg-item');

    let isMenuOpen = false;
    let hideTimeout = null;

    function closeMenu() {
      isMenuOpen = false;
      menu.classList.remove('open');
    }

    function triggerDownload(action) {
      closeMenu();
      if (action === 'exclude-site') {
        const dom = cleanDomain(location.href);
        chrome.runtime.sendMessage({ type: 'toggle_domain_exclude', domain: dom }, () => {
          destroyAllOverlays();
        });
        return;
      }

      labelEl.textContent = 'Kontrol ediliyor...';
      labelEl.style.color = '#60a5fa';

      chrome.runtime.sendMessage(
        { type: 'get_best_stream', pageUrl: location.href },
        bestStream => {
          const isPortal = VIDEO_PORTAL_RE.test(location.hostname);
          const realUrl = isPortal
            ? location.href
            : bestStream?.url || getTargetUrlForVideo(videoEl) || location.href;

          chrome.runtime.sendMessage(
            {
              type: 'user_request_download',
              data: {
                url: realUrl,
                pageUrl: location.href,
                title: document.title || 'Video',
                asAudio: action === 'audio',
                showDialog: true,
                userInitiated: true,
              },
            },
            res => {
              if (res && res.ok === false) {
                if (res.reason === 'unauthorized') {
                  labelEl.textContent = 'Eşleştirme gerekli!';
                  labelEl.style.color = '#fde047';
                } else {
                  labelEl.textContent = 'VoltGet kapalı!';
                  labelEl.style.color = '#fca5a5';
                }
              } else {
                labelEl.textContent = 'VoltGet’e gönderildi ✓';
                labelEl.style.color = '#4ade80';
              }
              setTimeout(() => {
                labelEl.textContent = 'VoltGet ile İndir';
                labelEl.style.color = '';
              }, 2400);
            }
          );
        }
      );
    }

    directBtn.addEventListener('click', e => {
      e.stopPropagation();
      triggerDownload('dialog');
    });

    caretBtn.addEventListener('click', e => {
      e.stopPropagation();
      isMenuOpen = !isMenuOpen;
      menu.classList.toggle('open', isMenuOpen);
    });

    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      siteDismissed = true;
      destroyAllOverlays();
    });

    items.forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        triggerDownload(btn.getAttribute('data-action'));
      });
    });

    const onDocClick = () => {
      if (isMenuOpen) closeMenu();
    };
    document.addEventListener('click', onDocClick);

    function updatePosition() {
      if (!videoEl.isConnected) {
        destroy();
        activeVideoOverlays.delete(videoEl);
        return;
      }
      const vRect = videoEl.getBoundingClientRect();
      if (
        vRect.width < 140 ||
        vRect.height < 90 ||
        vRect.bottom < 0 ||
        vRect.top > window.innerHeight
      ) {
        host.style.display = 'none';
        return;
      }
      host.style.display = 'block';
      const fsEl = document.fullscreenElement;
      if (fsEl && (fsEl === videoEl || fsEl.contains(videoEl))) {
        if (host.parentElement !== fsEl) fsEl.appendChild(host);
        host.style.position = 'fixed';
        host.style.top = '16px';
        host.style.right = '24px';
        host.style.left = 'auto';
      } else {
        if (host.parentElement !== document.body) document.body.appendChild(host);
        host.style.position = 'absolute';
        const top = window.scrollY + vRect.top + 10;
        let left = window.scrollX + vRect.right - 205;
        if (left < window.scrollX + vRect.left + 8) left = window.scrollX + vRect.left + 8;
        host.style.top = Math.max(0, top) + 'px';
        host.style.left = Math.max(0, left) + 'px';
      }
    }

    function showOverlay() {
      updatePosition();
      host.style.opacity = '1';
      host.style.transform = 'translateY(0)';
      clearTimeout(hideTimeout);
      syncStreamFromBackground();
    }

    function scheduleHide() {
      if (isMenuOpen) return;
      clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (!isMenuOpen) {
          host.style.opacity = '0';
          host.style.transform = 'translateY(-4px)';
        }
      }, 2600);
    }

    const playerContainer =
      videoEl.closest(
        '#movie_player, .html5-video-player, .video-player, .player-container, .player, .jwplayer, .video-js, [data-player]'
      ) || videoEl.parentElement;

    videoEl.addEventListener('mouseenter', showOverlay);
    videoEl.addEventListener('mousemove', showOverlay);
    videoEl.addEventListener('mouseleave', scheduleHide);
    videoEl.addEventListener('play', showOverlay);

    if (playerContainer && playerContainer !== videoEl) {
      playerContainer.addEventListener('mouseenter', showOverlay);
      playerContainer.addEventListener('mousemove', showOverlay);
      playerContainer.addEventListener('mouseleave', scheduleHide);
    }

    host.addEventListener('mouseenter', () => {
      clearTimeout(hideTimeout);
      host.style.opacity = '1';
    });
    host.addEventListener('mouseleave', scheduleHide);

    function destroy() {
      clearTimeout(hideTimeout);
      document.removeEventListener('click', onDocClick);
      videoEl.removeEventListener('mouseenter', showOverlay);
      videoEl.removeEventListener('mousemove', showOverlay);
      videoEl.removeEventListener('mouseleave', scheduleHide);
      videoEl.removeEventListener('play', showOverlay);
      if (playerContainer && playerContainer !== videoEl) {
        playerContainer.removeEventListener('mouseenter', showOverlay);
        playerContainer.removeEventListener('mousemove', showOverlay);
        playerContainer.removeEventListener('mouseleave', scheduleHide);
      }
      host.remove();
    }

    document.body.appendChild(host);
    activeVideoOverlays.set(videoEl, { host, updatePosition, destroy });
    updatePosition();

    const initialSrc = getTargetUrlForVideo(videoEl);
    if (initialSrc && isRealMedia(initialSrc)) {
      reportMedia(initialSrc);
    }
  }

  function scanAndAttachVideos() {
    if (!overlayEnabled) return;
    const videos = document.querySelectorAll('video');
    for (let i = 0; i < videos.length; i++) {
      createVideoOverlay(videos[i]);
    }
  }

  // Tek global scroll/resize konum güncelleyici (rAF throttle)
  let rafScheduled = false;
  function updateAllPositions() {
    if (rafScheduled || activeVideoOverlays.size === 0) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      for (const entry of activeVideoOverlays.values()) {
        entry.updatePosition();
      }
    });
  }
  window.addEventListener('resize', updateAllPositions, { passive: true });
  window.addEventListener('scroll', updateAllPositions, { passive: true });
  document.addEventListener('fullscreenchange', updateAllPositions);

  // Debounced MutationObserver (SPA dostu düşük CPU)
  let scanTimer = null;
  function scheduleScan() {
    if (!overlayEnabled || scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanAndAttachVideos();
    }, 250);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('yt-navigate-finish', () => {
    siteDismissed = false;
    setTimeout(scanAndAttachVideos, 400);
    setTimeout(scanAndAttachVideos, 1200);
  });
  window.addEventListener('popstate', () => {
    siteDismissed = false;
    setTimeout(scanAndAttachVideos, 400);
  });

  // İlk izin kontrolü ve tarama
  void syncOverlayPermissions();

  // Ağ istekleri sniffer (yalnızca gerçek medya akışları)
  (function hookNetwork() {
    const origFetch = window.fetch;
    window.fetch = async function () {
      const args = Array.prototype.slice.call(arguments);
      const url = typeof args[0] === 'string' ? args[0] : args[0] && args[0].url;
      if (url && isRealMedia(url)) reportMedia(url);
      return origFetch.apply(this, args);
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (typeof url === 'string' && isRealMedia(url)) reportMedia(url);
      const rest = Array.prototype.slice.call(arguments, 2);
      return origOpen.apply(this, [method, url].concat(rest));
    };
  })();
})();
