import { useEffect, useState, useMemo } from 'react'
import DownloadPanel from './components/DownloadPanel'
import FileExplorer from './components/FileExplorer'
import SniffPanel from './components/SniffPanel'
import QueuePanel from './components/QueuePanel'
import SettingsPanel from './components/SettingsPanel'
import AboutPanel from './components/AboutPanel'
import ExtensionInstallModal from './components/ExtensionInstallModal'
import { useAppSettings } from './context/AppSettingsContext'

declare global { interface Window { api: any } }

export type Job = {
  id: string
  url: string
  title: string
  percent: number
  speed: string
  eta: string
  total: string
  status: 'downloading'|'done'|'error'|'queued'|'paused'
  log: string
  opts?: any
  filePath?: string
  fileName?: string
  deletedFromDisk?: boolean
}

export default function App() {
  const { t } = useAppSettings()
  const [tab, setTab] = useState<'download' | 'sniff' | 'explorer' | 'settings' | 'about'>('download')
  const [status, setStatus] = useState<any>(null)
  const [outDir, setOutDir] = useState('')
  const [jobs, setJobs] = useState<Job[]>([])
  const [downloadModal, setDownloadModal] = useState<any>(null)
  const [isExtModalOpen, setIsExtModalOpen] = useState(false)
  const [extConnected, setExtConnected] = useState(false)
  const [clipboardDetectedUrl, setClipboardDetectedUrl] = useState<string | null>(null)
  const [clipboardWatcherActive, setClipboardWatcherActive] = useState<boolean>(true)
  const [appVersion, setAppVersion] = useState<string>('1.0.3')
  const hasApi = typeof window !== 'undefined' && !!(window as any).api

  useEffect(() => {
    window.api?.getAppVersion?.().then((v: string) => {
      if (v) setAppVersion(v)
    })
    window.api.getYtDlpStatus().then(setStatus)
    window.api.getDefaultDir().then(setOutDir)
    window.api.getConfig?.().then((c: any) => {
      if (c && typeof c.clipboardWatcher === 'boolean') {
        setClipboardWatcherActive(c.clipboardWatcher)
      }
    })
    window.api.getQueue().then(async (saved: any[]) => {
      if (saved?.length) {
        const initialJobs = saved.filter((j: any) => j.status === 'done' || j.status === 'error' || j.status === 'paused').slice(0, 30)
        const verifiedJobs = await Promise.all(initialJobs.map(async (j: any) => {
          const fp = j.filePath || j.opts?.outPath || (j.opts?.filename && j.opts?.outDir ? `${j.opts.outDir}\\${j.opts.filename}` : '')
          if (j.status === 'done' && fp && window.api?.checkFileExists) {
            try {
              const exists = await window.api.checkFileExists(fp)
              return { ...j, filePath: fp, deletedFromDisk: !exists }
            } catch {}
          }
          return { ...j, filePath: fp || j.filePath }
        }))
        setJobs(verifiedJobs)
      }
    })
    const onP = (d: any) => {
      setJobs(j => {
        const exists = j.some(x => x.id === d.id)
        if (!exists) {
          const newJob: Job = {
            id: d.id,
            url: d.url || '',
            title: d.title || 'İndiriliyor...',
            percent: d.percent || 0,
            speed: d.speed || '-',
            eta: d.eta || '-',
            total: d.total || '',
            status: 'downloading',
            log: d.raw || 'İndiriliyor...'
          }
          const n = [newJob, ...j]
          window.api.saveQueue(n)
          return n
        }
        const n = j.map(x => x.id === d.id ? {
          ...x,
          title: (x.title === 'İndiriliyor...' || x.title === 'İndirme') && d.title ? d.title : x.title,
          percent: d.percent,
          speed: d.speed,
          eta: d.eta,
          total: d.total || x.total,
          log: d.raw,
          status: 'downloading' as Job['status']
        } : x)
        window.api.saveQueue(n)
        return n
      })
    }
    const onD = (d: any) => setJobs(j => {
      const n = j.map(x => x.id === d.id ? {
        ...x,
        status: (d.code === 0 ? 'done' : 'error') as Job['status'],
        percent: d.code === 0 ? 100 : x.percent,
        log: d.code === 0 ? 'Tamamlandı ✓' : x.log,
        filePath: d.filePath || x.filePath || x.opts?.outPath,
        fileName: d.fileName || x.fileName || x.opts?.filename,
        deletedFromDisk: false
      } : x)
      window.api.saveQueue(n)
      return n
    })
    const onE = (d: any) => setJobs(j => { const n = j.map(x => x.id === d.id ? { ...x, status: 'error' as Job['status'], log: d.error } : x); window.api.saveQueue(n); return n })
    const onL = (d: any) => setJobs(j => j.map(x => x.id === d.id ? { ...x, log: d.text } : x))
    const onQ = (d: any) => {
      setJobs(j => {
        const exists = j.some(x => x.id === d.id)
        if (exists) {
          const n = j.map(x => x.id === d.id ? { ...x, status: 'queued' as const, log: `Sırada #${d.position}` } : x)
          window.api.saveQueue(n)
          return n
        }
        const title = d.opts?.title || d.opts?.filename || d.opts?.url || 'İndirme'
        const newJob: Job = {
          id: d.id,
          url: d.opts?.url || '',
          title: title.slice(0, 70),
          percent: 0,
          speed: '-',
          eta: '-',
          total: '',
          status: 'queued',
          log: `Sırada #${d.position}`,
          opts: d.opts
        }
        const n = [newJob, ...j]
        window.api.saveQueue(n)
        return n
      })
    }
    const onS = (d: any) => {
      setJobs(j => {
        const title = d.opts?.title || d.opts?.filename || d.opts?.url || 'İndirme'
        const exists = j.some(x => x.id === d.id)
        if (exists) {
          const n = j.map(x => x.id === d.id ? {
            ...x,
            title: (title !== 'İndiriliyor...' && title !== 'İndirme') ? title.slice(0, 70) : x.title,
            status: 'downloading' as const,
            log: 'Başlatıldı...',
            opts: d.opts || x.opts
          } : x)
          window.api.saveQueue(n)
          return n
        }
        const newJob: Job = {
          id: d.id,
          url: d.opts?.url || '',
          title: title.slice(0, 70),
          percent: 0,
          speed: '-',
          eta: '-',
          total: '',
          status: 'downloading',
          log: 'Başlatıldı...',
          opts: d.opts
        }
        const n = [newJob, ...j]
        window.api.saveQueue(n)
        return n
      })
    }
    const onC = (d: any) => setJobs(j => j.filter(x => x.id !== d.id))
    const onPaused = (d: any) => setJobs(j => { const n = j.map(x => x.id === d.id ? { ...x, status: 'paused' as const, log: 'Duraklatıldı' } : x); window.api.saveQueue(n); return n })
    
    // Anlık yakalama bildirimi: Arka plan yakalamaları Yakalayıcı panelinde görünür
    const onSniffNotify = (_d: any) => {
      // Kullanıcı video üstü butona bastığında bağımsız downloadDialogWindow açıldığı için
      // ana pencerede çakışan modal açılması engellenir.
    }

    window.api.onProgress(onP); window.api.onDone(onD); window.api.onError(onE); window.api.onLog(onL); window.api.onQueued(onQ); window.api.onStarted(onS); window.api.onCanceled(onC)
    window.api.onPaused?.(onPaused)
    window.api.onSniffed(onSniffNotify)

    window.api.onClipboardUrl?.((d: { url: string }) => {
      if (d?.url) {
        setClipboardDetectedUrl(d.url)
      }
    })

    window.api.onOpenSniffItem?.((_d: any) => {
      setTab('sniff')
    })
    window.api.onSwitchToSniffTab?.(() => setTab('sniff'))
    window.api.onSwitchToDownloadTab?.(() => setTab('download'))

    window.api.getExtensionStatus?.().then((res: any) => {
      if (res) setExtConnected(!!res.connected)
    })
    const onExt = (res: any) => {
      if (res) setExtConnected(!!res.connected)
    }
    window.api.onExtensionStatus?.(onExt)

    return () => window.api?.removeAll()
  }, [hasApi])

  const totalSpeed = useMemo(() => {
    let sumBytes = 0
    let hasSpeed = false
    jobs.filter(j => j.status === 'downloading').forEach(j => {
      if (j.speed && j.speed !== '-') {
        hasSpeed = true
        const m = j.speed.match(/([0-9.]+)\s*([A-Za-z]+)\/s/i)
        if (m) {
          const val = parseFloat(m[1])
          const unit = m[2].toLowerCase()
          if (unit.startsWith('k')) sumBytes += val * 1024
          else if (unit.startsWith('m')) sumBytes += val * 1024 * 1024
          else if (unit.startsWith('g')) sumBytes += val * 1024 * 1024 * 1024
          else sumBytes += val
        }
      }
    })
    if (!hasSpeed || sumBytes === 0) return null
    if (sumBytes > 1024 * 1024) return (sumBytes / (1024 * 1024)).toFixed(1) + ' MB/s'
    return (sumBytes / 1024).toFixed(0) + ' KB/s'
  }, [jobs])

  const toggleClipboardWatcher = async () => {
    const next = !clipboardWatcherActive
    setClipboardWatcherActive(next)
    await window.api?.setConfig?.({ clipboardWatcher: next })
  }

  const handleStartDownload = async (opts:any)=>{
    const url = opts.url as string
    const title = opts.title || url.slice(0,50)
    const res = await window.api.startDownload(opts)
    const id = res.id
    const queued = !!res.queued
    setJobs(j=> { const n=[{ id, url, title, percent:0, speed:'-', eta:'-', total:'', status: queued?'queued':'downloading', log: queued? `Sırada #${res.position||'?'}`:'Başlatıldı...', opts } as Job, ...j]; window.api.saveQueue(n); return n })
    return id
  }
  const handleDirectDownload = async (opts:any)=>{
    const res = await window.api.directDownload(opts)
    const id = res.id as string
    const queued = !!(res as any).queued
    setJobs(j=> { const n=[{ id, url: opts.url, title: opts.url.slice(0,50), percent:0, speed:'-', eta:'-', total:'', status: queued?'queued':'downloading', log: queued? 'Sırada…':'Direkt indiriliyor...', opts } as Job, ...j]; window.api.saveQueue(n); return n })
    return id
  }
  const handleHttpDownload = async (opts:any)=>{
    const res = await window.api.httpDownload(opts)
    const id = res.id as string
    const queued = !!(res as any).queued
    const title = opts.filename || opts.url.slice(0,50)
    setJobs(j=> { const n=[{ id, url: opts.url, title, percent:0, speed:'-', eta:'-', total:'', status: queued?'queued':'downloading', log: queued? 'Sırada…':'İndiriliyor...', opts } as Job, ...j]; window.api.saveQueue(n); return n })
    return id
  }
  const handleRetry = async (job:Job)=>{
    if(!job.opts) return
    const res = await window.api.retryDownload(job.opts)
    const id = res.id
    setJobs(j=> { const n=j.filter(x=> x.id!==job.id); const queued=!!res.queued; return [{ id, url: job.url, title: job.title, percent:0, speed:'-', eta:'-', total:'', status: queued?'queued':'downloading', log: queued?'Sırada…':'Yeniden başlatıldı...', opts: job.opts } as Job, ...n] })
  }

  const handleRemoveJob = async (id: string) => {
    try {
      await window.api?.removeFromHistory?.(id)
    } catch {}
    setJobs(j => {
      const n = j.filter(x => x.id !== id)
      window.api.saveQueue(n)
      return n
    })
  }

  const handleDeleteJob = async (job: Job, deleteFromDisk: boolean) => {
    const targetPath = job.filePath || job.opts?.outPath
    try {
      await window.api?.deleteFile?.({ filePath: targetPath, deleteFromDisk, id: job.id })
    } catch {}
    setJobs(j => {
      const n = j.filter(x => x.id !== job.id)
      window.api.saveQueue(n)
      return n
    })
  }

  const titles: Record<string,string> = {
    download: '🔗 '+t('linkDownload'), sniff: '🎯 '+t('autoSniffer'), explorer: '📁 '+t('files'), settings: '⚙️ '+t('settings'), about: 'ℹ️ '+t('about')
  }

  if (!hasApi) {
    return (
      <div style={{ padding:24, background:'var(--bg)', color:'var(--text)', minHeight:'100vh' }}>
        <h2 style={{ color:'#f87171' }}>Electron dışında açıldı</h2>
        <div className="card-premium" style={{ marginTop:12, padding:12, borderRadius:12 }}>
          <pre>{`npm run dev`}</pre>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', height:'100vh', background:'var(--bg)', color:'var(--text)' }}>
      <div style={{ width:224, background:'var(--panel-3)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', padding:14, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 4px 14px 4px', borderBottom:'1px solid var(--border)', marginBottom:12 }}>
          <div style={{ position:'relative', flexShrink:0 }}>
            <img src="./assets/icon-48.png" alt="VoltGet" style={{ width:36, height:36, borderRadius:10, objectFit:'contain', boxShadow:'0 4px 16px color-mix(in srgb, var(--accent-solid) 45%, transparent)' }} />
            <span style={{ position:'absolute', bottom:-1, right:-1, width:9, height:9, borderRadius:99, background: extConnected ? '#22c55e' : '#3b82f6', border:'2px solid var(--panel-3)', boxShadow: extConnected ? '0 0 8px #22c55e' : 'none' }} />
          </div>
          <div style={{ minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontWeight:900, fontSize:16, letterSpacing:'-0.02em', background:'linear-gradient(135deg, #ffffff 50%, var(--accent-to))', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>VoltGet</span>
              <span style={{ fontSize:9, fontWeight:900, padding:'1px 5px', borderRadius:4, background:'var(--accent-solid)', color:'#fff' }}>PRO</span>
            </div>
            <div className="text-muted" style={{ fontSize:10, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t('idmAlt')}</div>
          </div>
        </div>

        <nav style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {[
            { id:'download', icon:'⬇️', label:t('navDownload'), desc:t('navDownloadDesc') },
            { id:'sniff', icon:'🎯', label:t('navSniff'), desc:t('navSniffDesc') },
            { id:'explorer', icon:'📁', label:t('navExplorer'), desc:t('navExplorerDesc') },
          ].map(item=>{
            const activeDownloads = jobs.filter(j=> j.status==='downloading'||j.status==='queued').length
            const isCurrent = tab === item.id
            return (
              <button key={item.id} onClick={()=>setTab(item.id as any)}
                style={{
                  position:'relative',
                  display:'flex', gap:10, alignItems:'center', padding:'10px 12px', borderRadius:12,
                  border:'1px solid '+(isCurrent ? 'color-mix(in srgb, var(--accent-solid) 45%, rgba(255,255,255,0.08))' : 'transparent'),
                  background: isCurrent ? 'color-mix(in srgb, var(--accent-solid) 14%, var(--panel-2))' : 'transparent',
                  color: isCurrent ? '#fff' : 'var(--text)',
                  textAlign:'left',
                  boxShadow: isCurrent ? '0 4px 18px color-mix(in srgb, var(--accent-solid) 12%, transparent)' : 'none',
                  transition:'all 0.16s ease'
                }}>
                {isCurrent && (
                  <div style={{ position:'absolute', left:0, top:8, bottom:8, width:3, borderRadius:'0 4px 4px 0', background:'var(--accent-solid)', boxShadow:'0 0 10px var(--accent-solid)' }} />
                )}
                <span style={{ fontSize:17 }}>{item.icon}</span>
                <span style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight: isCurrent ? 800 : 600 }}>{item.label}</div>
                  <div className="text-muted" style={{ fontSize:10 }}>{item.desc}</div>
                </span>
                {item.id==='download' && activeDownloads > 0 && (
                  <span style={{
                    background:'var(--accent-solid)',
                    color:'#fff',
                    padding:'2px 7px',
                    borderRadius:99,
                    fontSize:10,
                    fontWeight:900,
                    boxShadow:'0 2px 8px color-mix(in srgb, var(--accent-solid) 50%, transparent)'
                  }}>
                    {activeDownloads}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
        <div style={{ height:1, background:'var(--border)', margin:'10px 0' }}/>
        <nav style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {[
            { id:'settings', icon:'⚙️', label:t('navSettings'), desc:t('navSettingsDesc') },
            { id:'about', icon:'ℹ️', label:t('navAbout'), desc:t('navAboutDesc') },
          ].map(item=>{
            const isCurrent = tab === item.id
            return (
              <button key={item.id} onClick={()=>setTab(item.id as any)}
                style={{
                  position:'relative',
                  display:'flex', gap:10, alignItems:'center', padding:'9px 12px', borderRadius:12,
                  border:'1px solid '+(isCurrent ? 'color-mix(in srgb, var(--accent-solid) 45%, rgba(255,255,255,0.08))' : 'transparent'),
                  background: isCurrent ? 'color-mix(in srgb, var(--accent-solid) 14%, var(--panel-2))' : 'transparent',
                  color: isCurrent ? '#fff' : 'var(--text)',
                  textAlign:'left',
                  transition:'all 0.16s ease'
                }}>
                {isCurrent && (
                  <div style={{ position:'absolute', left:0, top:7, bottom:7, width:3, borderRadius:'0 4px 4px 0', background:'var(--accent-solid)', boxShadow:'0 0 10px var(--accent-solid)' }} />
                )}
                <span style={{ fontSize:15 }}>{item.icon}</span>
                <span>
                  <div style={{ fontSize:12, fontWeight: isCurrent ? 800 : 600 }}>{item.label}</div>
                  <div className="text-muted" style={{ fontSize:10 }}>{item.desc}</div>
                </span>
              </button>
            )
          })}
        </nav>

        <div style={{ flex:1 }}/>

        {/* Tarayıcı Eklentisi Durum Kartı */}
        <div
          onClick={()=>setIsExtModalOpen(true)}
          style={{
            cursor:'pointer',
            padding:'10px 12px',
            borderRadius:14,
            marginBottom:10,
            border: extConnected ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(234, 179, 8, 0.35)',
            background: extConnected ? 'rgba(34, 197, 94, 0.08)' : 'rgba(234, 179, 8, 0.08)',
            display:'flex',
            alignItems:'center',
            gap:10,
            transition:'all 0.16s ease'
          }}
          onMouseEnter={e=> { e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e=> { e.currentTarget.style.transform = 'translateY(0)' }}
        >
          <div style={{
            width:10, height:10, borderRadius:99,
            background: extConnected ? '#22c55e' : '#eab308',
            boxShadow: extConnected ? '0 0 10px #22c55e' : 'none'
          }} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:800, color: extConnected ? '#86efac' : '#fde047', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {extConnected ? 'Eklenti Bağlı ✓' : 'Eklenti Kurulumu ⚡'}
            </div>
            <div className="text-muted" style={{ fontSize:9, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              {extConnected ? 'IDM Yakalayıcı Aktif' : 'Chrome & Firefox'}
            </div>
          </div>
        </div>

        {status && (
          <div style={{ borderRadius:12, padding:'10px 12px', fontSize:11, background:'var(--panel-2)', border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <span style={{ fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:5 }}>
                <span>⚡</span> Motor Durumu
              </span>
              <span style={{ fontSize:10, color:'#22c55e', fontWeight:800 }}>HAZIR</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 6px', background:'var(--panel-3)', borderRadius:6, fontSize:10 }}>
                <span className="text-muted">yt-dlp</span>
                <span style={{ color:(status.binExists||status.pathExists)?'#22c55e':'#f87171', fontWeight:800 }}>{(status.binExists||status.pathExists)?'✓':'✗'}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'3px 6px', background:'var(--panel-3)', borderRadius:6, fontSize:10 }}>
                <span className="text-muted">ffmpeg</span>
                <span style={{ color:status.ffmpegOk?'#22c55e':'#f87171', fontWeight:800 }}>{status.ffmpegOk?'✓':'✗'}</span>
              </div>
            </div>
            <div className="text-muted" style={{ fontSize:9, marginTop:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', opacity:0.75 }} title={outDir}>
              📂 {outDir}
            </div>
          </div>
        )}
        <div className="text-muted" style={{ fontSize:10, marginTop:10, textAlign:'center' }}>v{appVersion} • {t('idmAlt')}</div>
      </div>

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div className="glass" style={{ height:54, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 16px', gap:10 }}>
          <div style={{ fontWeight:800, fontSize:14 }}>{titles[tab]}</div>
          {totalSpeed && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2) 0%, rgba(59, 130, 246, 0.1) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              padding: '4px 10px',
              borderRadius: 20,
              color: '#60a5fa',
              fontSize: 11,
              fontWeight: 900,
              boxShadow: '0 0 14px rgba(59, 130, 246, 0.25)'
            }}>
              <span style={{ animation: 'pulse 1s infinite' }}>⚡</span>
              <span>{totalSpeed}</span>
              <span style={{ fontSize: 9, opacity: 0.7 }}>• {jobs.filter(j=>j.status==='downloading').length} aktif</span>
            </div>
          )}
          <div style={{ flex:1 }}/>

          {/* Pano İzleyici Hızlı Geçiş Butonu */}
          <button
            onClick={toggleClipboardWatcher}
            title="Panoya bir link kopyalandığında otomatik algılama"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: clipboardWatcherActive ? 'rgba(59, 130, 246, 0.12)' : 'var(--panel-2)',
              color: clipboardWatcherActive ? '#60a5fa' : 'var(--text-muted)',
              border: '1px solid ' + (clipboardWatcherActive ? 'rgba(59, 130, 246, 0.35)' : 'var(--border)'),
              padding: '6px 11px',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 99, background: clipboardWatcherActive ? '#3b82f6' : '#64748b', boxShadow: clipboardWatcherActive ? '0 0 8px #3b82f6' : 'none' }} />
            <span>{clipboardWatcherActive ? t('clipboardWatcherOn') : t('clipboardWatcherOff')}</span>
          </button>

          <button
            onClick={()=>setIsExtModalOpen(true)}
            style={{
              display:'flex',
              alignItems:'center',
              gap:6,
              background: extConnected ? 'rgba(34, 197, 94, 0.12)' : 'rgba(234, 179, 8, 0.12)',
              color: extConnected ? '#86efac' : '#fde047',
              border: extConnected ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid rgba(234, 179, 8, 0.35)',
              padding:'6px 12px',
              borderRadius:10,
              fontSize:11,
              fontWeight:800,
              cursor:'pointer'
            }}
          >
            <span>{extConnected ? '🟢' : '🧩'}</span>
            <span>{extConnected ? t('extConnectedBadge') : t('extSetupBadge')}</span>
          </button>
          <button onClick={()=>window.api.getYtDlpStatus().then(setStatus)} style={{ background:'var(--panel-2)', color:'var(--text)', border:'1px solid var(--border)', padding:'7px 12px', borderRadius:10, fontSize:11 }}>{t('refresh')}</button>
          <button onClick={()=>window.api.openFolder(outDir)} className="brand-gradient" style={{ color:'#fff', border:0, padding:'7px 12px', borderRadius:10, fontSize:11, fontWeight:700 }}>📂 {t('folder')}</button>
        </div>
        <div style={{ flex:1, overflow:'hidden', display:'flex', background:'var(--bg-2)' }}>
          {tab==='download' && <DownloadPanel outDir={outDir} onStartDownload={handleStartDownload} />}
          {tab==='sniff' && <SniffPanel outDir={outDir} onStartDownload={handleStartDownload} onDirectDownload={handleDirectDownload} onHttpDownload={handleHttpDownload} />}
          {tab==='explorer' && <FileExplorer />}
          {tab==='settings' && <SettingsPanel />}
          {tab==='about' && <AboutPanel />}
        </div>
      </div>

      <QueuePanel jobs={jobs}
        onCancel={(id)=>{ window.api.cancelDownload(id); setJobs(j=> j.filter(x=> x.id!==id)) }}
        onPause={(id)=>{ window.api.pauseDownload(id); setJobs(j=> j.map(x=> x.id===id ? {...x, status:'paused', log:'Duraklatıldı'} : x)) }}
        onResume={async (job)=>{ const res = await window.api.resumeDownload({ id: job.id, opts: job.opts }); setJobs(j=> j.map(x=> x.id===job.id ? {...x, status: res?.queued?'queued':'downloading', log: res?.queued?'Sırada…':'Devam ediyor...'} : x)) }}
        onRetry={(job)=>handleRetry(job as any)}
        onOpenFolder={()=>window.api.openFolder(outDir)}
        onOpenFile={(filePath)=>window.api.openFile(filePath)}
        onShowInFolder={(filePath)=>window.api.showInFolder(filePath)}
        onRemoveJob={handleRemoveJob}
        onDeleteJob={handleDeleteJob}
        onClear={()=> setJobs(j=> { const n=j.filter(x=> x.status==='downloading'||x.status==='queued'||x.status==='paused'); window.api.saveQueue(n); return n })} />

      {/* IDM Tarzı Gelişmiş Dosya Özellikleri ve İndirme Penceresi (Download Properties Dialog) */}
      {downloadModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s'
        }}>
          <div style={{
            background: 'var(--panel)', border: '1px solid var(--accent-solid)', borderRadius: 16, width: 500,
            boxShadow: '0 25px 60px rgba(0,0,0,0.8)', overflow: 'hidden', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ background: 'var(--panel-2)', padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 900, fontSize: 14, color: 'var(--accent-solid)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🛡️</span> {t('idmPropsTitle')}
              </div>
              <button onClick={() => setDownloadModal(null)} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, fontWeight: 'bold' }}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('idmAddressLabel')}</label>
                <div style={{ fontSize: 11, background: 'var(--panel-2)', padding: '8px 10px', borderRadius: 8, wordBreak: 'break-all', border: '1px solid var(--border)', color: 'var(--text)' }}>
                  {downloadModal.sniff.url}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('idmSaveDirLabel')}</label>
                <div style={{ fontSize: 11, background: 'var(--panel-2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--accent-solid)', fontWeight: 700 }}>
                  {outDir}
                </div>
              </div>

              {downloadModal.formats && downloadModal.formats.length > 0 && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('idmQualitySelectLabel')}</label>
                  <select id="idm-format-select" style={{ width: '100%', background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px', borderRadius: 8, fontSize: 12 }}>
                    {downloadModal.formats.map((f:any)=>(
                      <option key={f.id} value={f.id}>
                        {f.resolution} ({f.ext}) - {f.note || 'Standart'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button
                  onClick={async () => {
                    const sniff = downloadModal.sniff
                    const selFormat = (document.getElementById('idm-format-select') as HTMLSelectElement)?.value
                    setDownloadModal(null)
                    setTab('download')
                    const isGen = /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(sniff.url)
                    if (isGen || sniff.url.endsWith('.pdf')) {
                      await handleHttpDownload({ url: sniff.url, outDir, filename: sniff.filename })
                    } else if (selFormat) {
                      await handleStartDownload({ url: sniff.url, outDir, formatId: selFormat, pageUrl: sniff.pageUrl, title: sniff.filename || 'Video' })
                    } else {
                      await handleDirectDownload({ url: sniff.url, outDir, pageUrl: sniff.pageUrl, title: sniff.filename || 'İndirme' })
                    }
                  }}
                  className="brand-gradient"
                  style={{ flex: 1, border: 0, padding: '12px', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer', boxShadow: '0 6px 20px color-mix(in srgb, var(--accent-solid) 40%, transparent)' }}
                >
                  🚀 {t('idmStartDownload')}
                </button>
                <button
                  onClick={() => setDownloadModal(null)}
                  style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '12px 18px', borderRadius: 10, color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                >
                  {t('idmCancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ExtensionInstallModal
        isOpen={isExtModalOpen}
        onClose={() => setIsExtModalOpen(false)}
        connected={extConnected}
      />

      {/* Pano Bağlantı Algılama Bildirimi (Floating Toast) */}
      {clipboardDetectedUrl && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid #3b82f6',
          borderRadius: 14,
          padding: '14px 18px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(59, 130, 246, 0.4)',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          backdropFilter: 'blur(16px)',
          animation: 'slideUp 0.25s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📋</span> <span>{t('clipboardDetectedTitle')}</span>
            </div>
            <button
              onClick={() => setClipboardDetectedUrl(null)}
              style={{ background: 'transparent', border: 0, color: '#94a3b8', cursor: 'pointer', fontSize: 13, padding: '2px 6px' }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'rgba(0, 0, 0, 0.4)', padding: '6px 8px', borderRadius: 8 }}>
            {clipboardDetectedUrl}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                handleStartDownload({ url: clipboardDetectedUrl, outDir })
                setClipboardDetectedUrl(null)
                setTab('download')
              }}
              className="brand-gradient"
              style={{ border: 0, padding: '8px 14px', borderRadius: 8, color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
            >
              🚀 {t('downloadNowBtn')}
            </button>
            <button
              onClick={() => {
                setTab('download')
                setClipboardDetectedUrl(null)
              }}
              style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 8, color: '#cbd5e1', fontSize: 11, cursor: 'pointer' }}
            >
              {t('inspectBtn')}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
