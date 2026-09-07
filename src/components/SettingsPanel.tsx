import { useEffect, useState } from 'react'
import { useAppSettings } from '../context/AppSettingsContext'
import { useToast } from '../context/ToastContext'
import { ACCENTS, AccentColor, ThemeMode } from '../theme'
import { LANGS, Lang } from '../i18n'
import ExtensionInstallModal from './ExtensionInstallModal'

export default function SettingsPanel(){
  const { theme, accent, lang, setTheme, setAccent, setLang, t } = useAppSettings()
  const toast = useToast()
  const [outDir, setOutDir] = useState('')
  const [status, setStatus] = useState<any>(null)
  const [cfg, setCfg] = useState<any>({ concurrent:3, speedLimitKB:0, siteFolders:true, autoUpdateCheck:true, interceptBrowserDownloads:true, captureMediaRequests:true, captureDocuments:true, captureArchives:true, captureInstallers:true, openAtLogin:false, startMinimized:false })
  const [updating, setUpdating] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<any>(null)
  const [extConnected, setExtConnected] = useState(false)
  const [extModalOpen, setExtModalOpen] = useState(false)
  const [zipping, setZipping] = useState(false)

  useEffect(()=>{
    window.api?.getDefaultDir().then(setOutDir)
    window.api?.getYtDlpStatus().then(setStatus)
    window.api?.getConfig().then(setCfg)
    window.api?.checkYtDlpUpdate().then(setUpdateInfo).catch(()=>{})

    window.api?.getExtensionStatus?.().then((res: any) => {
      if (res) setExtConnected(!!res.connected)
    })
    const onExt = (res: any) => {
      if (res) setExtConnected(!!res.connected)
    }
    window.api?.onExtensionStatus?.(onExt)
  },[])

  async function pickFolder(){
    const f = await window.api.selectFolder()
    if(f){ setOutDir(f); await window.api.setConfig({ customOutDir: f }); toast.success(t('folderUpdated')) }
  }
  async function updateYtDlp(){
    setUpdating(true)
    try{
      await window.api.downloadYtDlp()
      setStatus(await window.api.getYtDlpStatus())
      setUpdateInfo(await window.api.checkYtDlpUpdate())
      toast.success(t('ytdlpUpdateSuccess'))
    } catch(e:any){
      toast.error(t('error') + ': ' + String(e?.message || e))
    }
    setUpdating(false)
  }
  async function saveCfg(patch:any){
    const n = await window.api.setConfig(patch); setCfg(n)
    toast.info(t('configSaved'))
  }

  async function openExtFolder() {
    const res = await window.api?.openExtensionFolder()
    if (res?.success) toast.success(t('extFolderOpened'))
    else toast.error(res?.error || t('error'))
  }

  async function exportExtZip() {
    setZipping(true)
    try {
      const res = await window.api?.exportExtensionZip()
      if (res?.success) toast.success(`${res.fileName || 'voltget-eklenti.zip'} ${t('done')}`)
      else toast.error(t('error'))
    } catch (e: any) {
      toast.error('Hata: ' + (e?.message || e))
    }
    setZipping(false)
  }

  return (
    <div style={{ flex:1, padding:18, overflow:'auto', display:'flex', flexDirection:'column', gap:14 }}>
      {/* Tarayıcı Eklentisi Yönetim Kartı */}
      <div className="card-premium glow-accent" style={{ borderRadius:18, padding:18 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:26 }}>🧩</span>
            <div>
              <div style={{ fontWeight:900, fontSize:15 }}>{t('extCardTitle')}</div>
              <div className="text-muted" style={{ fontSize:11 }}>
                {t('extCardDesc')}
              </div>
            </div>
          </div>
          <div style={{
            display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:20,
            background: extConnected ? 'rgba(34, 197, 94, 0.12)' : 'rgba(234, 179, 8, 0.12)',
            border: extConnected ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(234, 179, 8, 0.4)',
            color: extConnected ? '#86efac' : '#fde047',
            fontSize:12, fontWeight:800
          }}>
            <span>{extConnected ? '🟢' : '⚪'}</span>
            <span>{extConnected ? t('extConnectedStatus') : t('extWaitingStatus')}</span>
          </div>
        </div>

        <div style={{ marginTop:14, display:'flex', gap:10, flexWrap:'wrap' }}>
          <button
            onClick={openExtFolder}
            className="brand-gradient"
            style={{ color:'#fff', border:0, padding:'10px 14px', borderRadius:10, fontSize:12, fontWeight:800, display:'flex', alignItems:'center', gap:6 }}
          >
            <span>📂</span>
            <span>{t('openExtFolderBtn')}</span>
          </button>

          <button
            onClick={exportExtZip}
            disabled={zipping}
            style={{ background:'var(--panel-2)', color:'var(--text)', border:'1px solid var(--border)', padding:'10px 14px', borderRadius:10, fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}
          >
            <span>📦</span>
            <span>{zipping ? t('updating') : t('exportExtZipBtn')}</span>
          </button>

          <button
            onClick={()=>setExtModalOpen(true)}
            style={{ background:'var(--panel-2)', color:'var(--text)', border:'1px solid var(--border)', padding:'10px 14px', borderRadius:10, fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}
          >
            <span>🚀</span>
            <span>{t('viewExtGuideBtn')}</span>
          </button>
        </div>
      </div>

      <ExtensionInstallModal
        isOpen={extModalOpen}
        onClose={()=>setExtModalOpen(false)}
        connected={extConnected}
      />

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
              <div className="text-muted" style={{ fontSize:11, marginTop:4 }}>{mode==='dark' ? t('themeDarkDesc') : t('themeLightDesc')}</div>
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
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontWeight:800, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
            <span>🚀</span>
            <span>{t('settingsTrayAndStartup')}</span>
          </div>
          <span style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'rgba(59, 130, 246, 0.15)', color:'#60a5fa', fontWeight:800 }}>
            {t('trayStartupDesc')}
          </span>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:10, fontSize:12 }}>
          <label style={{ display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer', padding:'8px 10px', borderRadius:10, background:'var(--panel-2)', border:'1px solid var(--border)' }}>
            <input
              type="checkbox"
              style={{ marginTop:2 }}
              checked={!!cfg.openAtLogin}
              onChange={e=> saveCfg({ openAtLogin: e.target.checked })}
            />
            <div>
              <div style={{ fontWeight:700 }}>{t('autoStartWindows')}</div>
              <div className="text-muted" style={{ fontSize:11, marginTop:2 }}>
                {t('autoStartDesc')}
              </div>
            </div>
          </label>

          <label style={{ display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer', padding:'8px 10px', borderRadius:10, background:'var(--panel-2)', border:'1px solid var(--border)' }}>
            <input
              type="checkbox"
              style={{ marginTop:2 }}
              checked={cfg.closeToTray !== false}
              onChange={e=> saveCfg({ closeToTray: e.target.checked })}
            />
            <div>
              <div style={{ fontWeight:700 }}>{t('closeToTray')}</div>
              <div className="text-muted" style={{ fontSize:11, marginTop:2 }}>
                {t('closeToTrayDesc')}
              </div>
            </div>
          </label>

          <label style={{ display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer', padding:'8px 10px', borderRadius:10, background:'var(--panel-2)', border:'1px solid var(--border)' }}>
            <input
              type="checkbox"
              style={{ marginTop:2 }}
              checked={!!cfg.minimizeToTray}
              onChange={e=> saveCfg({ minimizeToTray: e.target.checked })}
            />
            <div>
              <div style={{ fontWeight:700 }}>{t('minimizeToTray')}</div>
              <div className="text-muted" style={{ fontSize:11, marginTop:2 }}>
                {t('minimizeToTrayDesc')}
              </div>
            </div>
          </label>

          <label style={{ display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer', padding:'8px 10px', borderRadius:10, background:'var(--panel-2)', border:'1px solid var(--border)' }}>
            <input
              type="checkbox"
              style={{ marginTop:2 }}
              checked={!!cfg.startMinimized}
              onChange={e=> saveCfg({ startMinimized: e.target.checked })}
            />
            <div>
              <div style={{ fontWeight:700 }}>{t('startMinimized')}</div>
              <div className="text-muted" style={{ fontSize:11, marginTop:2 }}>
                {t('startMinimizedDesc')}
              </div>
            </div>
          </label>

          <label style={{ display:'flex', gap:10, alignItems:'flex-start', cursor:'pointer', padding:'8px 10px', borderRadius:10, background:'var(--panel-2)', border:'1px solid var(--border)' }}>
            <input
              type="checkbox"
              style={{ marginTop:2 }}
              checked={cfg.clipboardWatcher !== false}
              onChange={e=> saveCfg({ clipboardWatcher: e.target.checked })}
            />
            <div>
              <div style={{ fontWeight:700 }}>📋 {t('smartClipboardWatcher')}</div>
              <div className="text-muted" style={{ fontSize:11, marginTop:2 }}>
                {t('smartClipboardWatcherDesc')}
              </div>
            </div>
          </label>
        </div>
      </div>

      <div className="card-premium" style={{ borderRadius:18, padding:18 }}>
        <div style={{ fontWeight:800, fontSize:13 }}>{t('settingsFolder')}</div>
        <div className="text-muted" style={{ fontSize:12, marginTop:6, wordBreak:'break-all', background:'var(--panel-2)', padding:'10px 12px', borderRadius:10, border:'1px solid var(--border)' }}>{outDir}</div>
        <div style={{ display:'flex', gap:8, marginTop:10 }}>
          <button onClick={pickFolder} className="brand-gradient" style={{ color:'#fff', border:0, padding:'8px 12px', borderRadius:10, fontSize:12, fontWeight:700 }}>{t('selectFolder')}</button>
          <button onClick={()=>window.api.openFolder(outDir)} style={{ background:'var(--panel-2)', color:'var(--text)', border:'1px solid var(--border)', padding:'8px 12px', borderRadius:10, fontSize:12 }}>{t('open')}</button>
        </div>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:12, fontSize:12, cursor:'pointer' }}>
          <input type="checkbox" checked={!!cfg.siteFolders} onChange={e=> saveCfg({ siteFolders: e.target.checked })} /> {t('siteSubfolders')}
        </label>
      </div>

      <div className="card-premium" style={{ borderRadius:18, padding:18 }}>
        <div style={{ fontWeight:800, fontSize:13 }}>{t('settingsPerf')}</div>
        <div style={{ display:'flex', gap:12, marginTop:10, flexWrap:'wrap' }}>
          <label style={{ flex:1, minWidth:140, fontSize:12 }}> {t('concurrentDownloads')}<br/>
            <select value={cfg.concurrent} onChange={e=> saveCfg({ concurrent: parseInt(e.target.value)})} style={{ marginTop:6, width:'100%', padding:'8px', borderRadius:10 }}>
              <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={5}>5</option>
            </select>
          </label>
          <label style={{ flex:1, minWidth:140, fontSize:12 }}> {t('speedLimiter')}<br/>
            <input type="number" value={cfg.speedLimitKB} onChange={e=> saveCfg({ speedLimitKB: parseInt(e.target.value)||0 })} style={{ marginTop:6, width:'100%', padding:'8px', borderRadius:10 }} />
          </label>
        </div>
      </div>

      <div className="card-premium" style={{ borderRadius:18, padding:18 }}>
        <div style={{ fontWeight:800, fontSize:13 }}>{t('settingsSniffer')}</div>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12, cursor:'pointer' }}>
          <input type="checkbox" checked={!!cfg.sniffNotifications} onChange={e=> saveCfg({ sniffNotifications: e.target.checked })} /> {t('sniffNotificationShow')}
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12, cursor:'pointer' }}>
          <input type="checkbox" checked={!!cfg.interceptBrowserDownloads} onChange={e=> saveCfg({ interceptBrowserDownloads: e.target.checked })} /> {t('interceptBrowserDownloads')}
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12, cursor:'pointer' }}>
          <input type="checkbox" checked={!!cfg.captureMediaRequests} onChange={e=> saveCfg({ captureMediaRequests: e.target.checked })} /> {t('captureVideoAudio')}
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12, cursor:'pointer' }}>
          <input type="checkbox" checked={!!cfg.captureDocuments} onChange={e=> saveCfg({ captureDocuments: e.target.checked })} /> {t('captureDocs')}
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12, cursor:'pointer' }}>
          <input type="checkbox" checked={!!cfg.captureArchives} onChange={e=> saveCfg({ captureArchives: e.target.checked })} /> {t('captureArchives')}
        </label>
        <label style={{ display:'flex', gap:8, alignItems:'center', marginTop:10, fontSize:12, cursor:'pointer' }}>
          <input type="checkbox" checked={!!cfg.captureInstallers} onChange={e=> saveCfg({ captureInstallers: e.target.checked })} /> {t('captureInstallers')}
        </label>
      </div>

      <div className="card-premium" style={{ borderRadius:18, padding:18 }}>
        <div style={{ fontWeight:800, fontSize:13 }}>{t('settingsTools')}</div>
        {status ? (
          <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:8, fontSize:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', background:'var(--panel-2)', padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)' }}>
              <span>yt-dlp</span><span>{status.ytdlpVer || ((status.binExists||status.pathExists)?'✓':'✗')}</span>
            </div>
            {updateInfo?.latest && <div className="text-muted" style={{ fontSize:11 }}>{t('latestVersion')} {updateInfo.latest}</div>}
            <button onClick={updateYtDlp} disabled={updating} className="brand-gradient" style={{ color:'#fff', border:0, padding:'8px 12px', borderRadius:10, fontWeight:700 }}>
              {updating ? t('updating') : t('ytDlpUpdateBtn')}</button>
            <div style={{ display:'flex', justifyContent:'space-between', background:'var(--panel-2)', padding:'8px 10px', borderRadius:10, border:'1px solid var(--border)' }}>
              <span>ffmpeg</span><span>{status.ffmpegOk ? t('ffmpegReady') : t('ffmpegMissing')}</span>
            </div>
          </div>
        ) : <div className="text-muted" style={{ fontSize:12 }}>{t('loading')}</div>}
      </div>
    </div>
  )
}
