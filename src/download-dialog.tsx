import { useEffect, useState, useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

const DEFAULT_VIDEO_FORMATS = [
  { id: 'best', resolution: '🎬 En İyi Kalite (Önerilen)', ext: 'mp4', note: 'Otomatik En Yüksek Çözünürlük' },
  { id: 'bestvideo[height<=2160]+bestaudio/best[height<=2160]/best', resolution: '🎬 4K Ultra HD (2160p)', ext: 'mp4', note: 'Ultra HD' },
  { id: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best', resolution: '🎬 1080p Full HD', ext: 'mp4', note: 'Yüksek Çözünürlük' },
  { id: 'bestvideo[height<=720]+bestaudio/best[height<=720]/best', resolution: '🎬 720p HD', ext: 'mp4', note: 'Standart HD' },
  { id: 'bestvideo[height<=480]+bestaudio/best[height<=480]/best', resolution: '🎬 480p SD', ext: 'mp4', note: 'Hızlı İndirme' },
  { id: 'bestaudio/best', resolution: '🎵 MP3 / Sadece Ses', ext: 'mp3', note: 'En Yüksek Ses Kalitesi' }
]

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

function detectCategory(url: string, filename?: string, asAudio?: boolean) {
  if (asAudio) return { name: 'Müzik & Ses', icon: '🎵', color: '#f59e0b', ext: '.mp3' }
  const check = (url + ' ' + (filename || '')).toLowerCase()
  if (/\.(mp3|m4a|flac|wav|ogg|aac)(\?|$)/i.test(check)) {
    return { name: 'Müzik & Ses', icon: '🎵', color: '#f59e0b', ext: '.mp3' }
  }
  if (/\.(zip|rar|7z|gz|tar|iso|torrent)(\?|$)/i.test(check)) {
    return { name: 'Sıkıştırılmış Arşiv', icon: '📦', color: '#a855f7', ext: '.zip' }
  }
  if (/\.(exe|msi|apk|dmg|pkg|deb|rpm)(\?|$)/i.test(check)) {
    return { name: 'Program / Yazılım', icon: '⚙️', color: '#ec4899', ext: '.exe' }
  }
  if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|epub|txt)(\?|$)/i.test(check)) {
    return { name: 'Belge & Doküman', icon: '📄', color: '#10b981', ext: '.pdf' }
  }
  return { name: 'Video Medya', icon: '🎬', color: '#3b82f6', ext: '.mp4' }
}

