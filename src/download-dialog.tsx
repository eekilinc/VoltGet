import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

const DEFAULT_VIDEO_FORMATS = [
  { id: 'best', resolution: '🎬 En İyi Kalite (Önerilen)', ext: 'mp4', note: 'Otomatik Hızlı İndir' },
  { id: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best', resolution: '🎬 1080p Full HD', ext: 'mp4', note: 'Yüksek Çözünürlük' },
  { id: 'bestvideo[height<=720]+bestaudio/best[height<=720]/best', resolution: '🎬 720p HD', ext: 'mp4', note: 'Standart HD' },
  { id: 'bestvideo[height<=480]+bestaudio/best[height<=480]/best', resolution: '🎬 480p SD', ext: 'mp4', note: 'Hızlı İndirme' },
]

function normalizeToMasterPlaylist(url: string): string {
  if (!url || typeof url !== 'string') return url
  if (/molystream\.org\/embed\/([a-zA-Z0-9_-]+)($|\?)/i.test(url)) {
    return url.replace(/molystream\.org\/embed\/([a-zA-Z0-9_-]+)($|\?)/i, 'https://dbx.molystream.org/embed/$1/q/1')
  }
  return url.replace(/\/(?:txt\/)?[a-zA-Z0-9_.-]*sublist[a-zA-Z0-9_.-]*\.(txt|m3u8).*/i, '/master.$1')
}

function DialogApp() {
  const [data, setData] = useState<any>(null)
  const [formats, setFormats] = useState<any[]>(DEFAULT_VIDEO_FORMATS)
  const [loading, setLoading] = useState<boolean>(false)
  const [outDir, setOutDir] = useState<string>('')
  const [selectedFormat, setSelectedFormat] = useState<string>('best')
  const [isAudioMode, setIsAudioMode] = useState<boolean>(false)
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
    // 1. Varsayılan klasörü getir
    window.api?.getDefaultDir?.().then((dir: string) => {
      if (dir) setOutDir(dir)
    })

    // 2. İlk açılışta anında Electron ana sürecinden veriyi çek (did-finish-load yarışını çözer)
    window.api?.getDownloadDialogData?.().then((d: any) => {
      if (d) applyData(d)
    })

    // 3. Arka plandan gelecek analiz güncellemelerini dinle
    const cleanup = window.api?.onShowDownloadDialog?.((d: any) => {
      if (d) applyData(d)
    })

    // 4. Emniyet Zamanlayıcısı: En fazla 2.5 saniye sonra yükleniyor durumunu kapat
    const timer = setTimeout(() => {
      setLoading(false)
    }, 2500)

    return () => {
      clearTimeout(timer)
      if (typeof cleanup === 'function') cleanup()
    }
  }, [])

  const handleSelectFolder = async () => {
    const chosen = await window.api?.selectFolder?.()
    if (chosen) setOutDir(chosen)
  }

  const handleStart = async () => {
    if (!data || starting) return
    setStarting(true)

    try {
      const rawUrl = normalizeToMasterPlaylist(data.url || '')
      const pageUrl = data.pageUrl || rawUrl
      const isVideoSite = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(pageUrl)
      const targetUrl = isVideoSite ? pageUrl : (rawUrl || pageUrl)
      const title = data.title || data.filename || 'Dosya'
      const isGen = /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(rawUrl) ||
                    /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(data.filename || '') ||
                    data.isGenericDownload || data.type === 'file'
      const isHls = rawUrl.includes('master.txt') || rawUrl.includes('.m3u8') || rawUrl.includes('playmix') || rawUrl.includes('cdnimages') || rawUrl.includes('/q/') || rawUrl.includes('molystream')

      console.log('[download-dialog] handleStart:', { targetUrl, rawUrl, pageUrl, isAudioMode, selectedFormat, isGen, isHls })

      const cookie = data.cookie || ''
      if (isGen || rawUrl.endsWith('.pdf')) {
        await window.api.httpDownload({ url: rawUrl, outDir, filename: data.filename || title, cookie })
      } else if (isAudioMode) {
        await window.api.startDownload({ url: targetUrl, outDir, asAudio: true, pageUrl, cookie, title: `[Ses] ${title}` })
      } else if (selectedFormat && selectedFormat !== 'best') {
        await window.api.startDownload({ url: targetUrl, outDir, formatId: selectedFormat, pageUrl, cookie, title })
      } else {
        await window.api.startDownload({ url: targetUrl, outDir, formatId: 'best', pageUrl, cookie, title })
      }

      // Başarılı olduğunda pencereyi kapat
      setTimeout(() => {
        window.close()
      }, 350)
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
      background: 'rgba(15, 23, 42, 0.97)',
      color: '#f8fafc',
      padding: '16px 20px',
      borderRadius: 16,
      border: '2px solid #3b82f6',
      boxShadow: '0 24px 60px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(59, 130, 246, 0.4)',
      height: '100vh',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      backdropFilter: 'blur(20px)',
      userSelect: 'none'
    }}>
      {/* Üst Başlık Çubuğu */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 13, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: '0.02em' }}>
          <img src="./assets/icon-32.png" alt="logo" style={{ width: 18, height: 18, borderRadius: 4 }} onError={(e:any)=>{ e.target.style.display='none' }} />
          <span>VOLTGET • İNDİRME YÖNETİCİSİ</span>
        </div>
        <button
          onClick={() => window.close()}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6,
            color: '#94a3b8',
            cursor: 'pointer',
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 'bold',
            transition: 'all 0.15s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#94a3b8' }}
        >
          ✕
        </button>
      </div>

      {/* Dosya / Medya Bilgisi + Önizleme Kartı */}
      <div style={{
        background: 'rgba(30, 41, 59, 0.7)',
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        gap: 12,
        alignItems: 'center'
      }}>
        {data?.thumbnail ? (
          <img
            src={data.thumbnail}
            alt="thumbnail"
            style={{
              width: 84,
              height: 50,
              objectFit: 'cover',
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              flexShrink: 0
            }}
          />
        ) : (
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: isGenericFile ? 'rgba(59, 130, 246, 0.15)' : 'rgba(37, 99, 235, 0.15)',
            color: '#60a5fa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0
          }}>
            {isGenericFile ? '📦' : '🎬'}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 800,
            color: '#f8fafc',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {data?.title || data?.filename || data?.url || 'Bağlantı algılandı...'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {data?.duration && (
              <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 6, color: '#cbd5e1' }}>
                ⏱️ {data.duration}
              </span>
            )}
            {data?.uploader && (
              <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 6, color: '#93c5fd' }}>
                👤 {data.uploader}
              </span>
            )}
            <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 600 }}>
              {isGenericFile ? 'Doğrudan İndirme' : `${formats.length} Kalite Hazır`}
            </span>
          </div>
        </div>
      </div>

      {/* Kayıt Yeri Seçimi */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Kayıt Yeri:
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            flex: 1,
            fontSize: 11,
            background: 'rgba(30, 41, 59, 0.7)',
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
          >
            Değiştir...
          </button>
        </div>
      </div>

      {/* Kalite ve Format Seçenekleri (Direct dosya değilse) */}
      {!isGenericFile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
          {/* Format Mod Sekmeleri: Video vs Sadece Ses */}
          <div style={{ display: 'flex', gap: 6, background: 'rgba(30, 41, 59, 0.5)', padding: 3, borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <button
              onClick={() => setIsAudioMode(false)}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 7,
                border: 0,
                background: !isAudioMode ? '#2563eb' : 'transparent',
                color: !isAudioMode ? '#ffffff' : '#94a3b8',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
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
                background: isAudioMode ? '#d97706' : 'transparent',
                color: isAudioMode ? '#ffffff' : '#94a3b8',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
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
                  Video Kalitesi:
                </span>
                {loading && (
                  <span style={{ fontSize: 10, color: '#38bdf8', fontWeight: 600, animation: 'pulse 1.5s infinite' }}>
                    🔄 Formatlar taranıyor...
                  </span>
                )}
              </div>

              {/* Hızlı Kalite Hapları */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {[
                  { label: '🎬 En İyi Kalite', match: 'best' },
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
                        background: isSelected ? 'rgba(37, 99, 235, 0.3)' : 'rgba(30, 41, 59, 0.7)',
                        border: '1px solid ' + (isSelected ? '#3b82f6' : 'rgba(255,255,255,0.08)'),
                        color: isSelected ? '#60a5fa' : '#94a3b8',
                        padding: '4px 9px',
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

              <select
                value={selectedFormat}
                onChange={e => setSelectedFormat(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(30, 41, 59, 0.9)',
                  border: '1px solid #3b82f6',
                  color: '#f8fafc',
                  padding: '9px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {formats.map((f: any) => (
                  <option key={f.id} value={f.id} style={{ background: '#0f172a', color: '#fff' }}>
                    {f.resolution} {f.ext ? `(${f.ext})` : ''} {f.note ? `— ${f.note}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{
              background: 'rgba(217, 119, 6, 0.12)',
              border: '1px solid rgba(217, 119, 6, 0.3)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 11,
              color: '#fde68a',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span style={{ fontSize: 18 }}>🎵</span>
              <div>
                <div style={{ fontWeight: 800 }}>En Yüksek Kalitede MP3</div>
                <div style={{ fontSize: 10, opacity: 0.85 }}>Video otomatik olarak filtrelenip saf ses dosyası olarak kaydedilecek.</div>
              </div>
            </div>
          )}
        </div>
      )}

      {isGenericFile && (
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
          <span style={{ fontSize: 18 }}>📦</span>
          <div>
            <div style={{ fontWeight: 800 }}>Doğrudan Dosya İndirme</div>
            <div style={{ fontSize: 10, opacity: 0.85 }}>IDM çok kanallı hızlandırıcı ile en yüksek hızda indirilecek.</div>
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Alt Butonlar */}
      <div style={{ display: 'flex', gap: 10, paddingTop: 6, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <button
          onClick={handleStart}
          disabled={starting}
          style={{
            flex: 1,
            border: 0,
            padding: '12px 16px',
            borderRadius: 10,
            background: isAudioMode
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
              : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 900,
            cursor: starting ? 'not-allowed' : 'pointer',
            boxShadow: isAudioMode
              ? '0 6px 20px rgba(217, 119, 6, 0.4)'
              : '0 6px 20px rgba(37, 99, 235, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'transform 0.1s, filter 0.15s'
          }}
          onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)' }}
          onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
        >
          <span>{isAudioMode ? '🎵' : '🚀'}</span>
          <span>{starting ? 'Başlatılıyor...' : isAudioMode ? 'MP3 Olarak İndir' : 'İndirmeyi Başlat'}</span>
        </button>

        <button
          onClick={() => window.close()}
          style={{
            background: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            padding: '12px 18px',
            borderRadius: 10,
            color: '#94a3b8',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(51, 65, 85, 0.9)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(30, 41, 59, 0.8)' }}
        >
          İptal
        </button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<DialogApp />)
