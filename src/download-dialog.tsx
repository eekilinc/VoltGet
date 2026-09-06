import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

function DialogApp() {
  const [data, setData] = useState<any>(null)
  const [formats, setFormats] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [outDir, setOutDir] = useState<string>('')
  const [selectedFormat, setSelectedFormat] = useState<string>('')

  useEffect(() => {
    window.api?.getDefaultDir().then(setOutDir)

    window.api?.onShowDownloadDialog?.(async (d: any) => {
      // YouTube veya video sayfalarında ham stream yerine ana sayfa URL'sini kullan
      const rawUrl = d.url || ''
      const pageUrl = d.pageUrl || rawUrl
      const isVideoSite = /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com/i.test(pageUrl)
      const targetUrl = isVideoSite ? pageUrl : rawUrl

      setData({ ...d, url: targetUrl })
      setLoading(true)
      
      const isGen = /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(targetUrl)
      
      if (!isGen && !targetUrl.endsWith('.pdf')) {
        try {
          const res = await window.api.analyzeUrl(targetUrl)
          if (res?.formats?.length) {
            setFormats(res.formats)
            setSelectedFormat(res.formats[0].id)
          }
        } catch (e) {
          // Analiz başarısız olursa doğrudan indirme formatı
        }
      }
      setLoading(false)
    })
  }, [])

  const handleStart = async () => {
    if (!data) return
    const url = data.url
    const isGen = /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(url)

    if (isGen || url.endsWith('.pdf')) {
      await window.api.httpDownload({ url, outDir, filename: data.filename })
    } else if (selectedFormat) {
      await window.api.startDownload({ url: data.pageUrl || url, outDir, formatId: selectedFormat, title: data.filename || 'Video' })
    } else {
      await window.api.directDownload({ url, outDir, pageUrl: data.pageUrl, title: 'Hızlı İndir' })
    }
    window.close()
  }

  if (!data) {
    return (
      <div style={{ background: 'var(--panel)', color: 'var(--text)', padding: 24, borderRadius: 16, border: '1px solid var(--border)', height: '100vh', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Medya bekleniyor...</div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--panel)', color: 'var(--text)', padding: 20, borderRadius: 16,
      border: '2px solid var(--accent-solid)', boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
      height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontWeight: 900, fontSize: 14, color: 'var(--accent-solid)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🛡️</span> IDM: Yeni İndirme Başlat
        </div>
        <button onClick={() => window.close()} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, fontWeight: 'bold' }}>✕</button>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2 }}>Dosya / Adres:</div>
        <div style={{ fontSize: 11, background: 'var(--panel-2)', padding: '6px 10px', borderRadius: 8, wordBreak: 'break-all', border: '1px solid var(--border)', maxHeight: 42, overflow: 'hidden' }}>
          {data.filename || data.url}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2 }}>Kayıt Yeri:</div>
        <div style={{ fontSize: 11, background: 'var(--panel-2)', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--accent-solid)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {outDir}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--text-muted)' }}>🔍 Medya kaliteleri analiz ediliyor...</div>
      ) : formats.length > 0 ? (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Kalite Seçin:</div>
          <select value={selectedFormat} onChange={e => setSelectedFormat(e.target.value)} style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px', borderRadius: 8, fontSize: 12 }}>
            {formats.slice(0, 8).map((f: any) => (
              <option key={f.id} value={f.id}>
                {f.resolution} ({f.ext}) - {f.note || 'Standart'}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={handleStart}
          className="brand-gradient"
          style={{ flex: 1, border: 0, padding: '12px', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer', boxShadow: '0 6px 20px color-mix(in srgb, var(--accent-solid) 40%, transparent)' }}
        >
          🚀 İndirmeyi Başlat
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '12px 16px', borderRadius: 10, color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
        >
          İptal
        </button>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<DialogApp />)
