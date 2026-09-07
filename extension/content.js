// Flexplorer - IDM Tarzı Video Üstü İndirme Çubuğu ve Medya Algılayıcı (Content Script)
;(function () {
  'use strict'

  if (window.__flexplorer_injected) return
  window.__flexplorer_injected = true

  // --- 1. Yardımcı Fonksiyonlar ve Filtreler ---
  function isChunkOrSegment(url) {
    if (!url || typeof url !== 'string') return true
    if (url.startsWith('blob:') || url.startsWith('data:')) return true
    if (url.includes('generate_204') || url.includes('/s/search/audio/')) return true
    if (url.includes('.ts?') || url.includes('range=') || url.includes('sq=') || url.includes('seq=')) return true
    if (url.includes('segment-') || url.includes('init=') || url.includes('frag=')) return true
    if (/\.(jpg|jpeg|png|webp|gif|svg|css|js)(\?|$)/i.test(url)) return true
    return false
  }

  function isRealMedia(url) {
    if (isChunkOrSegment(url)) return false
    if (url.length < 20) return false
    if (url.includes('/video/embed/')) return false
    var PAT = /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|mov|flv|zip|rar|7z|pdf|exe|msi|apk|dmg|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)(\?|$)/i
    var CDN = /(playmix|cdnimages|hls\d*\.|master\.txt|\/hls\/.*\.(m3u8|txt|mp4)|googlevideo|manifest\.googlevideo|tiktokcdn|cdninstagram|fbcdn|twimg|vimeocdn)/i
    return PAT.test(url) || CDN.test(url)
  }

  var reportedMedia = new Set()
  var lastReportedMediaUrl = ''
  function reportMedia(url, type) {
    if (!url || isChunkOrSegment(url)) return
    var clean = url.split('?')[0]
    lastReportedMediaUrl = url
    if (reportedMedia.has(clean)) return
    reportedMedia.add(clean)

    var extMatch = url.match(/\.(m3u8|mpd|mp4|webm|mkv|mp3|m4a|zip|rar|7z|pdf|exe|msi|apk|dmg|doc|xls|ppt|epub|torrent)/i)
    var finalType = type || (extMatch ? extMatch[1].toLowerCase() : (url.includes('master.txt') || url.includes('.m3u8') ? 'm3u8' : 'mp4'))

    try {
      chrome.runtime.sendMessage({
        type: 'sniffed',
        data: {
          url: url,
          type: finalType,
          pageUrl: location.href,
          title: document.title,
          userInitiated: false
        }
      })
    } catch (e) {}
  }

  // --- 2. IDM Video Üstü İndirme Butonu (Floating Video Bar) ---
  var activeVideoOverlays = new Map() // videoEl -> overlayDiv

  function syncStreamFromBackground() {
    try {
      chrome.runtime.sendMessage({ type: 'get_best_stream', pageUrl: location.href }, function (res) {
        if (chrome.runtime.lastError) return
        if (res && res.url) {
          lastReportedMediaUrl = res.url
        }
      })
    } catch (e) {}
  }

  function getTargetUrlForVideo(videoEl) {
    // 1. YouTube, TikTok, Instagram, Twitter gibi sitelerde doğrudan sayfa URL'si en doğru formattır
    var h = location.hostname
    if (h.includes('youtube.com') || h.includes('youtu.be') || h.includes('tiktok.com') ||
        h.includes('instagram.com') || h.includes('twitter.com') || h.includes('x.com') ||
        h.includes('facebook.com') || h.includes('vimeo.com') || h.includes('dailymotion.com')) {
      return location.href
    }

    // 2. Doğrudan video src'si varsa
    var src = videoEl.currentSrc || videoEl.src
    if (src && !src.startsWith('blob:') && !src.startsWith('data:')) {
      return src
    }

    // 3. İçindeki <source> etiketleri
    var sources = videoEl.querySelectorAll('source')
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i].src
      if (s && !s.startsWith('blob:') && !s.startsWith('data:')) return s
    }

    // 4. Sayfadaki iframe kaynakları (molystream, embed player vs.)
    try {
      var iframes = document.querySelectorAll('iframe')
      for (var j = 0; j < iframes.length; j++) {
        var isrc = iframes[j].src
        if (isrc && (isrc.includes('molystream') || isrc.includes('/embed/') || isrc.includes('/video/'))) {
          return isrc
        }
      }
    } catch (e) {}

    // 5. Blob video için arka plandan yakalanmış gerçek m3u8 / stream URL'si varsa ONU KULLAN!
    if (lastReportedMediaUrl) {
      return lastReportedMediaUrl
    }

    return location.href
  }

  function createVideoOverlay(videoEl) {
    if (activeVideoOverlays.has(videoEl)) return

    var rect = videoEl.getBoundingClientRect()
    // 140x90'dan küçük videoları (küçük ikon, avatar vs.) yoksay
    if (rect.width < 140 || rect.height < 90) return

    var overlay = document.createElement('div')
    overlay.className = 'flexplorer-video-overlay'
    overlay.style.cssText = [
      'position: absolute',
      'z-index: 2147483640',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'user-select: none',
      'pointer-events: auto',
      'opacity: 0',
      'transition: opacity 0.25s ease, transform 0.2s ease',
      'transform: translateY(-4px)'
    ].join(';')

    var isMenuOpen = false
    var hideTimeout = null

    overlay.innerHTML = `
      <div class="flexplorer-btn-wrapper" style="position: relative; display: inline-block;">
        <div class="flexplorer-main-btn" style="
          display: flex;
          align-items: center;
          background: rgba(15, 23, 42, 0.92);
          border: 1px solid rgba(59, 130, 246, 0.7);
          color: #f8fafc;
          border-radius: 9px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 700;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(12px);
          transition: all 0.15s ease;
          overflow: hidden;
        ">
          <div class="flexplorer-action-direct" style="display: flex; align-items: center; gap: 7px; padding: 6px 10px; transition: background 0.12s;">
            <span style="display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; background: #2563eb; border-radius: 4px; color: #fff; font-size: 10px; font-weight: 900;">⚡</span>
            <span>Bu videoyu indir</span>
          </div>
          <div class="flexplorer-action-menu" style="display: flex; align-items: center; justify-content: center; padding: 6px 8px; border-left: 1px solid rgba(255, 255, 255, 0.15); font-size: 10px; opacity: 0.85; transition: background 0.12s;">
            ▾
          </div>
        </div>

        <div class="flexplorer-dropdown" style="
          display: none;
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 6px;
          min-width: 210px;
          background: rgba(15, 23, 42, 0.96);
          border: 1px solid rgba(59, 130, 246, 0.5);
          border-radius: 12px;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(16px);
          overflow: hidden;
          padding: 6px;
          flex-direction: column;
          gap: 4px;
        ">
          <div class="flexplorer-item" data-action="video" style="
            display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px;
            cursor: pointer; font-size: 12px; font-weight: 600; color: #f1f5f9; transition: background 0.12s;
          ">
            <span>🎬</span> <span>Video İndir (En İyi Kalite)</span>
          </div>
          <div class="flexplorer-item" data-action="audio" style="
            display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px;
            cursor: pointer; font-size: 12px; font-weight: 600; color: #f1f5f9; transition: background 0.12s;
          ">
            <span>🎵</span> <span>Sadece Ses / Müzik (MP3)</span>
          </div>
          <div style="height: 1px; background: rgba(255, 255, 255, 0.1); margin: 3px 0;"></div>
          <div class="flexplorer-item" data-action="dialog" style="
            display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 8px;
            cursor: pointer; font-size: 12px; font-weight: 600; color: #38bdf8; transition: background 0.12s;
          ">
            <span>⚙️</span> <span>Kalite Seç & Özellikler...</span>
          </div>
        </div>
      </div>
    `

    var mainBtn = overlay.querySelector('.flexplorer-main-btn')
    var directBtn = overlay.querySelector('.flexplorer-action-direct')
    var menuBtn = overlay.querySelector('.flexplorer-action-menu')
    var dropdown = overlay.querySelector('.flexplorer-dropdown')
    var items = overlay.querySelectorAll('.flexplorer-item')

    // Hover efektleri
    directBtn.addEventListener('mouseenter', function () {
      directBtn.style.background = 'rgba(59, 130, 246, 0.25)'
    })
    directBtn.addEventListener('mouseleave', function () {
      directBtn.style.background = 'transparent'
    })
    menuBtn.addEventListener('mouseenter', function () {
      menuBtn.style.background = 'rgba(59, 130, 246, 0.35)'
    })
    menuBtn.addEventListener('mouseleave', function () {
      menuBtn.style.background = 'transparent'
    })

    items.forEach(function (it) {
      it.addEventListener('mouseenter', function () {
        it.style.background = 'rgba(59, 130, 246, 0.25)'
      })
      it.addEventListener('mouseleave', function () {
        it.style.background = 'transparent'
      })
    })

    function triggerDownload(action) {
      dropdown.style.display = 'none'
      isMenuOpen = false

      directBtn.innerHTML = `
        <span style="color:#60a5fa; font-size:12px;">⏳</span>
        <span style="color:#60a5fa;">Akış kontrol ediliyor...</span>
      `

      // Arka plandan bu sekme ve alan adı için yakalanmış en kaliteli akışı sorgula
      chrome.runtime.sendMessage({ type: 'get_best_stream', pageUrl: location.href }, function (bestStream) {
        var h = location.hostname
        var isVideoPortal = h.includes('youtube.com') || h.includes('youtu.be') || h.includes('tiktok.com') ||
                            h.includes('instagram.com') || h.includes('twitter.com') || h.includes('x.com') ||
                            h.includes('facebook.com') || h.includes('vimeo.com') || h.includes('dailymotion.com')

        var realUrl = (bestStream && bestStream.url) ? bestStream.url : getTargetUrlForVideo(videoEl)
        if (!realUrl) {
          realUrl = location.href
        }

        directBtn.innerHTML = `
          <span style="color:#4ade80; font-size:12px;">✓</span>
          <span style="color:#4ade80;">İndirme başlatıldı...</span>
        `

        chrome.runtime.sendMessage({
          type: 'user_request_download',
          data: {
            url: realUrl,
            pageUrl: location.href,
            title: document.title || 'Video',
            asAudio: action === 'audio',
            showDialog: true,
            userInitiated: true
          }
        })

        setTimeout(function () {
          directBtn.innerHTML = `
            <span style="display:flex;align-items:center;justify-content:center;width:16px;height:16px;background:#2563eb;border-radius:4px;color:#fff;font-size:10px;font-weight:900;">⚡</span>
            <span>Bu videoyu indir</span>
          `
        }, 2500)
      })
    }

    // Ana butona tıklandığında doğrudan IDM indirme penceresini aç, oka tıklandığında menüyü aç
    mainBtn.addEventListener('click', function (e) {
      e.stopPropagation()
      if (menuBtn && (e.target === menuBtn || menuBtn.contains(e.target))) {
        isMenuOpen = !isMenuOpen
        dropdown.style.display = isMenuOpen ? 'flex' : 'none'
      } else {
        triggerDownload('dialog')
      }
    })

    // Menü öğelerine tıklandığında
    items.forEach(function (it) {
      it.addEventListener('click', function (e) {
        e.stopPropagation()
        var action = it.getAttribute('data-action')
        triggerDownload(action)
      })
    })

    document.addEventListener('click', function () {
      if (isMenuOpen) {
        isMenuOpen = false
        dropdown.style.display = 'none'
      }
    })

    function updatePosition() {
      if (!videoEl.isConnected) {
        overlay.remove()
        activeVideoOverlays.delete(videoEl)
        return
      }

      var vRect = videoEl.getBoundingClientRect()
      if (vRect.width < 140 || vRect.height < 90 || vRect.bottom < 0 || vRect.top > window.innerHeight) {
        overlay.style.display = 'none'
        return
      }

      overlay.style.display = 'block'
      var isFullscreen = document.fullscreenElement === videoEl || (videoEl.parentElement && document.fullscreenElement === videoEl.parentElement)

      if (isFullscreen) {
        overlay.style.position = 'fixed'
        overlay.style.top = '16px'
        overlay.style.right = '24px'
        overlay.style.left = 'auto'
      } else {
        overlay.style.position = 'absolute'
        var top = window.scrollY + vRect.top + 10
        var left = window.scrollX + vRect.right - 170
        if (left < window.scrollX + vRect.left) left = window.scrollX + vRect.left + 10
        overlay.style.top = Math.max(0, top) + 'px'
        overlay.style.left = Math.max(0, left) + 'px'
      }
    }

    function showOverlay() {
      updatePosition()
      overlay.style.opacity = '1'
      overlay.style.transform = 'translateY(0)'
      clearTimeout(hideTimeout)
      syncStreamFromBackground()
    }

    function scheduleHide() {
      if (isMenuOpen) return
      clearTimeout(hideTimeout)
      hideTimeout = setTimeout(function () {
        if (!isMenuOpen) {
          overlay.style.opacity = '0'
          overlay.style.transform = 'translateY(-4px)'
        }
      }, 2500)
    }

    // Video ve overlay mouse dinleyicileri
    videoEl.addEventListener('mouseenter', showOverlay)
    videoEl.addEventListener('mousemove', showOverlay)
    videoEl.addEventListener('mouseleave', scheduleHide)
    videoEl.addEventListener('play', showOverlay)

    overlay.addEventListener('mouseenter', function () {
      clearTimeout(hideTimeout)
      overlay.style.opacity = '1'
    })
    overlay.addEventListener('mouseleave', scheduleHide)

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, { passive: true })

    document.body.appendChild(overlay)
    activeVideoOverlays.set(videoEl, overlay)
    updatePosition()

    // Video kaynağını arka planda sessizce kaydet
    var initialSrc = getTargetUrlForVideo(videoEl)
    if (initialSrc && isRealMedia(initialSrc)) {
      reportMedia(initialSrc)
    }
  }

  function scanAndAttachVideos() {
    var videos = document.querySelectorAll('video')
    for (var i = 0; i < videos.length; i++) {
      createVideoOverlay(videos[i])
    }
  }

  // Sayfa yüklenirken ve dinamik eklendikçe tara
  scanAndAttachVideos()
  var observer = new MutationObserver(function () {
    scanAndAttachVideos()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  setInterval(scanAndAttachVideos, 2500)

  // --- 3. Medya Ağ İstekleri Sniffer (Yalnızca gerçel ana medyalar için) ---
  ;(function hookNetwork() {
    var origFetch = window.fetch
    window.fetch = async function () {
      var args = Array.prototype.slice.call(arguments)
      var url = typeof args[0] === 'string' ? args[0] : args[0] && args[0].url
      if (url && isRealMedia(url)) {
        reportMedia(url)
      }
      return origFetch.apply(this, args)
    }

    var origOpen = XMLHttpRequest.prototype.open
    XMLHttpRequest.prototype.open = function (method, url) {
      if (typeof url === 'string' && isRealMedia(url)) {
        reportMedia(url)
      }
      var rest = Array.prototype.slice.call(arguments, 2)
      return origOpen.apply(this, [method, url].concat(rest))
    }
  })()
})()
