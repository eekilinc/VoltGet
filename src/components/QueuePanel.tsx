import { useAppSettings } from '../context/AppSettingsContext'

type Job = { id:string, url:string, title:string, percent:number, speed:string, eta:string, total:string, status:'downloading'|'done'|'error'|'queued'|'paused', log:string, thumbnail?:string, opts?:any }

export default function QueuePanel({ jobs, onCancel, onRetry, onPause, onResume, onOpenFolder, onClear, compact }: {
  jobs: Job[], onCancel:(id:string)=>void, onRetry?:(job:Job)=>void, onPause?:(id:string)=>void, onResume?:(job:Job)=>void, onOpenFolder:()=>void, onClear?:()=>void, compact?:boolean
}){
  const { t } = useAppSettings()
  const downloading = jobs.filter(j=> j.status==='downloading').length
  const done = jobs.filter(j=> j.status==='done').length
  const label = (s:Job['status']) => s==='downloading'? t('statusDownloading') : s==='queued'? t('statusQueued') : s==='done'? t('statusDone') : s==='paused'? t('statusPaused') : t('statusError')

  return (
    <div style={{
      width: compact? '100%' : '360px', minWidth: compact? undefined : '320px',
      background:'var(--panel)', borderLeft: compact? 'none' : '1px solid var(--border)',
      borderTop: compact? '1px solid var(--border)' : 'none',
      display:'flex', flexDirection:'column', overflow:'hidden'
    }}>
      <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ fontWeight:800, fontSize:13 }}>📋 {t('queue')}</div>
        <div style={{ fontSize:11, background:'var(--panel-2)', padding:'2px 8px', borderRadius:20, border:'1px solid var(--border)' }}>
          {jobs.length} • ⬇️ {downloading} • ✓ {done}
        </div>
        <div style={{ flex:1 }}/>
        {jobs.some(j=> j.status==='done'||j.status==='error') && <button onClick={onClear} style={{ background:'#7f1d1d', color:'#fff', border:0, padding:'6px 8px', borderRadius:8, fontSize:11 }}>🗑️ {t('clear')}</button>}
        <button onClick={onOpenFolder} style={{ background:'var(--panel-2)', color:'var(--text)', border:'1px solid var(--border)', padding:'6px 8px', borderRadius:8, fontSize:11 }}>📂 {t('open')}</button>
      </div>

      <div style={{ flex:1, overflow:'auto', padding:12, display:'flex', flexDirection:'column', gap:10, background:'var(--bg-2)' }}>
        {jobs.length===0 && (
          <div className="text-muted" style={{ textAlign:'center', padding:28, fontSize:12 }}>
            <div style={{ fontSize:24, marginBottom:8 }}>⬇️</div>
            {t('noDownloadsYet')}<br/>
            <span style={{ fontSize:11 }}>{t('pasteOrCapture')}</span>
          </div>
        )}
        {jobs.map(j=>(
          <div key={j.id} className="card-premium" style={{ borderRadius:14, padding:12 }}>
            <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{j.title}</div>
                <div className="text-muted" style={{ fontSize:11, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{j.url}</div>
              </div>
              <span style={{
                fontSize:10, padding:'3px 7px', borderRadius:8, fontWeight:700,
                background: j.status==='done'?'#14532d': j.status==='error'?'#7f1d1d': j.status==='queued'?'#422006': j.status==='paused'?'#1e293b':'color-mix(in srgb, var(--accent-solid) 22%, transparent)',
                color: j.status==='done'?'#86efac': j.status==='error'?'#fca5a5': j.status==='queued'?'#fbbf24': j.status==='paused'?'#93c5fd':'var(--text)'
              }}>{label(j.status)}</span>
            </div>
            <div style={{ height:8, background:'var(--bg)', borderRadius:10, marginTop:10, overflow:'hidden', border:'1px solid var(--border)', position:'relative' }}>
              <div style={{
                width:`${j.percent}%`, height:'100%',
                background: j.status==='done'?'linear-gradient(90deg,#16a34a,#22c55e)': j.status==='error'?'linear-gradient(90deg,#7f1d1d,#dc2626)':'linear-gradient(90deg,var(--accent-from),var(--accent-to))',
                transition:'width 0.4s ease'
              }}/>
            </div>
            <div className="text-muted" style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginTop:6 }}>
              <span>{j.percent.toFixed(1)}% {j.total? `• ${j.total}`:''} • {j.speed} {j.eta && j.eta!=='-' ? `• ${j.eta}`:''}</span>
            </div>
            <div className="text-muted" style={{ fontSize:10, marginTop:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{j.log}</div>
            <div style={{ display:'flex', gap:6, marginTop:10 }}>
              {(j.status==='downloading'||j.status==='queued') && <button onClick={()=>onPause?.(j.id)} style={{ background:'#422006', color:'#fbbf24', border:0, padding:'6px 8px', borderRadius:8, fontSize:11 }}>⏸ {t('pause')}</button>}
              {(j.status==='downloading'||j.status==='queued'||j.status==='paused') && <button onClick={()=>onCancel(j.id)} style={{ background:'#7f1d1d', color:'#fff', border:0, padding:'6px 8px', borderRadius:8, fontSize:11 }}>{t('cancel')}</button>}
              {j.status==='paused' && <button onClick={()=>onResume?.(j)} className="brand-gradient" style={{ color:'#fff', border:0, padding:'6px 8px', borderRadius:8, fontSize:11 }}>▶ {t('resume')}</button>}
              {j.status==='done' && <button onClick={onOpenFolder} style={{ background:'#14532d', color:'#fff', border:0, padding:'6px 8px', borderRadius:8, fontSize:11 }}>{t('openFolder')}</button>}
              {j.status==='error' && <button onClick={()=>onRetry?.(j)} className="brand-gradient" style={{ color:'#fff', border:0, padding:'6px 8px', borderRadius:8, fontSize:11 }}>🔄 {t('retry')}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