function DialogApp() {
  const [data, setData] = useState<any>(null)
  const [formats, setFormats] = useState<any[]>(DEFAULT_VIDEO_FORMATS)
  const [loading, setLoading] = useState<boolean>(false)
  const [outDir, setOutDir] = useState<string>('')
  const [diskSpace, setDiskSpace] = useState<{ free: string, total: string } | null>(null)
  const [selectedFormat, setSelectedFormat] = useState<string>('best')
  const [isAudioMode, setIsAudioMode] = useState<boolean>(false)
  const [customTitle, setCustomTitle] = useState<string>('')
  const [starting, setStarting] = useState<boolean>(false)

  const applyData = (d: any) => {
    if (!d) return
    const rawUrl = normalizeToMasterPlaylist(d.url || '')
    const pageUrl = d.pageUrl || rawUrl
    const isVideoSite = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(pageUrl)
    const targetUrl = isVideoSite ? pageUrl : rawUrl

    setData({ ...d, url: targetUrl, pageUrl })
    if (d.asAudio) {
      setIsAudioMode(true)
    }

    const initialName = d.title || d.filename || (d.url ? d.url.split('/').pop()?.split('?')[0] : '') || 'İndirilen_Dosya'
    setCustomTitle(initialName.replace(/\.[a-z0-9]{2,5}$/i, ''))

    if (d.formats && Array.isArray(d.formats) && d.formats.length > 0) {
      setFormats(d.formats)
      if (d.selectedFormat) {
        setSelectedFormat(d.selectedFormat)
      } else if (!selectedFormat || selectedFormat === 'best') {
        const firstVid = d.formats.find((f: any) => !f.isAudioOnly)
        if (firstVid) setSelectedFormat(firstVid.id)
      }
    } else {
      setFormats(DEFAULT_VIDEO_FORMATS)
    }

    setLoading(!!d.loading)
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
    }, 4500)

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

  const category = useMemo(() => {
    return detectCategory(data?.url || '', customTitle || data?.filename, isAudioMode)
  }, [data, customTitle, isAudioMode])

  const domain = useMemo(() => {
    return extractDomain(data?.pageUrl || data?.url || '')
  }, [data])

  const handleStart = async (action: 'download' | 'queue') => {
    if (!data || starting) return
    setStarting(true)

    try {
      const rawUrl = normalizeToMasterPlaylist(data.url || '')
      const pageUrl = data.pageUrl || rawUrl
      const isVideoSite = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(pageUrl)
      const targetUrl = isVideoSite ? pageUrl : (rawUrl || pageUrl)
      const finalTitle = customTitle.trim() || data.title || data.filename || 'Dosya'
      const isGen = /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(rawUrl) ||
                    /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(data.filename || '') ||
                    data.isGenericDownload || data.type === 'file'

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
        if (isGen || rawUrl.endsWith('.pdf')) {
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

  const isGenericFile = (data?.url && /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(data.url)) ||
                        (data?.filename && /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(data.filename)) ||
                        data?.isGenericDownload || data?.type === 'file'

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
            <div style={{ fontSize: 10, color: '#94a3b8' }}>Ultra Hızlı İndirme Yöneticisi</div>
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

      {/* Medya Önizleme ve Meta Bilgi Kartı */}
      <div style={{
        background: 'rgba(15, 23, 42, 0.75)',
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
            background: `rgba(${category.color === '#f59e0b' ? '245, 158, 11' : '37, 99, 235'}, 0.15)`,
            border: `1px solid ${category.color}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            flexShrink: 0
          }}>
            {category.icon}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: 6,
              background: `${category.color}20`,
              color: category.color,
              border: `1px solid ${category.color}40`,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
              <span>{category.icon}</span> {category.name}
            </span>
            {domain && (
              <span style={{ fontSize: 10, color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 6 }}>
                🌐 {domain}
              </span>
            )}
            {data?.duration && (
              <span style={{ fontSize: 10, color: '#cbd5e1', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 6 }}>
                ⏱️ {data.duration}
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
          }} title={data?.title || data?.filename || data?.url}>
            {data?.title || data?.filename || data?.url || 'Bağlantı hazır...'}
          </div>
        </div>
      </div>

      {/* Düzenlenebilir Dosya Adı Girişi */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Dosya Adı:
        </div>
        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(15, 23, 42, 0.85)', borderRadius: 8, border: '1px solid rgba(59, 130, 246, 0.5)', overflow: 'hidden', focusWithin: { borderColor: '#3b82f6' } }}>
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
            {category.ext}
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

      {/* Kalite & Format Seçenekleri */}
      {!isGenericFile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
          {/* Format Mod Sekmeleri: Video vs Ses */}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Çözünürlük ve Kalite:
                </span>
                {loading && (
                  <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>🔄</span> Formatlar taranıyor...
                  </span>
                )}
              </div>

              {/* Hızlı Kalite Rozetleri */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {[
                  { label: '⚡ En İyi', match: 'best' },
                  { label: '4K (2160p)', match: '2160' },
                  { label: '1080p Full HD', match: '1080' },
                  { label: '720p HD', match: '720' },
                  { label: '480p SD', match: '480' }
                ].map(pill => {
                  const found = formats.find(f => f.id === pill.match || f.id.includes(pill.match) || f.resolution?.includes(pill.match))
                  const targetVal = found ? found.id : pill.match
                  const isSelected = selectedFormat === targetVal
                  return (
                    <button
                      key={pill.label}
                      onClick={() => setSelectedFormat(targetVal)}
                      style={{
                        background: isSelected ? 'rgba(37, 99, 235, 0.35)' : 'rgba(30, 41, 59, 0.6)',
                        border: '1px solid ' + (isSelected ? '#3b82f6' : 'rgba(255,255,255,0.08)'),
                        color: isSelected ? '#60a5fa' : '#94a3b8',
                        padding: '4px 8px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {pill.label}
                    </button>
                  )
                })}
              </div>

              {/* Detaylı Format Açılır Listesi */}
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
                {formats.map((f: any) => (
                  <option key={f.id} value={f.id} style={{ background: '#090d16', color: '#fff' }}>
                    {f.resolution} {f.ext ? `(${f.ext})` : ''} {f.fps ? `• ${f.fps}fps` : ''} {f.note ? `— ${f.note}` : ''}
                  </option>
                ))}
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
              <span style={{ fontSize: 20 }}>🎵</span>
              <div>
                <div style={{ fontWeight: 800 }}>Saf Ses / MP3 Modu</div>
                <div style={{ fontSize: 10, opacity: 0.85 }}>Video filtrelenecek ve 320kbps yüksek kalitede MP3 olarak kaydedilecek.</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: 8,
          padding: '10px 12px',
          fontSize: 11,
          color: '#93c5fd',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span style={{ fontSize: 20 }}>📦</span>
          <div>
            <div style={{ fontWeight: 800 }}>Çok Kanallı Dosya İndirme</div>
            <div style={{ fontSize: 10, opacity: 0.85 }}>8 parçalı IDM hızlandırıcı ile en yüksek bant genişliğinde indirilecek.</div>
          </div>
        </div>
      )}

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
