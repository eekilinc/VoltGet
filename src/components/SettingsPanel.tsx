import { useEffect, useState } from 'react'
import { useAppSettings } from '../context/AppSettingsContext'
import { useToast } from '../context/ToastContext'
import { ACCENTS, AccentColor, ThemeMode } from '../theme'
import { LANGS, Lang } from '../i18n'

export default function SettingsPanel(){
  const { theme, accent, lang, setTheme, setAccent, setLang, t } = useAppSettings()
  const toast = useToast()
  const [outDir, setOutDir] = useState('')
  const [status, setStatus] = useState<any>(null)
  const [cfg, setCfg] = useState<any>({ concurrent:3, speedLimitKB:0, siteFolders:true, autoUpdateCheck:true, interceptBrowserDownloads:true, captureMediaRequests:true, captureDocuments:true, captureArchives:true, captureInstallers:true, openAtLogin:false, startMinimized:false })
  const [updating, setUpdating] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<any>(null)

  useEffect(()=>{
    window.api?.getDefaultDir().then(setOutDir)
    window.api?.getYtDlpStatus().then(setStatus)
    window.api?.getConfig().then(setCfg)
    window.api?.checkYtDlpUpdate().then(setUpdateInfo).catch(()=>{})
  },[])

  async function pickFolder(){
    const f = await window.api.selectFolder()
    if(f){ setOutDir(f); await window.api.setConfig({ customOutDir: f }); toast.success('İndirme klasörü güncellendi') }
  }
  async function updateYtDlp(){
    setUpdating(true)
    try{
      await window.api.downloadYtDlp()
      setStatus(await window.api.getYtDlpStatus())
      setUpdateInfo(await window.api.checkYtDlpUpdate())
      toast.success('yt-dlp başarıyla indirildi / güncellendi!')
    } catch(e:any){
      toast.error('Güncelleme hatası: ' + String(e?.message || e))
    }
    setUpdating(false)
  }
  async function saveCfg(patch:any){
    const n = await window.api.setConfig(patch); setCfg(n)
    toast.info('Ayarlar kaydedildi')
  }

  return (
    <div style={{ flex:1, padding:18, overflow:'auto', display:'flex', flexDirection:'column', gap:14 }}>
      <div className="card-premium" style={{ borderRadius:18, padding:18 }}>
        <div style={{ fontWeight:900, fontSize:16 }}>{t('settingsAppearance')}</div>
        <div className="text-muted" style={{ fontSize:12, marginTop:4 }}>{t('settingsTheme')} • {t('settingsLanguage')} • {t('accentColor')}</div>

        <div style={{ marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {(['dark','light'] as ThemeMode[]).map(mode => (
            <button key={mode} onClick={()=>setTheme(mode)} style={{
              padding:'14px 12px', borderRadius:14, textAlign:'left', color:'var(--text)',
              border:'1px solid '+(theme===mode?'var(--accent-solid)':'var(--border)'),
              background: theme===mode ? 'color-mix(in srgb, var(--accent-solid) 14%, var(--panel-2))' : 'var(--panel-2)'
            }}>
              <div style={{ fontWeight:800 }}>{mode==='dark'? t('themeDark') : t('themeLight')}</div>
              <div className="text-muted" style={{ fontSize:11, marginTop:4 }}>{mode==='dark' ? 'OLED / gece' : 'Açık / gündüz'}</div>
            </button>
          ))}
        </div>

        <div style={{ marginTop:16, fontWeight:700, fontSize:12 }}>{t('accentColor')}</div>
        <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
          {(Object.keys(ACCENTS) as AccentColor[]).map(key => (
            <button key={key} onClick={()=>setAccent(key)} title={ACCENTS[key].name} style={{
              width:34, height:34, borderRadius:999, border: accent===key ? '3px solid var(--text)' : '2px solid var(--border)',
              background:`linear-gradient(135deg, ${ACCENTS[key].from}, ${ACCENTS[key].to})`
            }}/>
          ))}
        </div>

        <div style={{ marginTop:16, fontWeight:700, fontSize:12 }}>{t('settingsLanguage')}</div>
        <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap' }}>
          {(Object.keys(LANGS) as Lang[]).map(code => (
            <button key={code} onClick={()=>setLang(code)} style={{
              padding:'8px 12px', borderRadius:10, color:'var(--text)',
              border:'1px solid '+(lang===code?'var(--accent-solid)':'var(--border)'),
              background: lang===code ? 'color-mix(in srgb, var(--accent-solid) 16%, var(--panel-2))' : 'var(--panel-2)',
              fontWeight:700, fontSize:12
            }}>{LANGS[code]}</button>
          ))}
        </div>
      </div>

      <div className="card-premium" style={{ borderRadius:18, padding:18 }}>
        <div style={{ fontWeight:800, fontSize:13 }}>🚀 Başlangıç</div>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12 }}>
          <input type="checkbox" checked={!!cfg.openAtLogin} onChange={e=> saveCfg({ openAtLogin: e.target.checked })} /> Windows başlangıcında aç
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12 }}>
          <input type="checkbox" checked={!!cfg.startMinimized} onChange={e=> saveCfg({ startMinimized: e.target.checked })} /> Sistem tepsisinde küçült
        </label>
      </div>

      <div className="card-premium" style={{ borderRadius:18, padding:18 }}>
        <div style={{ fontWeight:800, fontSize:13 }}>{t('settingsFolder')}</div>
        <div className="text-muted" style={{ fontSize:12, marginTop:6, wordBreak:'break-all', background:'var(--panel-2)', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)' }}>{outDir}</div>
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          <button onClick={pickFolder} className="brand-gradient" style={{ color:'#fff', border:0, padding:'8px 12px', borderRadius:10, fontSize:12, fontWeight:700 }}>Klasör Seç</button>
          <button onClick={()=>window.api.openFolder(outDir)} style={{ background:'var(--panel-2)', color:'var(--text)', border:'1px solid var(--border)', padding:'8px 12px', borderRadius:10, fontSize:12 }}>{t('open')}</button>
        </div>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:12, fontSize:12 }}>
          <input type="checkbox" checked={!!cfg.siteFolders} onChange={e=> saveCfg({ siteFolders: e.target.checked })} /> Siteye göre alt klasör
        </label>
      </div>

      <div className="card-premium" style={{ borderRadius:18, padding:18 }}>
        <div style={{ fontWeight:800, fontSize:13 }}>{t('settingsPerf')}</div>
        <div style={{ display:'flex', gap:12, marginTop:10, flexWrap:'wrap' }}>
          <label style={{ flex:1, minWidth:140, fontSize:12 }}> Eşzamanlı indirme<br/>
            <select value={cfg.concurrent} onChange={e=> saveCfg({ concurrent: parseInt(e.target.value)})} style={{ marginTop:6, width:'100%', padding:'8px', borderRadius:10 }}>
              <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={5}>5</option>
            </select>
          </label>
          <label style={{ flex:1, minWidth:140, fontSize:12 }}> Hız limiti (KB/s, 0=limitsiz)<br/>
            <input type="number" value={cfg.speedLimitKB} onChange={e=> saveCfg({ speedLimitKB: parseInt(e.target.value)||0 })} style={{ marginTop:6, width:'100%', padding:'8px', borderRadius:10 }} />
          </label>
        </div>
      </div>

      <div className="card-premium" style={{ borderRadius:18, padding:18 }}>
        <div style={{ fontWeight:800, fontSize:13 }}>{t('settingsSniffer')}</div>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12 }}>
          <input type="checkbox" checked={!!cfg.sniffNotifications} onChange={e=> saveCfg({ sniffNotifications: e.target.checked })} /> Yakalayınca bildirim göster
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12 }}>
          <input type="checkbox" checked={!!cfg.interceptBrowserDownloads} onChange={e=> saveCfg({ interceptBrowserDownloads: e.target.checked })} /> Tarayıcı indirmelerini yakala (IDM tarzı)
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12 }}>
          <input type="checkbox" checked={!!cfg.captureMediaRequests} onChange={e=> saveCfg({ captureMediaRequests: e.target.checked })} /> Video / müzik / HLS
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12 }}>
          <input type="checkbox" checked={!!cfg.captureDocuments} onChange={e=> saveCfg({ captureDocuments: e.target.checked })} /> Belgeler (pdf, doc, xls, ppt, epub)
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12 }}>
          <input type="checkbox" checked={!!cfg.captureArchives} onChange={e=> saveCfg({ captureArchives: e.target.checked })} /> Arşivler (zip, rar, 7z, iso, torrent)
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12 }}>
          <input type="checkbox" checked={!!cfg.captureInstallers} onChange={e=> saveCfg({ captureInstallers: e.target.checked })} /> Kurulum dosyaları (exe, msi, apk, dmg)
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:12, fontSize:12 }}>
          <span>Debounce (ms):</span>
          <input type="number" value={cfg.sniffDebounceMs||8000} onChange={e=> saveCfg({ sniffDebounceMs: parseInt(e.target.value)||8000 })} style={{ width:90, padding:'6px', borderRadius:8 }} />
        </label>
      </div>

      <div className="card-premium" style={{ borderRadius:18, padding:18 }}>
        <div style={{ fontWeight:800, fontSize:13 }}>{t('settingsTools')}</div>
        {status ? (
          <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:8, fontSize:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', background:'var(--panel-2)', padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)' }}>
              <span>yt-dlp</span><span>{status.ytdlpVer || ((status.binExists||status.pathExists)?'✓':'✗')}</span>
            </div>
            {updateInfo?.latest && <div className="text-muted" style={{ fontSize:11 }}>En son: {updateInfo.latest}</div>}
            <button onClick={updateYtDlp} disabled={updating} className="brand-gradient" style={{ color:'#fff', border:0, padding:'8px 12px', borderRadius:10, fontWeight:700 }}>
              {updating?'Güncelleniyor…':'yt-dlp Güncelle / İndir'}</button>
            <div style={{ display:'flex', justifyContent:'space-between', background:'var(--panel-2)', padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)' }}>
              <span>ffmpeg</span><span>{status.ffmpegOk?'✓ hazır':'✗ eksik'}</span>
            </div>
          </div>
        ) : <div className="text-muted" style={{ fontSize:12 }}>Yükleniyor…</div>}
      </div>
    </div>
  )
}
