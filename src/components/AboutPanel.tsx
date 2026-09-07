import { useAppSettings } from '../context/AppSettingsContext'

export default function AboutPanel(){
  const { t } = useAppSettings()
  return (
    <div style={{ flex:1, padding:18, overflow:'auto', display:'flex', flexDirection:'column', gap:14 }}>
      <div className="card-premium glow-accent" style={{ borderRadius:20, padding:24, textAlign:'center' }}>
        <img src="./assets/icon-128.png" alt="VoltGet" style={{ width:78, height:78, margin:'0 auto', borderRadius:20, objectFit:'contain', boxShadow:'0 12px 32px rgba(14, 165, 233, 0.45)' }} />
        <div style={{ fontWeight:900, fontSize:22, marginTop:14 }}>{t('appName')}</div>
        <div className="text-muted" style={{ fontSize:12 }}>{t('appTagline')}</div>
        <div style={{ display:'inline-block', marginTop:10, fontSize:11, background:'var(--panel-2)', border:'1px solid var(--border)', padding:'5px 12px', borderRadius:20 }}>v1.1 • {t('idmAlt')}</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <div className="card-premium" style={{ borderRadius:16, padding:16 }}>
          <div style={{ fontWeight:800, fontSize:12 }}>🧰 Teknoloji</div>
          <div className="text-muted" style={{ fontSize:11, marginTop:8, lineHeight:1.8 }}>
            • Electron + Vite + React<br/>
            • yt-dlp + FFmpeg<br/>
            • Chrome MV3 Extension<br/>
            • Tema / dil / premium UI
          </div>
        </div>
        <div className="card-premium" style={{ borderRadius:16, padding:16 }}>
          <div style={{ fontWeight:800, fontSize:12 }}>✨ Özellikler</div>
          <div className="text-muted" style={{ fontSize:11, marginTop:8, lineHeight:1.8 }}>
            • Video + dosya yakalama<br/>
            • Duraklat / devam / kuyruk<br/>
            • Aydınlık-karanlık tema<br/>
            • TR/EN/DE/ES/RU/AR dil
          </div>
        </div>
      </div>

      <div className="card-premium" style={{ borderRadius:16, padding:16 }}>
        <div style={{ fontWeight:800, fontSize:12 }}>📁 Yakalayabileceği dosya türleri</div>
        <div className="text-muted" style={{ fontSize:12, marginTop:8, lineHeight:1.8 }}>
          Medya: mp4, webm, mkv, mp3, m4a, m3u8, mpd<br/>
          Belge: pdf, doc/docx, xls/xlsx, ppt/pptx, epub<br/>
          Arşiv: zip, rar, 7z, tar, gz, iso, torrent<br/>
          Kurulum: exe, msi, apk, dmg
        </div>
      </div>
    </div>
  )
}
