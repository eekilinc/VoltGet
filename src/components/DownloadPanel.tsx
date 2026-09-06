import { useState } from 'react'
import { useAppSettings } from '../context/AppSettingsContext'

type Format = { id:string, ext:string, resolution:string, height:number, filesize:number, tbr:number, note:string, isAudioOnly?:boolean }
type Info = { title:string, thumbnail:string, duration:number, uploader:string, extractor:string, formats:Format[] }

export default function DownloadPanel({ outDir, onStartDownload }:{ outDir:string, onStartDownload:(opts:any)=>Promise<any>}){
  const { t } = useAppSettings()
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState<Info|null>(null)
  const [selected, setSelected] = useState<string>('')
  const [asAudio, setAsAudio] = useState(false)
  const [formatTab, setFormatTab] = useState<'video'|'audio'>('video')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function analyze(){
    if (!(window as any).api) { setError('window.api yok'); return }
    setError(''); setInfo(null); setLoading(true)
    try{
      const r = await window.api.analyzeUrl(url)
      setInfo(r)
      const bestMp4 = r.formats.find((f:Format)=> !f.isAudioOnly && f.height>0) || r.formats[0]
      setSelected(bestMp4?.id || '')
      setAsAudio(false)
    }catch(e:any){ setError(String(e?.message || e).slice(0,800)) }
    setLoading(false)
  }

  async function start(){
    if(!url) return
    const chosenFormat = info?.formats.find(f => f.id === selected)
    await onStartDownload({ url, formatId: asAudio? undefined : selected, outDir, asAudio, isAudioOnly: chosenFormat?.isAudioOnly, title: info?.title })
  }

  return (
    <div style={{ flex:1, padding:18, overflow:'auto', display:'flex', flexDirection:'column', gap:14 }}>
      <div className="card-premium glow-accent" style={{ borderRadius:18, padding:18 }}>
        <div style={{ fontWeight:900, fontSize:14, marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
          <span className="brand-gradient" style={{ width:30, height:30, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff' }}>🔗</span>
          {t('pasteLink')}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://youtube.com / tiktok / instagram / direct file url..."
            onKeyDown={e=> e.key==='Enter' && analyze()}
            style={{ flex:1, padding:'13px 14px', borderRadius:12 }} />
          <button onClick={analyze} disabled={!url||loading} className="brand-gradient"
            style={{ color:'#fff', border:0, padding:'0 18px', borderRadius:12, fontWeight:800, minWidth:120 }}>
            {loading? t('analyzing') : t('analyze')}</button>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:12, alignItems:'center' }}>
          <div className="text-muted" style={{ flex:1, fontSize:12, background:'var(--panel-2)', border:'1px solid var(--border)', padding:'8px 10px', borderRadius:10, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📂 {outDir}</div>
          <label style={{ display:'flex', gap:6, alignItems:'center', background:'var(--panel-2)', border:'1px solid var(--border)', padding:'8px 10px', borderRadius:10, fontSize:12, cursor:'pointer' }}>
            <input type="checkbox" checked={asAudio} onChange={e=>setAsAudio(e.target.checked)} /> 🎵 {t('mp3')}
          </label>
        </div>
        {error && <div style={{ marginTop:10, background:'#7f1d1d', border:'1px solid #dc2626', color:'#fff', padding:10, borderRadius:10, fontSize:12, whiteSpace:'pre-wrap' }}>{error}</div>}
        <button onClick={start} disabled={!url} className="brand-gradient"
          style={{ marginTop:12, width:'100%', color:'#fff', border:0, padding:'13px', borderRadius:12, fontWeight:900, fontSize:14 }}>
          ⬇️ {asAudio ? t('downloadAsMp3') : info? t('selectedQuality') : t('quickDownload')}</button>
        <div className="text-muted" style={{ marginTop:8, fontSize:11, textAlign:'center' }}>YouTube, Instagram, TikTok, X, Facebook, SoundCloud • PDF/ZIP/EXE • HLS/DASH</div>
      </div>

      {info && (
        <div className="card-premium" style={{ borderRadius:18, padding:16 }}>
          <div style={{ display:'flex', gap:12 }}>
            {info.thumbnail && <img src={info.thumbnail} style={{ width:180, height:102, objectFit:'cover', borderRadius:12, border:'1px solid var(--border)' }} />}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:800, fontSize:14, lineHeight:1.35 }}>{info.title}</div>
              <div className="text-muted" style={{ fontSize:12, marginTop:4 }}>{info.uploader} • {info.extractor} • {Math.floor((info.duration||0)/60)}:{String((info.duration||0)%60).padStart(2,'0')}</div>
              <div style={{ fontSize:11, background:'var(--panel-2)', display:'inline-block', padding:'3px 8px', borderRadius:8, marginTop:8, border:'1px solid var(--border)' }}>{info.formats.length} format</div>
            </div>
          </div>
          {!asAudio && (
            <div style={{ marginTop:16 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontWeight:800, fontSize:13 }}>Kalite & Format Seçimi</div>
                <div style={{ display:'flex', gap:6, background:'var(--panel-2)', padding:3, borderRadius:10, border:'1px solid var(--border)' }}>
                  <button onClick={()=>setFormatTab('video')} style={{ padding:'4px 10px', borderRadius:8, border:0, background: formatTab==='video'?'var(--accent-solid)':'transparent', color: formatTab==='video'?'#fff':'var(--text)', fontSize:11, fontWeight:700, cursor:'pointer' }}>🎬 Video</button>
                  <button onClick={()=>setFormatTab('audio')} style={{ padding:'4px 10px', borderRadius:8, border:0, background: formatTab==='audio'?'#ca8a04':'transparent', color: formatTab==='audio'?'#fff':'var(--text)', fontSize:11, fontWeight:700, cursor:'pointer' }}>🎵 Sadece Ses</button>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:8, maxHeight:260, overflow:'auto', paddingRight:2 }}>
                {info.formats
                  .filter(f => formatTab === 'video' ? !f.isAudioOnly : f.isAudioOnly)
                  .slice(0, 16)
                  .map(f => {
                    const isSel = selected === f.id
                    const sizeMB = f.filesize ? (f.filesize / (1024 * 1024)).toFixed(1) + ' MB' : ''
                    return (
                      <label key={f.id} style={{
                        display:'flex', gap:10, alignItems:'center',
                        background: isSel ? 'color-mix(in srgb, var(--accent-solid) 16%, var(--panel-2))' : 'var(--panel-2)',
                        border: '1px solid ' + (isSel ? 'var(--accent-solid)' : 'var(--border)'),
                        padding:'10px 12px', borderRadius:12, cursor:'pointer', transition:'all 0.15s'
                      }}>
                        <input type="radio" checked={isSel} onChange={() => setSelected(f.id)} style={{ accentColor:'var(--accent-solid)' }} />
                        <span style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:800, display:'flex', justifyContent:'space-between' }}>
                            <span>{f.height ? `${f.height}p` : f.ext.toUpperCase()}</span>
                            <span className="text-muted" style={{ fontWeight:400, fontSize:10 }}>{f.ext}</span>
                          </div>
                          <div className="text-muted" style={{ fontSize:10, marginTop:2, display:'flex', justifyContent:'space-between' }}>
                            <span>{f.resolution !== 'Audio Only' ? f.resolution : (f.tbr ? `${Math.round(f.tbr)} kbps` : 'Audio')}</span>
                            {sizeMB && <span>{sizeMB}</span>}
                          </div>
                        </span>
                      </label>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
