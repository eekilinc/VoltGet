import { useEffect, useState, useRef } from 'react'
import { useAppSettings } from '../context/AppSettingsContext'
import { useToast } from '../context/ToastContext'
import ExtensionInstallModal from './ExtensionInstallModal'

type Sniff = { url:string, type:string, pageUrl:string, time:string, filename?:string, sniffId?:string }
type Analyzed = { title:string, thumbnail:string, formats:any[], extractor:string } | null

function isDirectChunk(url:string){
  return url.includes('googlevideo.com/videoplayback') || url.includes('manifest.googlevideo.com')
}
function isHlsMaster(url:string){
  return url.includes('master.txt') || url.includes('.m3u8') || (url.includes('/hls/') && (url.includes('cdnimages') || url.includes('playmix')))
}
function isGenericFile(url:string, type?:string){
  return /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(url) ||
    ['zip','rar','7z','pdf','exe','msi','apk','dmg','doc','xls','ppt','torrent','file'].includes((type||'').toLowerCase())
}
function short(u:string){
  try { const url=new URL(u); return url.hostname.replace('www.','') } catch { return u.slice(0,40) }
}

export default function SniffPanel({ outDir, onStartDownload, onDirectDownload, onHttpDownload }:{ outDir:string, onStartDownload:(opts:any)=>Promise<any>, onDirectDownload:(opts:any)=>Promise<any>, onHttpDownload:(opts:any)=>Promise<any>}){
  const { t } = useAppSettings()
  const toast = useToast()
  const [items, setItems] = useState<Sniff[]>([])
  const [expanded, setExpanded] = useState<Record<number,boolean>>({})
  const [analyzing, setAnalyzing] = useState<Record<number,boolean>>({})
  const [infos, setInfos] = useState<Record<number, Analyzed>>({})
  const [downloading, setDownloading] = useState<Record<number,boolean>>({})
  const [filterDomain, setFilterDomain] = useState<string>('all')
  const [scrollToSniffId, setScrollToSniffId] = useState<string|null>(null)
  const [extConnected, setExtConnected] = useState(false)
  const [extModalOpen, setExtModalOpen] = useState(false)
  const itemRefs = useRef<Record<string, HTMLDivElement>>({})

  useEffect(()=>{
    window.api?.getExtensionStatus?.().then((res: any) => {
      if (res) setExtConnected(!!res.connected)
    })
    const onExt = (res: any) => {
      if (res) setExtConnected(!!res.connected)
    }
    window.api?.onExtensionStatus?.(onExt)
  },[])

  useEffect(()=>{
    if (scrollToSniffId) {
      const item = items.find(i => i.sniffId === scrollToSniffId)
      if (item) {
        const idx = items.indexOf(item)
        const ref = itemRefs.current[`item-${idx}`]
        if (ref) {
          ref.scrollIntoView({ behavior: 'smooth', block: 'center' })
          ref.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent-solid) 50%, transparent)'
          ref.style.transition = 'box-shadow 0.3s'
          setTimeout(() => { ref.style.boxShadow = '' }, 2000)
        }
      }
    }
  }, [scrollToSniffId, items])
  const domains = Array.from(new Set(items.map(i=> { try{ return new URL(i.pageUrl).hostname.replace('www.','') } catch{ return 'diğer' } })))

  useEffect(()=>{
    const handler = (d:any)=> {
      setItems(s=> {
        if (s.some(x=> x.pageUrl===d.pageUrl && isDirectChunk(d.url) && isDirectChunk(x.url))) return s
        if (s.some(x=> x.url===d.url)) return s
        return [{ url:d.url, type:d.type||'media', pageUrl:d.pageUrl||'', time:d.time||new Date().toLocaleTimeString(), filename:d.filename, sniffId:d.sniffId }, ...s].slice(0,80)
      })
    }
    const openHandler = async (d:any)=> {
      if (d.sniffId) {
        setScrollToSniffId(d.sniffId)
        setTimeout(() => setScrollToSniffId(null), 3000)
        // IDM tarzı: Bildirime tıklandığında otomatik analiz tetikle ve en üstte göster
        const found = items.find(x => x.sniffId === d.sniffId) || { url: d.url, pageUrl: d.pageUrl, type: 'media' }
        const idx = items.indexOf(found as any)
        if (idx !== -1) {
          if (isGenericFile(found.url, found.type)) {
            quickDownload(idx, found as any)
          } else {
            await analyze(idx, found as any)
          }
        }
      }
    }
    window.api?.onSniffed(handler)
    window.api?.onOpenSniffItem?.(openHandler)
    return () => { window.api?.onOpenSniffItem?.(openHandler) }
  },[items])

  async function quickDownload(idx:number, it:Sniff){
    const generic = isGenericFile(it.url, it.type)
    const target = isDirectChunk(it.url) ? it.pageUrl : it.url
    if (!target) return
    setDownloading(s=> ({...s, [idx]:true}))
    try {
      if (generic) {
        await onHttpDownload({ url: it.url, outDir, filename: it.filename || undefined })
      } else if (isHlsMaster(it.url)) {
        await onDirectDownload({ url: target, outDir, pageUrl: it.pageUrl, filename: it.filename || undefined, title: short(it.pageUrl || target) })
      } else {
        await onStartDownload({ url: target, outDir, pageUrl: it.pageUrl, title: short(it.pageUrl || target) })
      }
    } catch(e:any){ toast.error(String(e?.message || e).slice(0,600), t('downloadFailed')) }
    setDownloading(s=> ({...s, [idx]:false}))
  }

  async function analyze(idx:number, it:Sniff){
    const target = isDirectChunk(it.url) && it.pageUrl ? it.pageUrl : it.url
    setAnalyzing(s=> ({...s, [idx]:true}))
    try{
      const r = await window.api.analyzeUrl(target)
      if (!r.formats || r.formats.length===0) { toast.warning(t('formatNotFound')); return }
      setInfos(s=> ({...s, [idx]: r})); setExpanded(s=> ({...s, [idx]: true}))
    }catch(e:any){ toast.error(String(e?.message || e).slice(0,700), t('analysisError')) }
    setAnalyzing(s=> ({...s, [idx]:false}))
  }

  async function downloadWithFormat(it:Sniff, formatId?:string, asAudio?:boolean){
    const target = isDirectChunk(it.url) && it.pageUrl ? it.pageUrl : it.url
    await onStartDownload({ url: target, outDir, formatId: asAudio?undefined:formatId, asAudio, pageUrl: it.pageUrl, title: infos[items.indexOf(it)]?.title || short(target) })
  }

  return (
    <div style={{ flex:1, padding:18, overflow:'auto', display:'flex', flexDirection:'column', gap:12 }}>
      <div className="card-premium glow-accent" style={{ borderRadius:18, padding:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span className="brand-gradient" style={{ width:34, height:34, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff' }}>🎯</span>
          <div>
            <div style={{ fontWeight:900, fontSize:14 }}>{t('autoSniffer')}</div>
            <div className="text-muted" style={{ fontSize:11 }}>{t('sniffSubtitle')}</div>
          </div>
          <div style={{ flex:1 }}/>
          <span style={{ fontSize:11, background:'var(--panel-2)', border:'1px solid var(--border)', padding:'5px 10px', borderRadius:20 }}>{items.length}</span>
        </div>
        <div style={{ marginTop:12, display:'flex', gap:8 }}>
          <button onClick={()=>setItems([])} style={{ background:'var(--panel-2)', color:'var(--text)', border:'1px solid var(--border)', padding:'7px 10px', borderRadius:10, fontSize:11 }}>{t('clear')}</button>
          <span className="text-muted" style={{ fontSize:11, alignSelf:'center' }}>{t('sniffActiveNote')}</span>
        </div>
      </div>

      {!extConnected && (
        <div
          onClick={()=>setExtModalOpen(true)}
          style={{
            background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.12) 0%, rgba(245, 158, 11, 0.05) 100%)',
            border: '1px solid rgba(234, 179, 8, 0.35)',
            borderRadius: 16,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#eab308' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(234, 179, 8, 0.35)' }}
        >
          <span style={{ fontSize: 24 }}>🧩</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--badge-warning-text)' }}>
              {t('installExtBannerTitle')}
            </div>
            <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
              {t('installExtBannerDesc')}
            </div>
          </div>
          <button
            className="brand-gradient"
            style={{ color: '#fff', border: 0, padding: '7px 14px', borderRadius: 8, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}
          >
            {t('startExtInstall')}
          </button>
        </div>
      )}

      <div className="card-premium" style={{ borderRadius:18, padding:16, flex:1 }}>
        {domains.length>1 && (
          <div style={{ display:'flex', gap:6, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
            <span className="text-muted" style={{ fontSize:11 }}>{t('filterLabel')}</span>
            <button onClick={()=>setFilterDomain('all')} style={{ padding:'5px 9px', borderRadius:8, border:'1px solid '+(filterDomain==='all'?'var(--accent-solid)':'var(--border)'), background:filterDomain==='all'?'color-mix(in srgb, var(--accent-solid) 16%, var(--panel-2))':'var(--panel-2)', color:'var(--text)', fontSize:11 }}>{t('filterAll')} ({items.length})</button>
            {domains.slice(0,5).map(d=>(
              <button key={d} onClick={()=>setFilterDomain(d)} style={{ padding:'5px 9px', borderRadius:8, border:'1px solid '+(filterDomain===d?'var(--accent-solid)':'var(--border)'), background:filterDomain===d?'color-mix(in srgb, var(--accent-solid) 16%, var(--panel-2))':'var(--panel-2)', color:'var(--text)', fontSize:11 }}>{d}</button>
            ))}
          </div>
        )}
        {items.length===0 ? (
          <div className="text-muted" style={{ textAlign:'center', padding:36 }}>
            <div style={{ fontSize:28 }}>📡</div>
            <div style={{ fontSize:12, marginTop:8 }}>{t('noMediaCapturedYet')}<br/><span style={{ fontSize:11 }}>{t('playVideoOrDownload')}</span></div>
          </div>
        ) : (()=>{
          const filtered = filterDomain==='all'? items : items.filter(i=> { try{ return new URL(i.pageUrl).hostname.replace('www.','')===filterDomain } catch{ return false } })
          if (!filtered.length) return <div className="text-muted" style={{ textAlign:'center', padding:20, fontSize:12 }}>{t('noMediaInFilter')}</div>
          return (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {filtered.map((it)=>{
                const origIdx = items.indexOf(it)
                const info = infos[origIdx]
                const chunk = isDirectChunk(it.url)
                const generic = isGenericFile(it.url, it.type)
                return (
                  <div ref={el => { if (el) itemRefs.current[`item-${origIdx}`] = el }} key={origIdx} style={{ background:'var(--panel-2)', border:'1px solid var(--border)', borderRadius:14, padding:12 }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <span style={{ fontSize:11, background: generic?'#422006': chunk?'#422006':'color-mix(in srgb, var(--accent-solid) 20%, transparent)', color: generic||chunk?'#fbbf24':'var(--text)', padding:'2px 7px', borderRadius:8 }}>{generic?'FILE': chunk?'YT':'• '+it.type}</span>
                      <span className="text-muted" style={{ fontSize:11 }}>{it.time}</span>
                      <span className="text-muted" style={{ fontSize:11, flex:1, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{short(it.pageUrl || it.url)}</span>
                      <button onClick={()=> setExpanded(s=> ({...s, [origIdx]: !s[origIdx]}))} style={{ fontSize:10, background:'var(--panel)', color:'var(--text)', border:'1px solid var(--border)', padding:'4px 7px', borderRadius:8 }}>{expanded[origIdx] ? t('hide') : t('detail')}</button>
                    </div>
                    {info ? (
                      <div style={{ display:'flex', gap:10, marginTop:10, alignItems:'center' }}>
                        {info.thumbnail && <img src={info.thumbnail} style={{ width:96, height:54, objectFit:'cover', borderRadius:8, border:'1px solid var(--border)' }} />}
                        <div style={{ flex:1, minWidth:0 }}><div style={{ fontSize:12, fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{info.title}</div><div className="text-muted" style={{ fontSize:11 }}>{info.extractor} • {info.formats.length} {t('formatsReady')}</div></div>
                      </div>
                    ) : (
                      <div className="text-muted" style={{ fontSize:11, marginTop:8, background:'var(--bg)', border:'1px solid var(--border)', padding:'8px 10px', borderRadius:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{it.filename || it.url.slice(0,90)}</div>
                    )}
                    {expanded[origIdx] && <div className="text-muted" style={{ fontSize:11, marginTop:6, wordBreak:'break-all', background:'var(--bg)', padding:8, borderRadius:8, border:'1px solid var(--border)' }}>{chunk? it.pageUrl : it.url}</div>}

                    {!info ? (
                      <div style={{ display:'flex', gap:6, marginTop:10 }}>
                        <button onClick={()=> quickDownload(origIdx,it)} disabled={!!downloading[origIdx]} className="brand-gradient" style={{ flex:1, color:'#fff', border:0, padding:'9px', borderRadius:10, fontWeight:900, fontSize:12 }}>{downloading[origIdx] ? t('downloadingState') : t('quickDownloadBtn')}</button>
                        {!generic && !isHlsMaster(it.url) && (
                          <button onClick={()=> analyze(origIdx,it)} disabled={!!analyzing[origIdx]} style={{ flex:1, background:'var(--panel)', color:'var(--text)', border:'1px solid var(--border)', padding:'9px', borderRadius:10, fontWeight:700, fontSize:12 }}>{analyzing[origIdx] ? t('analyzingState') : t('selectQualityBtn')}</button>
                        )}
                      </div>
                    ) : (
                      <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8, background:'var(--bg)', padding:10, borderRadius:12, border:'1px solid var(--border)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontSize:12, fontWeight:800 }}>{t('availableQualities')}</span>
                          <button onClick={()=> setInfos(s=> { const n={...s}; delete n[origIdx]; return n })} style={{ fontSize:11, background:'transparent', color:'var(--text)', border:0, opacity:0.6, cursor:'pointer' }}>✕ {t('closeDialog')}</button>
                        </div>
                        
                        {/* Video Kaliteleri */}
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--accent-solid)', marginTop:4 }}>{t('tabVideo')}</div>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))', gap:6, maxHeight:140, overflow:'auto' }}>
                          {info.formats.filter((f:any)=> !f.isAudioOnly).slice(0,12).map((f:any)=>(
                            <button key={f.id} onClick={()=> downloadWithFormat(it, f.id)} style={{ background:'var(--panel-2)', color:'var(--text)', border:'1px solid var(--border)', padding:'6px 8px', borderRadius:8, fontSize:11, fontWeight:600, textAlign:'left', display:'flex', flexDirection:'column' }}>
                              <span style={{ fontWeight:800 }}>{f.height ? `${f.height}p` : f.ext}</span>
                              <span className="text-muted" style={{ fontSize:9 }}>{f.ext} {f.fps ? `• ${f.fps}fps` : ''}</span>
                            </button>
                          ))}
                        </div>

                        {/* Ses Kaliteleri */}
                        <div style={{ fontSize:11, fontWeight:700, color:'#fbbf24', marginTop:4 }}>{t('audioGroup')}</div>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))', gap:6, maxHeight:100, overflow:'auto' }}>
                          <button onClick={()=> downloadWithFormat(it, undefined, true)} style={{ background:'#422006', color:'#fbbf24', border:'1px solid #78350f', padding:'6px 8px', borderRadius:8, fontSize:11, fontWeight:800, textAlign:'left' }}>
                            <span>{t('mp3Auto')}</span>
                            <span style={{ display:'block', fontSize:9, opacity:0.8 }}>{t('bestQuality')}</span>
                          </button>
                          {info.formats.filter((f:any)=> f.isAudioOnly).slice(0,6).map((f:any)=>(
                            <button key={f.id} onClick={()=> downloadWithFormat(it, f.id)} style={{ background:'var(--panel-2)', color:'var(--text)', border:'1px solid var(--border)', padding:'6px 8px', borderRadius:8, fontSize:11, fontWeight:600, textAlign:'left', display:'flex', flexDirection:'column' }}>
                              <span style={{ fontWeight:800 }}>{f.ext.toUpperCase()}</span>
                              <span className="text-muted" style={{ fontSize:9 }}>{f.tbr ? `${Math.round(f.tbr)}kbps` : t('audioStream')}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
      <ExtensionInstallModal
        isOpen={extModalOpen}
        onClose={()=>setExtModalOpen(false)}
        connected={extConnected}
      />
    </div>
  )
}
