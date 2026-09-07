import { useState } from 'react'
import { useAppSettings } from '../context/AppSettingsContext'
import { useToast } from '../context/ToastContext'

type Format = { id:string, ext:string, resolution:string, height:number, filesize:number, tbr:number, note:string, isAudioOnly?:boolean }
type Info = { title:string, thumbnail:string, duration:number, uploader:string, extractor:string, formats:Format[] }

export default function DownloadPanel({ outDir, onStartDownload }:{ outDir:string, onStartDownload:(opts:any)=>Promise<any>}){
  const { t } = useAppSettings()
  const toast = useToast()
  const [panelMode, setPanelMode] = useState<'single'|'batch'>('single')
  const [url, setUrl] = useState('')
  const [batchText, setBatchText] = useState('')
  const [info, setInfo] = useState<Info|null>(null)
  const [selected, setSelected] = useState<string>('')
  const [asAudio, setAsAudio] = useState(false)
  const [formatTab, setFormatTab] = useState<'video'|'audio'>('video')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [batchAdding, setBatchAdding] = useState(false)

  async function analyze(targetUrl?: string){
    const u = (targetUrl || url).trim()
    if (!u) return
    if (!(window as any).api) { setError('window.api yok'); return }
    setError(''); setInfo(null); setLoading(true)
    try{
      const r = await window.api.analyzeUrl(u)
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

  async function handlePasteFromClipboard(){
    try {
      const text = await window.api?.readClipboard?.()
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        setUrl(text)
        analyze(text)
      } else if (text) {
        setUrl(text)
      }
    } catch {}
  }

  // Sürükle ve Bırak Olayları
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const text = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list') || ''
    if (text) {
      const match = text.match(/https?:\/\/[^\s"<>]+/i)
      if (match) {
        setUrl(match[0])
        setPanelMode('single')
        analyze(match[0])
      } else {
        setBatchText(text)
        setPanelMode('batch')
      }
    }
  }

  // Toplu link ayıklayıcı
  const extractedBatchUrls = Array.from(new Set(batchText.match(/https?:\/\/[^\s"<>]+/gi) || []))

  const handleStartBatch = async () => {
    if (!extractedBatchUrls.length || batchAdding) return
    setBatchAdding(true)
    let addedCount = 0
    for (const link of extractedBatchUrls) {
      try {
        if (window.api?.queueDownload) {
          await window.api.queueDownload({ url: link, outDir, asAudio })
        } else {
          await onStartDownload({ url: link, outDir, asAudio })
        }
        addedCount++
      } catch (e) {}
    }
    setBatchAdding(false)
    toast.success(`${addedCount} adet indirme kuyruğa başarıyla eklendi!`, 'Toplu İndirme')
    setBatchText('')
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        flex: 1,
        padding: 18,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        position: 'relative'
      }}
    >
      {/* Sürükle & Bırak Parlama Katmanı */}
      {isDragOver && (
        <div style={{
          position: 'absolute',
          inset: 12,
          borderRadius: 20,
          background: 'rgba(37, 99, 235, 0.25)',
          backdropFilter: 'blur(8px)',
          border: '2px dashed #3b82f6',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          pointerEvents: 'none',
          boxShadow: '0 0 40px rgba(59, 130, 246, 0.6)'
        }}>
          <span style={{ fontSize: 48, animation: 'bounce 0.8s infinite' }}>🎯</span>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#60a5fa' }}>{t('dropLinkHere')}</div>
          <div style={{ fontSize: 12, color: '#cbd5e1' }}>{t('dropLinkDesc')}</div>
        </div>
      )}

      {/* Üst Mod Seçimi: Tekli vs Toplu Ayıklayıcı */}
      <div style={{ display: 'flex', gap: 6, background: 'var(--panel-2)', padding: 4, borderRadius: 14, border: '1px solid var(--border)' }}>
        <button
          onClick={() => setPanelMode('single')}
          style={{
            flex: 1,
            padding: '8px 14px',
            borderRadius: 10,
            border: 0,
            background: panelMode === 'single' ? 'var(--accent-solid)' : 'transparent',
            color: panelMode === 'single' ? '#fff' : 'var(--text)',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <span>⚡</span>
          <span>{t('singleLinkDownload')}</span>
        </button>
        <button
          onClick={() => setPanelMode('batch')}
          style={{
            flex: 1,
            padding: '8px 14px',
            borderRadius: 10,
            border: 0,
            background: panelMode === 'batch' ? 'var(--accent-solid)' : 'transparent',
            color: panelMode === 'batch' ? '#fff' : 'var(--text)',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6
          }}
        >
          <span>📦</span>
          <span>{t('batchExtractor')}</span>
          {extractedBatchUrls.length > 0 && (
            <span style={{ background: '#10b981', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 900 }}>
              {extractedBatchUrls.length}
            </span>
          )}
        </button>
      </div>

      {panelMode === 'single' ? (
        <div className="card-premium glow-accent" style={{ borderRadius: 18, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="brand-gradient" style={{ width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>🔗</span>
              {t('pasteLink')}
            </div>
            <button
              onClick={handlePasteFromClipboard}
              title={t('pasteFromClipboardTooltip')}
              style={{
                background: 'color-mix(in srgb, var(--accent-solid) 20%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent-solid) 40%, transparent)',
                color: 'var(--accent-solid)',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <span>📋</span> <span>{t('pasteFromClipboard')}</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder={t('urlPlaceholder')}
              onKeyDown={e => e.key === 'Enter' && analyze()}
              style={{ flex: 1, padding: '13px 14px', borderRadius: 12 }}
            />
            <button
              onClick={() => analyze()}
              disabled={!url || loading}
              className="brand-gradient"
              style={{ color: '#fff', border: 0, padding: '0 18px', borderRadius: 12, fontWeight: 800, minWidth: 120 }}
            >
              {loading ? '🔄 ' + t('scanningState') : '🔍 ' + t('analyzeBtn')}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <div className="text-muted" style={{ flex: 1, fontSize: 12, background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '8px 10px', borderRadius: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📂 {outDir}
            </div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '8px 10px', borderRadius: 10, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={asAudio} onChange={e => setAsAudio(e.target.checked)} /> 🎵 {t('mp3')}
            </label>
          </div>

          {error && <div style={{ marginTop: 10, background: '#7f1d1d', border: '1px solid #dc2626', color: '#fff', padding: 10, borderRadius: 10, fontSize: 12, whiteSpace: 'pre-wrap' }}>{error}</div>}

          <button
            onClick={start}
            disabled={!url}
            className="brand-gradient"
            style={{ marginTop: 12, width: '100%', color: '#fff', border: 0, padding: '13px', borderRadius: 12, fontWeight: 900, fontSize: 14 }}
          >
            🚀 {asAudio ? t('downloadAsMp3') : info ? t('selectedQuality') : t('quickDownload')}
          </button>
          <div className="text-muted" style={{ marginTop: 8, fontSize: 11, textAlign: 'center' }}>
            {t('dragDropNotice')}
          </div>
        </div>
      ) : (
        <div className="card-premium glow-accent" style={{ borderRadius: 18, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="brand-gradient" style={{ width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>📦</span>
              {t('batchExtractor')}
            </div>
            <span style={{ fontSize: 11, background: 'var(--panel-2)', padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)' }}>
              {extractedBatchUrls.length} {t('batchFoundCount')}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
            {t('batchInstruction')}
          </div>
          <textarea
            value={batchText}
            onChange={e => setBatchText(e.target.value)}
            placeholder={t('batchPlaceholder')}
            rows={6}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 14px',
              borderRadius: 12,
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: 12,
              fontFamily: 'monospace',
              outline: 'none',
              resize: 'vertical'
            }}
          />

          {extractedBatchUrls.length > 0 && (
            <div style={{ marginTop: 10, maxHeight: 140, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {extractedBatchUrls.map((u, i) => (
                <div key={i} style={{ fontSize: 11, background: 'rgba(59, 130, 246, 0.08)', padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(59, 130, 246, 0.2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  ✓ {u}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'var(--panel-2)', border: '1px solid var(--border)', padding: '8px 12px', borderRadius: 10, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={asAudio} onChange={e => setAsAudio(e.target.checked)} /> 🎵 {t('allToMp3')}
            </label>
            <button
              onClick={handleStartBatch}
              disabled={!extractedBatchUrls.length || batchAdding}
              className="brand-gradient"
              style={{ flex: 1, color: '#fff', border: 0, padding: '12px', borderRadius: 12, fontWeight: 900, fontSize: 13, cursor: 'pointer' }}
            >
              {batchAdding ? t('addingState') : `🚀 ${extractedBatchUrls.length} ${t('addBatchToQueue')}`}
            </button>
          </div>
        </div>
      )}

      {info && panelMode === 'single' && (
        <div className="card-premium" style={{ borderRadius: 18, padding: 16 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {info.thumbnail && <img src={info.thumbnail} style={{ width: 180, height: 102, objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)' }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.35 }}>{info.title}</div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{info.uploader} • {info.extractor} • {Math.floor((info.duration||0)/60)}:{String((info.duration||0)%60).padStart(2,'0')}</div>
              <div style={{ fontSize: 11, background: 'var(--panel-2)', display: 'inline-block', padding: '3px 8px', borderRadius: 8, marginTop: 8, border: '1px solid var(--border)' }}>{info.formats.length} {t('formatsReady')}</div>
            </div>
          </div>
          {!asAudio && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{t('qualityAndFormatSelection')}</div>
                <div style={{ display: 'flex', gap: 6, background: 'var(--panel-2)', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
                  <button onClick={() => setFormatTab('video')} style={{ padding: '4px 10px', borderRadius: 8, border: 0, background: formatTab === 'video' ? 'var(--accent-solid)' : 'transparent', color: formatTab === 'video' ? '#fff' : 'var(--text)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t('tabVideo')}</button>
                  <button onClick={() => setFormatTab('audio')} style={{ padding: '4px 10px', borderRadius: 8, border: 0, background: formatTab === 'audio' ? '#ca8a04' : 'transparent', color: formatTab === 'audio' ? '#fff' : 'var(--text)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{t('tabAudioOnly')}</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, maxHeight: 260, overflow: 'auto', paddingRight: 2 }}>
                {info.formats
                  .filter(f => formatTab === 'video' ? !f.isAudioOnly : f.isAudioOnly)
                  .slice(0, 16)
                  .map(f => {
                    const isSel = selected === f.id
                    const sizeMB = f.filesize ? (f.filesize / (1024 * 1024)).toFixed(1) + ' MB' : ''
                    return (
                      <label key={f.id} style={{
                        display: 'flex', gap: 10, alignItems: 'center',
                        background: isSel ? 'color-mix(in srgb, var(--accent-solid) 16%, var(--panel-2))' : 'var(--panel-2)',
                        border: '1px solid ' + (isSel ? 'var(--accent-solid)' : 'var(--border)'),
                        padding: '10px 12px', borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s'
                      }}>
                        <input type="radio" checked={isSel} onChange={() => setSelected(f.id)} style={{ accentColor: 'var(--accent-solid)' }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}>
                            <span>{f.height ? `${f.height}p` : f.ext.toUpperCase()}</span>
                            <span className="text-muted" style={{ fontWeight: 400, fontSize: 10 }}>{f.ext}</span>
                          </div>
                          <div className="text-muted" style={{ fontSize: 10, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
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
