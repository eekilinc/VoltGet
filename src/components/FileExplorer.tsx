import { useEffect, useState } from 'react'
import { useAppSettings } from '../context/AppSettingsContext'

export default function FileExplorer(){
  const { t } = useAppSettings()
  const [dir, setDir] = useState('')
  useEffect(()=>{ window.api?.getDefaultDir().then(setDir) },[])
  return (
    <div style={{ flex:1, padding:18 }}>
      <div className="card-premium" style={{ borderRadius:18, padding:18 }}>
        <div style={{ fontWeight:800, fontSize:14 }}>📁 {t('files')}</div>
        <div className="text-muted" style={{ fontSize:12, marginTop:8, wordBreak:'break-all' }}>{dir}</div>
        <button onClick={()=>window.api.openFolder(dir)} className="brand-gradient" style={{ marginTop:12, color:'#fff', border:0, padding:'10px 14px', borderRadius:12, fontWeight:700 }}>{t('openFolder')}</button>
        <div className="text-muted" style={{ marginTop:14, fontSize:12, lineHeight:1.7 }}>
          İndirilen video, müzik, PDF, ZIP ve diğer dosyalar bu klasöre düşer. Site klasörleri açıksa YouTube/TikTok gibi alt dizinler oluşur.
        </div>
      </div>
    </div>
  )
}
