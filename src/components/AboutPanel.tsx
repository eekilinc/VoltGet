import { useEffect, useState } from 'react'
import { useAppSettings } from '../context/AppSettingsContext'
import VoltLogo from './VoltLogo'

export default function AboutPanel() {
  const { t } = useAppSettings()
  const [status, setStatus] = useState<any>(null)
  const [extConnected, setExtConnected] = useState<boolean>(false)
  const [appVersion, setAppVersion] = useState<string>('1.0.5')

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

        <div style={{ margin: '0 auto', width: 84, height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <VoltLogo size={84} />
        </div>

        <div style={{ fontWeight: 900, fontSize: 24, marginTop: 14, letterSpacing: '0.03em', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <span className="brand-title-gradient">⚡ {t('aboutTitle')}</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--accent-solid)', color: '#fff', fontWeight: 800 }}>v{appVersion}</span>
        </div>

        <div className="text-muted" style={{ fontSize: 13, marginTop: 4, maxWidth: 540, margin: '6px auto 0' }}>
          {t('aboutSubtitle')}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
          <span style={{ fontSize: 11, background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 20, fontWeight: 700 }}>
            {t('feat8Threads')}
          </span>
          <span style={{ fontSize: 11, background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 20, fontWeight: 700 }}>
            {t('featHls')}
          </span>
          <span style={{ fontSize: 11, background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 20, fontWeight: 700 }}>
            {t('feat1800Sites')}
          </span>
          <span style={{ fontSize: 11, background: 'var(--badge-success-bg)', color: 'var(--badge-success-text)', border: '1px solid var(--badge-success-border)', padding: '4px 10px', borderRadius: 20, fontWeight: 800 }}>
            {t('featOpenSource')}
          </span>
        </div>
      </div>

      {/* GitHub & Kaynak Kod Bağlantıları */}
      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span>🐙</span>
          <span>{t('githubCommunity')}</span>
        </div>
        <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
          {t('githubDesc')}
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
            <span>{t('viewOnGithub')}</span>
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
            <span>{t('releasesAndInstalls')}</span>
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
            <span>{t('mitLicense')}</span>
          </button>
        </div>

        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
          <div>
            {t('projectOwner')}: <b style={{ color: 'var(--text)' }}>eekilinc</b>
          </div>
          <div>
            {t('repository')}: <code style={{ background: 'var(--panel-2)', padding: '2px 6px', borderRadius: 4 }}>eekilinc/VoltGet</code>
          </div>
        </div>
      </div>

      {/* Sistem & Motor Durumları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div className="card-premium" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>⚡ {t('ytdlpEngine')}</div>
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: status?.ytdlpVer ? 'var(--badge-success-bg)' : 'var(--badge-danger-bg)', color: status?.ytdlpVer ? 'var(--badge-success-text)' : 'var(--badge-danger-text)', border: '1px solid ' + (status?.ytdlpVer ? 'var(--badge-success-border)' : 'var(--badge-danger-border)'), fontWeight: 800 }}>
              {status?.ytdlpVer ? t('ready') : t('engineMissing')}
            </span>
          </div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
            {status?.ytdlpVer ? `${t('latestVersion')} ${status.ytdlpVer}` : t('engineScanning')}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            {t('ytdlpEngineDesc')}
          </div>
        </div>

        <div className="card-premium" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>🎞️ {t('ffmpegProcessor')}</div>
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: status?.ffmpegOk ? 'var(--badge-success-bg)' : 'var(--badge-danger-bg)', color: status?.ffmpegOk ? 'var(--badge-success-text)' : 'var(--badge-danger-text)', border: '1px solid ' + (status?.ffmpegOk ? 'var(--badge-success-border)' : 'var(--badge-danger-border)'), fontWeight: 800 }}>
              {status?.ffmpegOk ? t('ready') : t('ffmpegMissing')}
            </span>
          </div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
            {status?.ffmpegOk ? t('ffmpegReadyDesc') : t('ffmpegMissingDesc')}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            {t('ffmpegEngineDesc')}
          </div>
        </div>

        <div className="card-premium" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>🧩 {t('browserExtension')}</div>
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: extConnected ? 'var(--badge-success-bg)' : 'var(--badge-warning-bg)', color: extConnected ? 'var(--badge-success-text)' : 'var(--badge-warning-text)', border: '1px solid ' + (extConnected ? 'var(--badge-success-border)' : 'var(--badge-warning-border)'), fontWeight: 800 }}>
              {extConnected ? t('extConnectedStatus') : t('extWaitingStatus')}
            </span>
          </div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 6 }}>
            {extConnected ? t('extConnectedDesc') : t('extWaitingDesc')}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            {t('extCardFootnote')}
          </div>
        </div>
      </div>

      {/* Mimari & Desteklenen Formatlar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card-premium" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>🧰 {t('techArchTitle')}</div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.9 }}>
            • <b>Electron:</b> Electron 31 + Node.js 20 LTS<br />
            • <b>UI:</b> React 18 + TypeScript 5.5 + Vite 5<br />
            • <b>Engines:</b> yt-dlp + FFmpeg + 8-Thread HTTP Chunker<br />
            • <b>IPC:</b> WebSocket Server (127.0.0.1:8765)<br />
            • <b>Theme:</b> Glassmorphism, 7 Accent Colors
          </div>
        </div>

        <div className="card-premium" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: 13 }}>📁 {t('supportedTypesTitle')}</div>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.9 }}>
            • <b>Video:</b> MP4, MKV, WebM, MOV, AVI (4K, 1080p, 720p)<br />
            • <b>Stream:</b> HLS (m3u8, master.txt), DASH (mpd)<br />
            • <b>Audio:</b> MP3, M4A, FLAC, WAV, AAC, OGG (320 kbps)<br />
            • <b>Archive:</b> ZIP, RAR, 7Z, TAR, GZ, ISO, Torrent<br />
            • <b>Files:</b> PDF, DOCX, XLSX, EXE, MSI, APK
          </div>
        </div>
      </div>

      {/* Lisans ve Yasal Uyarı */}
      <div className="card-premium" style={{ borderRadius: 16, padding: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <b>⚖️ {t('licenseDisclaimerTitle')}:</b> {t('licenseDisclaimer')}
      </div>
    </div>
  )
}

