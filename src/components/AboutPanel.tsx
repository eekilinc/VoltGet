import { useEffect, useState } from 'react'
import { useAppSettings } from '../context/AppSettingsContext'

export default function AboutPanel() {
  const { t } = useAppSettings()
  const [status, setStatus] = useState<any>(null)
  const [extConnected, setExtConnected] = useState<boolean>(false)
  const [appVersion, setAppVersion] = useState<string>('1.0.2')

  useEffect(() => {
    window.api?.getYtDlpStatus?.().then(setStatus)
    window.api?.getAppVersion?.().then((ver: string) => {
      if (ver) setAppVersion(ver)
    })
    window.api?.getExtensionStatus?.().then((res: any) => {
      if (res) setExtConnected(!!res.connected)
    })
    const cleanup = window.api?.onExtensionStatus?.((res: any) => {
      if (res) setExtConnected(!!res.connected)
    })
    return () => {
      if (typeof cleanup === 'function') cleanup()
    }
  }, [])

  const handleOpenLink = (url: string) => {
    if (window.api?.openExternal) {
      window.api.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
  }

  return (
    <div style={{ flex: 1, padding: 18, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero Kartı */}
      <div className="card-premium glow-accent" style={{ borderRadius: 20, padding: 24, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          top: -60,
          right: -60,
          width: 160,
          height: 160,
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.25) 0%, transparent 70%)',
          borderRadius: '50%',
          pointerEvents: 'none'
        }} />

        <img
          src="./assets/icon-128.png"
          alt="VoltGet"
          style={{
            width: 84,
            height: 84,
            margin: '0 auto',
            borderRadius: 22,
            objectFit: 'contain',
            boxShadow: '0 12px 36px rgba(37, 99, 235, 0.45)',
            border: '2px solid rgba(255, 255, 255, 0.15)'
          }}
        />

        <div style={{ fontWeight: 900, fontSize: 24, marginTop: 14, letterSpacing: '0.03em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span>⚡ VoltGet PRO</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#2563eb', color: '#fff', fontWeight: 800 }}>v{appVersion}</span>
        </div>

        <div className="text-muted" style={{ fontSize: 13, marginTop: 4, maxWidth: 540, margin: '6px auto 0' }}>
          Yeni Nesil Ultra Hızlı İndirme Yöneticisi, Akıllı HLS Medya Yakalayıcı ve Modern IDM Alternatifi
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
          <span style={{ fontSize: 11, background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 20, fontWeight: 700 }}>
            🚀 8-Kanallı HTTP Hızlandırıcı
          </span>
          <span style={{ fontSize: 11, background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 20, fontWeight: 700 }}>
            🎬 Akıllı HLS & DASH Birleştirici
          </span>
          <span style={{ fontSize: 11, background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 20, fontWeight: 700 }}>
            🎯 1800+ Medya Platformu
          </span>
          <span style={{ fontSize: 11, background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '4px 10px', borderRadius: 20, fontWeight: 800 }}>
            📄 MIT Lisanslı Açık Kaynak
          </span>
        </div>
      </div>

      {/* GitHub & Kaynak Kod Bağlantıları */}
      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span>🐙</span>
          <span>GitHub & Açık Kaynak Topluluğu</span>
        </div>
        <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          VoltGet, topluluk tarafından geliştirilen tamamen özgür ve açık kaynak kodlu bir projedir. Kodları inceleyebilir, hata bildiriminde bulunabilir veya yeni özellikler önerebilirsiniz.
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <button
            onClick={() => handleOpenLink('https://github.com/eekilinc/VoltGet')}
            className="brand-gradient"
            style={{
              color: '#fff',
              border: 0,
              padding: '10px 16px',
              borderRadius: 12,
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
            }}
          >
            <span>⭐</span>
            <span>GitHub'da İncele & Yıldız Ver</span>
          </button>

          <button
            onClick={() => handleOpenLink('https://github.com/eekilinc/VoltGet/releases')}
            style={{
              background: 'var(--panel-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              padding: '10px 16px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <span>📦</span>
            <span>Sürümler & Kurulum Dosyaları (Releases)</span>
          </button>

          <button
            onClick={() => handleOpenLink('https://github.com/eekilinc/VoltGet/blob/main/LICENSE')}
            style={{
              background: 'var(--panel-2)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              padding: '10px 16px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <span>📜</span>
            <span>MIT Lisansı (Özgür Kullanım)</span>
          </button>
        </div>

        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
          <div>
            Proje Sahibi & Geliştirici: <b style={{ color: 'var(--text)' }}>eekilinc</b>
          </div>
          <div>
            Depo: <code style={{ background: 'var(--panel-2)', padding: '2px 6px', borderRadius: 4 }}>eekilinc/VoltGet</code>
          </div>
        </div>
      </div>

      {/* Sistem & Motor Durumları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div className="card-premium" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>⚡ yt-dlp Motoru</div>
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: status?.ytdlpVer ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: status?.ytdlpVer ? '#4ade80' : '#f87171', fontWeight: 800 }}>
              {status?.ytdlpVer ? 'Hazır' : 'Eksik'}
            </span>
          </div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
            {status?.ytdlpVer ? `Sürüm: ${status.ytdlpVer}` : 'İkili dosya taranıyor...'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            1800+ siteden 4K video ve ses akışı ayrıştırma motoru.
          </div>
        </div>

        <div className="card-premium" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>🎞️ FFmpeg İşlemci</div>
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: status?.ffmpegOk ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: status?.ffmpegOk ? '#4ade80' : '#f87171', fontWeight: 800 }}>
              {status?.ffmpegOk ? 'Hazır' : 'Sistemde Eksik'}
            </span>
          </div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
            {status?.ffmpegOk ? 'Video + Ses Çoklama Aktif' : 'WinGet ile yüklenebilir'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            HLS akış birleştirme ve MP3 dönüştürme işlemcisi.
          </div>
        </div>

        <div className="card-premium" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>🧩 Tarayıcı Eklentisi</div>
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: extConnected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)', color: extConnected ? '#4ade80' : '#facc15', fontWeight: 800 }}>
              {extConnected ? 'Bağlı (Port 8765)' : 'Bekleniyor'}
            </span>
          </div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
            {extConnected ? 'Canlı Akış Yakalama Aktif' : 'Chrome/Edge Eklentisini Açın'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            HTML5 video oynatıcılarda IDM tarzı buton çıkarma.
          </div>
        </div>
      </div>

      {/* Mimari & Desteklenen Formatlar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card-premium" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>🧰 Teknoloji Mimarisi</div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.9 }}>
            • <b>Çekirdek:</b> Electron 31 + Node.js 20 LTS<br />
            • <b>Arayüz:</b> React 18 + TypeScript 5.5 + Vite 5<br />
            • <b>İndirme Motorları:</b> yt-dlp + FFmpeg + 8-Thread HTTP Chunker<br />
            • <b>İletişim:</b> WebSocket WebSocketServer (127.0.0.1:8765)<br />
            • <b>Tasarım:</b> Glassmorphism, 7 Tema Rengi, Canlı Sayaçlar
          </div>
        </div>

        <div className="card-premium" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>📁 Desteklenen İndirme Türleri</div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.9 }}>
            • <b>Video:</b> MP4, MKV, WebM, MOV, AVI (4K, 1080p, 720p)<br />
            • <b>Akış:</b> HLS (m3u8, master.txt), DASH (mpd)<br />
            • <b>Ses:</b> MP3, M4A, FLAC, WAV, AAC, OGG (320 kbps)<br />
            • <b>Arşiv:</b> ZIP, RAR, 7Z, TAR, GZ, ISO, Torrent<br />
            • <b>Belge & Kurulum:</b> PDF, DOCX, XLSX, EXE, MSI, APK
          </div>
        </div>
      </div>

      {/* Lisans ve Yasal Uyarı */}
      <div className="card-premium" style={{ borderRadius: 16, padding: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <b>⚖️ Telif Hakkı ve Lisans Beyanı:</b> VoltGet, MIT Lisansı koşulları altında özgürce dağıtılır. Kullanıcılar, indirdikleri içeriklerin telif haklarına ve ilgili platformların kullanım koşullarına uymakla yükümlüdür.
      </div>
    </div>
  )
}

