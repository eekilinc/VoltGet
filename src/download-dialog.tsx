import { useEffect, useState, useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

export type SiteProfile = 'hls' | 'youtube' | 'social' | 'file' | 'audio'

function normalizeToMasterPlaylist(url: string): string {
  if (!url || typeof url !== 'string') return url
  if (/molystream\.org\/embed\/([a-zA-Z0-9_-]+)($|\?)/i.test(url)) {
    return url.replace(/molystream\.org\/embed\/([a-zA-Z0-9_-]+)($|\?)/i, 'https://dbx.molystream.org/embed/$1/q/1')
  }
  return url.replace(/\/(?:txt\/)?[a-zA-Z0-9_.-]*sublist[a-zA-Z0-9_.-]*\.(txt|m3u8).*/i, '/master.$1')
}

function extractDomain(u: string): string {
  try {
    const p = new URL(u)
    return p.hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

function detectSiteProfile(url: string, pageUrl?: string, filename?: string): SiteProfile {
  const combined = `${url || ''} ${pageUrl || ''} ${filename || ''}`.toLowerCase()

  // 1. Doğrudan dosya indirmeleri (Arşiv, Kurulum, Belge)
  if (/\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(combined)) {
    return 'file'
  }

  // 2. Müzik & Ses siteleri veya doğrudan ses linkleri
  if (/\.(mp3|wav|flac|m4a|aac|ogg)($|\?)/i.test(combined) || combined.includes('soundcloud.com') || combined.includes('spotify.com') || combined.includes('bandcamp.com')) {
    return 'audio'
  }

  // 3. YouTube platformu
  if (/youtube\.com|youtu\.be/i.test(combined)) {
    return 'youtube'
  }

  // 4. Sosyal medya platformları
  if (/tiktok\.com|twitter\.com|x\.com|instagram\.com|facebook\.com|reddit\.com|vimeo\.com|dailymotion\.com|twitch\.tv/i.test(combined)) {
    return 'social'
  }

  // 5. Dizi, Film ve HLS Master Akışları (Ddizi, HD Film Cehennemi, Dizibox vb.)
  if (combined.includes('.m3u8') || combined.includes('master.txt') || combined.includes('/hls/') || combined.includes('cdnimages') || combined.includes('playmix') || combined.includes('molystream') || combined.includes('ddizi') || combined.includes('hdfilmcehennemi') || combined.includes('dizibox') || combined.includes('yabancidizi') || combined.includes('sinefy') || combined.includes('sezonlukdizi')) {
    return 'hls'
  }

  return 'hls'
}

function extractCleanTitle(d: any): string {
  if (d?.title && d.title !== 'Video' && d.title !== 'Dosya' && d.title !== 'İndiriliyor...' && d.title.length > 2) {
    return d.title
  }
  const urlToParse = d?.pageUrl || d?.url || ''
  try {
    const u = new URL(urlToParse)
    const segments = u.pathname.split('/').filter(Boolean)
    const lastSeg = segments.pop() || ''
    const clean = decodeURIComponent(lastSeg)
      .replace(/\.(htm|html|php|mp4|m3u8|txt)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim()
    if (clean && clean.length > 3 && !/^(master|video|playlist|sublist|index|watch)$/i.test(clean)) {
      return clean.charAt(0).toUpperCase() + clean.slice(1)
    }
    if (segments.length > 0) {
      const prevSeg = decodeURIComponent(segments.pop() || '').replace(/[-_]+/g, ' ').trim()
      if (prevSeg && prevSeg.length > 3 && !/^(izle|video|watch|embed)$/i.test(prevSeg)) {
        return prevSeg.charAt(0).toUpperCase() + prevSeg.slice(1)
      }
    }
  } catch {}
  return d?.filename ? d.filename.replace(/\.[a-z0-9]+$/i, '') : 'Medya_Indirme'
}

function DialogApp() {
  const [data, setData] = useState<any>(null)
  const [siteProfile, setSiteProfile] = useState<SiteProfile>('hls')
  const [formats, setFormats] = useState<any[]>([])
  const [videoFormats, setVideoFormats] = useState<any[]>([])
  const [availableHeights, setAvailableHeights] = useState<number[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [outDir, setOutDir] = useState<string>('')
  const [diskSpace, setDiskSpace] = useState<{ free: string, total: string } | null>(null)
  const [selectedFormat, setSelectedFormat] = useState<string>('best')
  const [isAudioMode, setIsAudioMode] = useState<boolean>(false)
  const [customTitle, setCustomTitle] = useState<string>('')
  const [starting, setStarting] = useState<boolean>(false)

  // Gelen veriyi işle ve site profiline göre analiz başlat
  const applyData = (d: any) => {
    if (!d) return
    const rawUrl = normalizeToMasterPlaylist(d.url || '')
    const pageUrl = d.pageUrl || rawUrl
    const profile = detectSiteProfile(rawUrl, pageUrl, d.filename)
    setSiteProfile(profile)

    const isVideoSite = profile === 'youtube' || profile === 'social'
    const targetUrl = isVideoSite ? pageUrl : rawUrl

    setData({ ...d, url: targetUrl, pageUrl, rawStreamUrl: rawUrl })

    if (d.asAudio || profile === 'audio') {
      setIsAudioMode(true)
    }

    const cleanTitle = extractCleanTitle(d)
    setCustomTitle(cleanTitle)

    // Profil bazlı format hazırlığı
    if (profile === 'file') {
      setFormats([])
      setVideoFormats([])
      setAvailableHeights([])
      setLoading(false)
    } else if (profile === 'hls') {
      // Dizi & Film akışları: Sadece gerçekte indirilebilecek 2 temel format sunulur
      const hlsFormats = [
        { id: 'best', resolution: '🎬 Tam Film / Dizi Videosu', ext: 'mp4', note: 'Orijinal Video (En Yüksek Çözünürlük)' },
        { id: 'bestaudio/best', resolution: '🎵 Sadece Ses Parçası', ext: 'mp3', note: 'MP3 Ses Kaydı' }
      ]
      setFormats(hlsFormats)
      setVideoFormats([hlsFormats[0]])
      setAvailableHeights([])
      setSelectedFormat('best')
      setLoading(false)
    } else if (profile === 'youtube' || profile === 'social') {
      // YouTube veya Sosyal Medya: Eğer formats zaten geldiyse doğrudan kullan, yoksa arka planda analiz et
      if (d.formats && Array.isArray(d.formats) && d.formats.length > 0) {
        processParsedFormats(d.formats, d.videoFormats)
      } else {
        // Arka planda gerçek mevcut çözünürlükleri tara
        setLoading(true)
        window.api?.analyzeUrl?.(targetUrl)
          .then((info: any) => {
            if (info && info.formats) {
              processParsedFormats(info.formats, info.videoFormats)
              if (info.title && (!cleanTitle || cleanTitle === 'Medya_Indirme')) {
                setCustomTitle(info.title)
              }
              if (info.thumbnail && !d.thumbnail) {
                setData((prev: any) => ({ ...prev, thumbnail: info.thumbnail }))
              }
            }
          })
          .catch((err: any) => {
            console.warn('[VoltGet Dialog] analyzeUrl fallback:', err)
          })
          .finally(() => {
            setLoading(false)
          })
      }
    }
  }

  // Formatları ayıkla ve SADECE mevcut çözünürlükleri listele
  const processParsedFormats = (allFormats: any[], vFormats?: any[]) => {
    setFormats(allFormats)
    const validVideo = (vFormats || allFormats.filter((f: any) => !f.isAudioOnly && f.height))
      .filter((f: any) => f.height && f.height > 0)

    setVideoFormats(validVideo)

    // Sadece bu videoda GERÇEKTEN var olan yükseklikleri al (Büyükten küçüğe tekil liste)
    const heights = Array.from(new Set(validVideo.map((f: any) => f.height as number))).sort((a: number, b: number) => b - a)
    setAvailableHeights(heights)

    // En iyi video formatını varsayılan olarak seç
    if (validVideo.length > 0) {
      setSelectedFormat(validVideo[0].id)
    } else {
      setSelectedFormat('best')
    }
  }

  useEffect(() => {
    window.api?.getDefaultDir?.().then((dir: string) => {
      if (dir) {
        setOutDir(dir)
        window.api?.getDiskSpace?.(dir).then((s: any) => {
          if (s?.free) setDiskSpace(s)
        })
      }
    })

    window.api?.getDownloadDialogData?.().then((d: any) => {
      if (d) applyData(d)
    })

    const cleanup = window.api?.onShowDownloadDialog?.((d: any) => {
      if (d) applyData(d)
    })

    const timer = setTimeout(() => {
      setLoading(false)
    }, 6000)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.api?.closeDialog?.() || window.close()
      } else if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        handleStart('download')
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleKeyDown)
      if (typeof cleanup === 'function') cleanup()
    }
  }, [])

  const handleSelectFolder = async () => {
    const chosen = await window.api?.selectFolder?.()
    if (chosen) {
      setOutDir(chosen)
      window.api?.getDiskSpace?.(chosen).then((s: any) => {
        if (s?.free) setDiskSpace(s)
      })
    }
  }

  const handleStart = async (action: 'download' | 'queue') => {
    if (starting || !data) return
    setStarting(true)

    try {
      const rawUrl = data.rawStreamUrl || normalizeToMasterPlaylist(data.url || '')
      const pageUrl = data.pageUrl || rawUrl
      const isVideoSite = siteProfile === 'youtube' || siteProfile === 'social'
      const targetUrl = isVideoSite ? pageUrl : (rawUrl || pageUrl)
      const finalTitle = customTitle.trim() || data.title || data.filename || 'Dosya'
      const cookie = data.cookie || ''
      const formatToUse = isAudioMode ? 'bestaudio/best' : selectedFormat

      const downloadOpts: any = {
        url: targetUrl,
        outDir,
        title: finalTitle,
        pageUrl,
        cookie,
        asAudio: isAudioMode,
        formatId: formatToUse
      }

      if (action === 'queue') {
        if (window.api?.queueDownload) {
          await window.api.queueDownload(downloadOpts)
        } else {
          await window.api.startDownload(downloadOpts)
        }
      } else {
        if (siteProfile === 'file') {
          await window.api.httpDownload({ url: rawUrl, outDir, filename: finalTitle, cookie })
        } else {
          await window.api.startDownload(downloadOpts)
        }
      }

      setTimeout(() => {
        window.api?.closeDialog?.() || window.close()
      }, 300)
    } catch (err: any) {
      console.error('Download start error:', err)
      setStarting(false)
      alert('İndirme başlatılamadı: ' + (err?.message || err))
    }
  }

  const domain = useMemo(() => {
    return extractDomain(data?.pageUrl || data?.url || '')
  }, [data])

  // Site profiline göre UI rozet ve renkleri
  const profileMeta = useMemo(() => {
    switch (siteProfile) {
      case 'hls':
        return {
          badge: '🎬 Dizi & Film Yayını (HLS Master Akışı)',
          badgeColor: '#a855f7',
          badgeBg: 'rgba(168, 85, 247, 0.15)',
          ext: isAudioMode ? '.mp3' : '.mp4',
          desc: 'Orijinal akıştan video ve ses birleştirilerek tam MP4 formatında kaydedilir.'
        }
      case 'youtube':
        return {
          badge: '▶️ YouTube Videosu',
          badgeColor: '#ef4444',
          badgeBg: 'rgba(239, 68, 68, 0.15)',
          ext: isAudioMode ? '.mp3' : '.mp4',
          desc: 'YouTube video ve ses kanalları seçilen çözünürlükte birleştirilir.'
        }
      case 'social':
        return {
          badge: '📱 Sosyal Medya Medyası',
          badgeColor: '#0ea5e9',
          badgeBg: 'rgba(14, 165, 233, 0.15)',
          ext: isAudioMode ? '.mp3' : '.mp4',
          desc: 'Platformdaki orijinal yüksek kaliteli medya dosyası indirilir.'
        }
      case 'file':
        return {
          badge: '📦 Doğrudan Dosya İndirme',
          badgeColor: '#10b981',
          badgeBg: 'rgba(16, 185, 129, 0.15)',
          ext: '.' + (data?.url ? data.url.split('/').pop()?.split('?')[0]?.split('.').pop() || 'bin' : 'bin'),
          desc: '8 kanallı çok parçalı HTTP hızlandırıcı motor ile doğrudan indirilir.'
        }
      case 'audio':
        return {
          badge: '🎵 Müzik & Ses Yayını',
          badgeColor: '#f59e0b',
          badgeBg: 'rgba(245, 158, 11, 0.15)',
          ext: '.mp3',
          desc: 'Orijinal ses yayını MP3 formatında yüksek ses kalitesiyle kaydedilir.'
        }
    }
  }, [siteProfile, isAudioMode, data])

  return (
    <div style={{
      background: 'linear-gradient(180deg, #0b1120 0%, #070b14 100%)',
      color: '#f8fafc',
      padding: '16px 20px',
      borderRadius: 16,
      border: '1px solid rgba(59, 130, 246, 0.4)',
      boxShadow: '0 24px 60px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      height: '100vh',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      userSelect: 'none',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Üst Başlık Çubuğu */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: 10,
        WebkitAppRegion: 'drag' as any
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)'
          }}>
            <span style={{ fontSize: 14 }}>⚡</span>
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 13, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '0.04em' }}>
              VOLTGET <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(59, 130, 246, 0.25)', color: '#60a5fa', fontWeight: 800, border: '1px solid rgba(59, 130, 246, 0.4)' }}>PRO</span>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>Akıllı İndirme İletişim Kutusu</div>
          </div>
        </div>

        {/* Pencere Kontrol Butonları */}
        <div style={{ display: 'flex', gap: 6, WebkitAppRegion: 'no-drag' as any }}>
          <button
            onClick={() => window.api?.minimizeDialog?.()}
            title="Simge Durumuna Küçült"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 6,
              color: '#94a3b8',
              cursor: 'pointer',
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; e.currentTarget.style.color = '#94a3b8' }}
          >
            —
          </button>
          <button
            onClick={() => window.api?.closeDialog?.() || window.close()}
            title="Kapat (Esc)"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 6,
              color: '#94a3b8',
              cursor: 'pointer',
              width: 26,
              height: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              transition: 'all 0.15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; e.currentTarget.style.color = '#94a3b8' }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Siteye Özel Başlık & Bilgi Kartı */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.8)',
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
      }}>
        {data?.thumbnail ? (
          <img
            src={data.thumbnail}
            alt="thumbnail"
            style={{
              width: 88,
              height: 52,
              objectFit: 'cover',
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.6)',
              flexShrink: 0
            }}
          />
        ) : (
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            background: profileMeta.badgeBg,
            border: `1px solid ${profileMeta.badgeColor}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0
          }}>
            {profileMeta.badge.slice(0, 2)}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10,
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: 6,
              background: profileMeta.badgeBg,
              color: profileMeta.badgeColor,
              border: `1px solid ${profileMeta.badgeColor}40`,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              {profileMeta.badge}
            </span>
            {domain && (
              <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 6 }}>
                🌐 {domain}
              </span>
            )}
          </div>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#f8fafc',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }} title={customTitle || data?.url}>
            {customTitle || data?.url || 'Bağlantı algılandı...'}
          </div>
        </div>
      </div>

      {/* Düzenlenebilir Dosya Adı Girişi */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Dosya Adı:
        </div>
        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(15, 23, 42, 0.85)', borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.5)', overflow: 'hidden' }}>
          <input
            type="text"
            value={customTitle}
            onChange={e => setCustomTitle(e.target.value)}
            placeholder="Dosya adını girin..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 0,
              color: '#f8fafc',
              fontSize: 12,
              fontWeight: 600,
              padding: '8px 10px',
              outline: 'none',
              width: '100%'
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 800, color: '#60a5fa', background: 'rgba(59, 130, 246, 0.15)', padding: '8px 10px', borderLeft: '1px solid rgba(255, 255, 255, 0.08)' }}>
            {profileMeta.ext}
          </span>
        </div>
      </div>

      {/* Kayıt Yeri ve Disk Alanı */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Kayıt Klasörü:
          </span>
          {diskSpace?.free && (
            <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>
              💾 Boş Alan: {diskSpace.free}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            flex: 1,
            fontSize: 11,
            background: 'rgba(15, 23, 42, 0.85)',
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#38bdf8',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center'
          }}>
            📁 {outDir || 'Varsayılan İndirme Klasörü'}
          </div>
          <button
            onClick={handleSelectFolder}
            style={{
              background: 'rgba(51, 65, 85, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 8,
              color: '#e2e8f0',
              padding: '0 12px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'background 0.15s'
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(71, 85, 105, 0.9)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(51, 65, 85, 0.8)' }}
          >
            Gözat...
          </button>
        </div>
      </div>

      {/* SİTEYE GÖRE UYARLANMIŞ İNDİRİLEBİLİR SEÇENEKLER BÖLÜMÜ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Bu Site İçin İndirilebilir Seçenekler:
          </span>
          {loading && (
            <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>🔄</span> Taranıyor...
            </span>
          )}
        </div>

        {/* 1. DURUM: DİZİ & FİLM SİTELERİ (HLS AKIŞLARI - Ddizi, HD Film Cehennemi, Dizibox vb.) */}
        {siteProfile === 'hls' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div
              onClick={() => { setIsAudioMode(false); setSelectedFormat('best') }}
              style={{
                background: !isAudioMode ? 'rgba(37, 99, 235, 0.18)' : 'rgba(15, 23, 42, 0.6)',
                border: !isAudioMode ? '1.5px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.08)',
                padding: '10px 12px',
                borderRadius: 10,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.15s'
              }}
            >
              <div style={{ fontSize: 24 }}>🎬</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 800, fontSize: 12, color: !isAudioMode ? '#60a5fa' : '#f8fafc' }}>
                    Tam Bölüm / Film Videosu (MP4)
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#2563eb', color: '#fff' }}>
                    Orijinal Kalite
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  Video ve ses kanalları birleştirilerek en yüksek netlikte MP4 olarak indirilir.
                </div>
              </div>
            </div>

            <div
              onClick={() => { setIsAudioMode(true); setSelectedFormat('bestaudio/best') }}
              style={{
                background: isAudioMode ? 'rgba(245, 158, 11, 0.18)' : 'rgba(15, 23, 42, 0.6)',
                border: isAudioMode ? '1.5px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.08)',
                padding: '10px 12px',
                borderRadius: 10,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'all 0.15s'
              }}
            >
              <div style={{ fontSize: 24 }}>🎵</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 800, fontSize: 12, color: isAudioMode ? '#fbbf24' : '#f8fafc' }}>
                    Sadece Ses İzi (MP3)
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#d97706', color: '#fff' }}>
                    MP3 Ses
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  Yalnızca Türkçe dublaj / orijinal ses parçası yüksek kalitede MP3 olarak ayıklanır.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. DURUM: YOUTUBE & SOSYAL MEDYA (SADECE GERÇEKTEN MEVCUT OLAN ÇÖZÜNÜRLÜKLER) */}
        {(siteProfile === 'youtube' || siteProfile === 'social') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Video vs Ses Mod Seçimi */}
            <div style={{ display: 'flex', gap: 6, background: 'rgba(15, 23, 42, 0.6)', padding: 3, borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <button
                onClick={() => setIsAudioMode(false)}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 7,
                  border: 0,
                  background: !isAudioMode ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : 'transparent',
                  color: !isAudioMode ? '#ffffff' : '#94a3b8',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: !isAudioMode ? '0 2px 8px rgba(37, 99, 235, 0.4)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                🎬 Video Olarak İndir
              </button>
              <button
                onClick={() => setIsAudioMode(true)}
                style={{
                  flex: 1,
                  padding: '6px 10px',
                  borderRadius: 7,
                  border: 0,
                  background: isAudioMode ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' : 'transparent',
                  color: isAudioMode ? '#ffffff' : '#94a3b8',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: isAudioMode ? '0 2px 8px rgba(245, 158, 11, 0.4)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                🎵 Sadece Ses (MP3)
              </button>
            </div>

            {!isAudioMode ? (
              <div>
                {/* SADECE BU VİDEODA VAR OLAN ÇÖZÜNÜRLÜK BUTONLARI */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  {/* Her zaman En İyi seçeneği */}
                  <button
                    onClick={() => setSelectedFormat(videoFormats[0]?.id || 'best')}
                    style={{
                      background: selectedFormat === (videoFormats[0]?.id || 'best') || selectedFormat === 'best'
                        ? 'rgba(37, 99, 235, 0.35)'
                        : 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid ' + (selectedFormat === (videoFormats[0]?.id || 'best') || selectedFormat === 'best' ? '#3b82f6' : 'rgba(255,255,255,0.08)'),
                      color: selectedFormat === (videoFormats[0]?.id || 'best') || selectedFormat === 'best' ? '#60a5fa' : '#94a3b8',
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    ⚡ En İyi {availableHeights[0] ? `(${availableHeights[0]}p)` : ''}
                  </button>

                  {/* Sadece analizde gerçekten bulunan çözünürlükleri dinamik buton yap */}
                  {availableHeights.map(h => {
                    const matchFmt = videoFormats.find((f: any) => f.height === h)
                    const isSelected = matchFmt && selectedFormat === matchFmt.id
                    let label = `${h}p`
                    if (h >= 2160) label = '4K (2160p)'
                    else if (h >= 1440) label = '2K (1440p)'
                    else if (h === 1080) label = '1080p FHD'
                    else if (h === 720) label = '720p HD'
                    else if (h === 480) label = '480p SD'

                    return (
                      <button
                        key={h}
                        onClick={() => matchFmt && setSelectedFormat(matchFmt.id)}
                        style={{
                          background: isSelected ? 'rgba(37, 99, 235, 0.35)' : 'rgba(30, 41, 59, 0.6)',
                          border: '1px solid ' + (isSelected ? '#3b82f6' : 'rgba(255,255,255,0.08)'),
                          color: isSelected ? '#60a5fa' : '#94a3b8',
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 10,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>

                {/* Sadece bu videoda mevcut formatları listeleyen açılır kutu */}
                <select
                  value={selectedFormat}
                  onChange={e => setSelectedFormat(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid rgba(59, 130, 246, 0.5)',
                    color: '#f8fafc',
                    padding: '8px 10px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {videoFormats.length > 0 ? (
                    videoFormats.map((f: any) => (
                      <option key={f.id} value={f.id} style={{ background: '#090d16', color: '#fff' }}>
                        {f.resolution || `${f.height}p`} {f.fps ? `• ${f.fps}fps` : ''} {f.ext ? `(${f.ext})` : ''} {f.note ? `— ${f.note}` : ''}
                      </option>
                    ))
                  ) : (
                    <option value="best" style={{ background: '#090d16', color: '#fff' }}>
                      🎬 En İyi Kalite (Otomatik Seçim)
                    </option>
                  )}
                </select>
              </div>
            ) : (
              <div style={{
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 11,
                color: '#fde68a',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span style={{ fontSize: 18 }}>🎵</span>
                <div>
                  <div style={{ fontWeight: 800 }}>En Yüksek Ses Kalitesi (MP3)</div>
                  <div style={{ fontSize: 10, opacity: 0.85 }}>Video parçası atılarak doğrudan 320 kbps MP3 ses dosyası indirilecektir.</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. DURUM: DOĞRUDAN DOSYA İNDİRME (ZIP, EXE, PDF, ISO VB.) */}
        {siteProfile === 'file' && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 10,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <div style={{ fontSize: 28 }}>📦</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 12, color: '#34d399' }}>
                8 Kanallı Yüksek Hızlı HTTP İndirme
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                Bu dosya doğrudan sunucudan 8 eşzamanlı parçaya bölünerek maksimum bant genişliğiyle indirilecektir.
              </div>
            </div>
          </div>
        )}

        {/* 4. DURUM: MÜZİK & SES PLATFORMLARI */}
        {siteProfile === 'audio' && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 10,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <div style={{ fontSize: 28 }}>🎵</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 12, color: '#fbbf24' }}>
                Yüksek Kaliteli Ses Yayını (MP3)
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                Orijinal ses yayını MP3 formatında netlik kaybı olmadan doğrudan indirilir.
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Alt Eylem Butonları */}
      <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <button
          onClick={() => handleStart('download')}
          disabled={starting}
          style={{
            flex: 2,
            border: 0,
            padding: '11px 14px',
            borderRadius: 10,
            background: isAudioMode
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
              : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#ffffff',
            fontSize: 12,
            fontWeight: 900,
            cursor: starting ? 'not-allowed' : 'pointer',
            boxShadow: isAudioMode
              ? '0 4px 16px rgba(245, 158, 11, 0.35)'
              : '0 4px 16px rgba(37, 99, 235, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'transform 0.1s, opacity 0.15s'
          }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)' }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          <span>{isAudioMode ? '🎵' : '🚀'}</span>
          <span>{starting ? 'Başlatılıyor...' : isAudioMode ? 'Hemen İndir (MP3)' : 'Hemen İndir'}</span>
        </button>

        <button
          onClick={() => handleStart('queue')}
          disabled={starting}
          title="İndirmeyi kuyruğa ekler, sırası geldiğinde indirir"
          style={{
            flex: 1.2,
            border: '1px solid rgba(255, 255, 255, 0.12)',
            padding: '11px 12px',
            borderRadius: 10,
            background: 'rgba(30, 41, 59, 0.8)',
            color: '#e2e8f0',
            fontSize: 12,
            fontWeight: 700,
            cursor: starting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(51, 65, 85, 0.9)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(30, 41, 59, 0.8)' }}
        >
          <span>⏳</span>
          <span>Kuyruğa Ekle</span>
        </button>

        <button
          onClick={() => window.api?.closeDialog?.() || window.close()}
          style={{
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '11px 14px',
            borderRadius: 10,
            background: 'rgba(255, 255, 255, 0.04)',
            color: '#94a3b8',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)' }}
        >
          İptal
        </button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<DialogApp />)
