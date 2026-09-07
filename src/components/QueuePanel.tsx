import { useState, useEffect } from 'react'
import { useAppSettings } from '../context/AppSettingsContext'

export type Job = {
  id: string
  url: string
  title: string
  percent: number
  speed: string
  eta: string
  total: string
  status: 'downloading' | 'done' | 'error' | 'queued' | 'paused'
  log: string
  thumbnail?: string
  opts?: any
  filePath?: string
  fileName?: string
  deletedFromDisk?: boolean
}

type FilterTab = 'all' | 'downloading' | 'done' | 'paused' | 'error'

export default function QueuePanel({
  jobs,
  onCancel,
  onRetry,
  onPause,
  onResume,
  onPauseAll,
  onResumeAll,
  onOpenFolder,
  onOpenFile,
  onShowInFolder,
  onRemoveJob,
  onDeleteJob,
  onClear,
  compact
}: {
  jobs: Job[]
  onCancel: (id: string) => void
  onRetry?: (job: Job) => void
  onPause?: (id: string) => void
  onResume?: (job: Job) => void
  onPauseAll?: () => void
  onResumeAll?: () => void
  onOpenFolder: () => void
  onOpenFile?: (filePath: string) => void
  onShowInFolder?: (filePath: string) => void
  onRemoveJob?: (id: string) => void
  onDeleteJob?: (job: Job, deleteFromDisk: boolean) => void
  onClear?: () => void
  compact?: boolean
}) {
  const { t } = useAppSettings()
  const [confirmDeleteJob, setConfirmDeleteJob] = useState<Job | null>(null)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [postAction, setPostAction] = useState<'none' | 'shutdown' | 'sleep' | 'quit'>('none')

  useEffect(() => {
    const api = (window as any).api
    if (api?.getConfig) {
      api.getConfig().then((cfg: any) => {
        if (cfg?.postDownloadAction) {
          setPostAction(cfg.postDownloadAction)
        }
      }).catch(() => {})
    }
  }, [])

  const handlePostActionChange = async (val: 'none' | 'shutdown' | 'sleep' | 'quit') => {
    setPostAction(val)
    const api = (window as any).api
    if (api?.setPostDownloadAction) {
      await api.setPostDownloadAction(val).catch(() => {})
    }
  }

  const downloadingCount = jobs.filter(j => j.status === 'downloading' || j.status === 'queued').length
  const doneCount = jobs.filter(j => j.status === 'done' && !j.deletedFromDisk).length
  const pausedCount = jobs.filter(j => j.status === 'paused').length
  const errorCount = jobs.filter(j => j.status === 'error').length
  const deletedFromDiskCount = jobs.filter(j => j.status === 'done' && j.deletedFromDisk).length

  const filteredJobs = jobs.filter(j => {
    if (filterTab === 'downloading' && j.status !== 'downloading' && j.status !== 'queued') return false
    if (filterTab === 'done' && j.status !== 'done') return false
    if (filterTab === 'paused' && j.status !== 'paused') return false
    if (filterTab === 'error' && j.status !== 'error') return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchTitle = j.title?.toLowerCase().includes(q)
      const matchUrl = j.url?.toLowerCase().includes(q)
      const matchFile = j.fileName?.toLowerCase().includes(q)
      if (!matchTitle && !matchUrl && !matchFile) return false
    }
    return true
  })

  const label = (j: Job) => {
    if (j.status === 'done') {
      if (j.deletedFromDisk) return '⚠️ ' + t('statusDeletedFromDisk')
      return '✓ ' + t('statusDone')
    }
    if (j.status === 'downloading') return t('statusDownloading')
    if (j.status === 'queued') return t('statusQueued')
    if (j.status === 'paused') return t('statusPaused')
    return t('statusError')
  }

  const isMultiSegment = (j: Job) => {
    return !!(j.opts?.isHttp || j.log?.includes('parça') || j.log?.includes('parts') || /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf)($|\?)/i.test(j.url || j.fileName || ''))
  }

  return (
    <div style={{
      width: compact ? '100%' : '400px',
      minWidth: compact ? undefined : '360px',
      background: 'var(--panel)',
      borderLeft: compact ? 'none' : '1px solid var(--border)',
      borderTop: compact ? '1px solid var(--border)' : 'none',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Üst Başlık ve Hızlı Eylemler */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📋</span>
            <span>{t('queue')}</span>
          </div>
          <div style={{ fontSize: 11, background: 'var(--panel-2)', padding: '2px 8px', borderRadius: 20, border: '1px solid var(--border)', fontWeight: 600 }}>
            {jobs.length} {t('downloads')}
            {deletedFromDiskCount > 0 && <span style={{ color: 'var(--badge-danger-text)', marginLeft: 4 }}>• ⚠️ {deletedFromDiskCount}</span>}
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={onOpenFolder} title={t('openDownloadFolder')} style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '5px 8px', borderRadius: 8, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>📂</span>
            <span>{t('open')}</span>
          </button>
        </div>

        {/* Toplu Kontrol Butonları (Pause All / Resume All / Clear) */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => onPauseAll?.()}
            disabled={downloadingCount === 0}
            title={t('pauseAll')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: downloadingCount > 0 ? 'var(--badge-warning-bg)' : 'var(--panel-2)',
              color: downloadingCount > 0 ? 'var(--badge-warning-text)' : 'var(--text-muted)',
              border: '1px solid ' + (downloadingCount > 0 ? 'var(--badge-warning-border)' : 'var(--border)'),
              padding: '6px 8px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              cursor: downloadingCount > 0 ? 'pointer' : 'default',
              opacity: downloadingCount > 0 ? 1 : 0.6
            }}
          >
            <span>⏸️</span>
            <span>{t('pauseAll')}</span>
          </button>

          <button
            onClick={() => onResumeAll?.()}
            disabled={pausedCount === 0}
            title={t('resumeAll')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: pausedCount > 0 ? 'var(--badge-info-bg)' : 'var(--panel-2)',
              color: pausedCount > 0 ? 'var(--badge-info-text)' : 'var(--text-muted)',
              border: '1px solid ' + (pausedCount > 0 ? 'var(--badge-info-border)' : 'var(--border)'),
              padding: '6px 8px',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 700,
              cursor: pausedCount > 0 ? 'pointer' : 'default',
              opacity: pausedCount > 0 ? 1 : 0.6
            }}
          >
            <span>▶️</span>
            <span>{t('resumeAll')}</span>
          </button>

          {jobs.some(j => j.status === 'done' || j.status === 'error') && (
            <button
              onClick={onClear}
              title={t('clearFinishedDesc')}
              style={{
                background: 'var(--badge-danger-bg)',
                color: 'var(--badge-danger-text)',
                border: '1px solid var(--badge-danger-border)',
                padding: '6px 8px',
                borderRadius: 8,
                fontSize: 11,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <span>🗑️</span>
              <span>{t('clear')}</span>
            </button>
          )}
        </div>

        {/* Anlık Arama Kutusu */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: 8, fontSize: 11, color: 'var(--text-muted)' }}>🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('searchDownloads')}
            style={{
              width: '100%',
              padding: '6px 26px 6px 26px',
              borderRadius: 8,
              fontSize: 11,
              background: 'var(--bg)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              outline: 'none'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 6,
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: 12,
                cursor: 'pointer',
                padding: 2
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtre Sekmeleri (Tümü, İndirilen, Biten, Duraklatılan, Hata) */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
          {[
            { id: 'all' as FilterTab, label: t('filterAll'), count: jobs.length },
            { id: 'downloading' as FilterTab, label: t('filterDownloading'), count: downloadingCount },
            { id: 'done' as FilterTab, label: t('filterDone'), count: doneCount },
            { id: 'paused' as FilterTab, label: t('filterPaused'), count: pausedCount },
            { id: 'error' as FilterTab, label: t('filterError'), count: errorCount }
          ].map(tab => {
            const active = filterTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: active ? 800 : 600,
                  whiteSpace: 'nowrap',
                  background: active ? 'color-mix(in srgb, var(--accent-solid) 16%, var(--panel-2))' : 'var(--panel-2)',
                  color: active ? 'var(--accent-solid)' : 'var(--text-muted)',
                  border: '1px solid ' + (active ? 'var(--accent-solid)' : 'var(--border)'),
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <span>{tab.label}</span>
                <span style={{
                  fontSize: 9,
                  background: active ? 'var(--accent-solid)' : 'var(--border)',
                  color: active ? '#fff' : 'var(--text)',
                  padding: '1px 5px',
                  borderRadius: 10
                }}>
                  {tab.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* İndirmeler Listesi */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-2)' }}>
        {filteredJobs.length === 0 && (
          <div className="text-muted" style={{ textAlign: 'center', padding: 28, fontSize: 12 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⬇️</div>
            {jobs.length === 0 ? (
              <>
                {t('noDownloadsYet')}<br />
                <span style={{ fontSize: 11 }}>{t('pasteOrCapture')}</span>
              </>
            ) : (
              <span>{t('noFilteredResults')}</span>
            )}
          </div>
        )}

        {filteredJobs.map(j => (
          <div key={j.id} className="card-premium" style={{ borderRadius: 14, padding: 12, border: j.deletedFromDisk ? '1px solid rgba(239, 68, 68, 0.35)' : undefined }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: j.deletedFromDisk ? 'var(--text-muted)' : 'var(--text)', textDecoration: j.deletedFromDisk ? 'line-through' : 'none' }}>
                    {j.title}
                  </div>
                  {isMultiSegment(j) && (
                    <span title={t('segmentsBadge')} style={{
                      flexShrink: 0,
                      fontSize: 9,
                      padding: '1px 5px',
                      borderRadius: 6,
                      background: 'rgba(59, 130, 246, 0.15)',
                      color: '#60a5fa',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      fontWeight: 800
                    }}>
                      ⚡ 8P
                    </span>
                  )}
                </div>
                <div className="text-muted" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {j.url}
                </div>
              </div>

              {/* Durum Rozeti */}
              <span style={{
                fontSize: 10,
                padding: '3px 7px',
                borderRadius: 8,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                background: j.status === 'done'
                  ? (j.deletedFromDisk ? 'var(--badge-danger-bg)' : 'var(--badge-success-bg)')
                  : j.status === 'error' ? 'var(--badge-danger-bg)'
                  : j.status === 'queued' ? 'var(--badge-warning-bg)'
                  : j.status === 'paused' ? 'var(--badge-info-bg)'
                  : 'color-mix(in srgb, var(--accent-solid) 16%, var(--panel-2))',
                color: j.status === 'done'
                  ? (j.deletedFromDisk ? 'var(--badge-danger-text)' : 'var(--badge-success-text)')
                  : j.status === 'error' ? 'var(--badge-danger-text)'
                  : j.status === 'queued' ? 'var(--badge-warning-text)'
                  : j.status === 'paused' ? 'var(--badge-info-text)'
                  : 'var(--accent-solid)',
                border: '1px solid ' + (j.status === 'done'
                  ? (j.deletedFromDisk ? 'var(--badge-danger-border)' : 'var(--badge-success-border)')
                  : j.status === 'error' ? 'var(--badge-danger-border)'
                  : j.status === 'queued' ? 'var(--badge-warning-border)'
                  : j.status === 'paused' ? 'var(--badge-info-border)'
                  : 'var(--border)')
              }}>
                {label(j)}
              </span>
            </div>

            {/* İlerleme Çubuğu */}
            <div style={{ height: 8, background: 'var(--bg)', borderRadius: 10, marginTop: 10, overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
              <div style={{
                width: `${j.percent}%`,
                height: '100%',
                background: j.status === 'done'
                  ? (j.deletedFromDisk ? 'linear-gradient(90deg,#991b1b,#ef4444)' : 'linear-gradient(90deg,#16a34a,#22c55e)')
                  : j.status === 'error'
                  ? 'linear-gradient(90deg,#7f1d1d,#dc2626)'
                  : 'linear-gradient(90deg,var(--accent-from),var(--accent-to))',
                transition: 'width 0.4s ease'
              }} />
            </div>

            {/* Hız & Süre & Boyut Bilgisi */}
            <div className="text-muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 6 }}>
              <span>{j.percent.toFixed(1)}% {j.total ? `• ${j.total}` : ''} • {j.speed} {j.eta && j.eta !== '-' ? `• ${j.eta}` : ''}</span>
            </div>
            <div className="text-muted" style={{ fontSize: 10, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {j.deletedFromDisk ? `⚠️ ${t('deletedFromDiskMsg')}` : j.log}
            </div>

            {/* Eylem Butonları */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {(j.status === 'downloading' || j.status === 'queued') && (
                <button onClick={() => onPause?.(j.id)} style={{ background: 'var(--badge-warning-bg)', color: 'var(--badge-warning-text)', border: '1px solid var(--badge-warning-border)', padding: '6px 8px', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}>
                  ⏸ {t('pause')}
                </button>
              )}
              {(j.status === 'downloading' || j.status === 'queued' || j.status === 'paused') && (
                <button onClick={() => onCancel(j.id)} style={{ background: 'var(--badge-danger-bg)', color: 'var(--badge-danger-text)', border: '1px solid var(--badge-danger-border)', padding: '6px 8px', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}>
                  {t('cancel')}
                </button>
              )}
              {j.status === 'paused' && (
                <button onClick={() => onResume?.(j)} className="brand-gradient" style={{ color: '#fff', border: 0, padding: '6px 8px', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}>
                  ▶ {t('resume')}
                </button>
              )}

              {/* Tamamlanmış İndirmeler */}
              {j.status === 'done' && !j.deletedFromDisk && (
                <>
                  <button
                    onClick={() => {
                      if (j.filePath) onOpenFile?.(j.filePath)
                      else onOpenFolder()
                    }}
                    className="brand-gradient"
                    style={{ color: '#fff', border: 0, padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  >
                    ⚡ {t('openFile')}
                  </button>
                  <button
                    onClick={() => {
                      if (j.filePath) onShowInFolder?.(j.filePath)
                      else onOpenFolder()
                    }}
                    style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 9px', borderRadius: 8, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                    title={t('showInFolderTooltip')}
                  >
                    📁 {t('showInFolder')}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteJob(j)}
                    style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '6px 8px', borderRadius: 8, fontSize: 11, marginLeft: 'auto', cursor: 'pointer' }}
                    title={t('deleteOrRemoveTitle')}
                  >
                    🗑️
                  </button>
                </>
              )}

              {/* Diskten Silinmiş İndirmeler */}
              {j.status === 'done' && j.deletedFromDisk && (
                <>
                  <button
                    onClick={() => onRetry?.(j)}
                    className="brand-gradient"
                    style={{ color: '#fff', border: 0, padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  >
                    🔄 {t('redownload')}
                  </button>
                  <button
                    onClick={() => onRemoveJob?.(j.id)}
                    style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 9px', borderRadius: 8, fontSize: 11, marginLeft: 'auto', cursor: 'pointer' }}
                  >
                    🗑️ {t('removeFromList')}
                  </button>
                </>
              )}

              {j.status === 'error' && (
                <>
                  <button onClick={() => onRetry?.(j)} className="brand-gradient" style={{ color: '#fff', border: 0, padding: '6px 8px', borderRadius: 8, fontSize: 11, cursor: 'pointer' }}>
                    🔄 {t('retry')}
                  </button>
                  <button onClick={() => onRemoveJob?.(j.id)} style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '6px 8px', borderRadius: 8, fontSize: 11, marginLeft: 'auto', cursor: 'pointer' }}>
                    ✕
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Alt Eylem Barı: İndirme Bittiğinde Yapılacak Eylem (Post-download action) */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--panel-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>⚡</span>
          <span>{t('onFinishAction')}:</span>
        </span>
        <select
          value={postAction}
          onChange={e => handlePostActionChange(e.target.value as any)}
          style={{
            flex: 1,
            padding: '4px 8px',
            borderRadius: 8,
            fontSize: 11,
            background: 'var(--panel)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="none">{t('actionNone')}</option>
          <option value="shutdown">🛑 {t('actionShutdown')}</option>
          <option value="sleep">💤 {t('actionSleep')}</option>
          <option value="quit">🚪 {t('actionQuit')}</option>
        </select>
      </div>

      {/* Silme & Kaldırma Onay Modalı */}
      {confirmDeleteJob && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div className="card-premium" style={{
            width: '100%',
            maxWidth: 320,
            borderRadius: 16,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>
              🗑️ {t('deleteOrRemoveTitle')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-word', lineHeight: 1.4 }}>
              <strong>{confirmDeleteJob.title}</strong>
              <br />
              {t('deleteOrRemovePrompt')}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => {
                  onRemoveJob?.(confirmDeleteJob.id)
                  setConfirmDeleteJob(null)
                }}
                style={{
                  background: 'var(--panel-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  padding: '9px 12px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                {t('removeOnlyList')}
                <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                  {t('removeOnlyListDesc')}
                </div>
              </button>

              <button
                onClick={() => {
                  onDeleteJob?.(confirmDeleteJob, true)
                  setConfirmDeleteJob(null)
                }}
                style={{
                  background: 'rgba(220, 38, 38, 0.15)',
                  color: '#fca5a5',
                  border: '1px solid rgba(220, 38, 38, 0.35)',
                  padding: '9px 12px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                {t('deleteFromDisk')}
                <div style={{ fontSize: 10, fontWeight: 400, color: '#fca5a5', marginTop: 2 }}>
                  {t('deleteFromDiskDesc')}
                </div>
              </button>

              <button
                onClick={() => setConfirmDeleteJob(null)}
                style={{
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: 0,
                  padding: '6px 12px',
                  fontSize: 11,
                  marginTop: 2,
                  cursor: 'pointer'
                }}
              >
                {t('cancelAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
