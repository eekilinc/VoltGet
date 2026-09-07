import { useState } from 'react'
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

export default function QueuePanel({
  jobs,
  onCancel,
  onRetry,
  onPause,
  onResume,
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

  const downloading = jobs.filter(j => j.status === 'downloading').length
  const done = jobs.filter(j => j.status === 'done' && !j.deletedFromDisk).length
  const deletedFromDiskCount = jobs.filter(j => j.status === 'done' && j.deletedFromDisk).length

  const label = (j: Job) => {
    if (j.status === 'done') {
      if (j.deletedFromDisk) return '⚠️ Diskten Silindi'
      return '✓ ' + t('statusDone')
    }
    if (j.status === 'downloading') return t('statusDownloading')
    if (j.status === 'queued') return t('statusQueued')
    if (j.status === 'paused') return t('statusPaused')
    return t('statusError')
  }

  return (
    <div style={{
      width: compact ? '100%' : '380px',
      minWidth: compact ? undefined : '340px',
      background: 'var(--panel)',
      borderLeft: compact ? 'none' : '1px solid var(--border)',
      borderTop: compact ? '1px solid var(--border)' : 'none',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Üst Başlık Barı */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>📋 {t('queue')}</div>
        <div style={{ fontSize: 11, background: 'var(--panel-2)', padding: '2px 8px', borderRadius: 20, border: '1px solid var(--border)' }}>
          {jobs.length} • ⬇️ {downloading} • ✓ {done}
          {deletedFromDiskCount > 0 && <span style={{ color: '#fca5a5', marginLeft: 4 }}>• ⚠️ {deletedFromDiskCount}</span>}
        </div>
        <div style={{ flex: 1 }} />
        {jobs.some(j => j.status === 'done' || j.status === 'error') && (
          <button onClick={onClear} style={{ background: '#7f1d1d', color: '#fff', border: 0, padding: '6px 8px', borderRadius: 8, fontSize: 11 }}>
            🗑️ {t('clear')}
          </button>
        )}
        <button onClick={onOpenFolder} style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 8px', borderRadius: 8, fontSize: 11 }}>
          📂 {t('open')}
        </button>
      </div>

      {/* İndirmeler Listesi */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-2)' }}>
        {jobs.length === 0 && (
          <div className="text-muted" style={{ textAlign: 'center', padding: 28, fontSize: 12 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⬇️</div>
            {t('noDownloadsYet')}<br />
            <span style={{ fontSize: 11 }}>{t('pasteOrCapture')}</span>
          </div>
        )}

        {jobs.map(j => (
          <div key={j.id} className="card-premium" style={{ borderRadius: 14, padding: 12, border: j.deletedFromDisk ? '1px solid rgba(239, 68, 68, 0.35)' : undefined }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: j.deletedFromDisk ? 'var(--text-muted)' : 'var(--text)', textDecoration: j.deletedFromDisk ? 'line-through' : 'none' }}>
                  {j.title}
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
                  ? (j.deletedFromDisk ? '#450a0a' : '#14532d')
                  : j.status === 'error' ? '#7f1d1d'
                  : j.status === 'queued' ? '#422006'
                  : j.status === 'paused' ? '#1e293b'
                  : 'color-mix(in srgb, var(--accent-solid) 22%, transparent)',
                color: j.status === 'done'
                  ? (j.deletedFromDisk ? '#fca5a5' : '#86efac')
                  : j.status === 'error' ? '#fca5a5'
                  : j.status === 'queued' ? '#fbbf24'
                  : j.status === 'paused' ? '#93c5fd'
                  : 'var(--text)',
                border: j.deletedFromDisk ? '1px solid rgba(239, 68, 68, 0.4)' : 'none'
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
              {j.deletedFromDisk ? '⚠️ Bu dosya yerel diskten silinmiş veya taşınmış' : j.log}
            </div>

            {/* Eylem Butonları */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {(j.status === 'downloading' || j.status === 'queued') && (
                <button onClick={() => onPause?.(j.id)} style={{ background: '#422006', color: '#fbbf24', border: 0, padding: '6px 8px', borderRadius: 8, fontSize: 11 }}>
                  ⏸ {t('pause')}
                </button>
              )}
              {(j.status === 'downloading' || j.status === 'queued' || j.status === 'paused') && (
                <button onClick={() => onCancel(j.id)} style={{ background: '#7f1d1d', color: '#fff', border: 0, padding: '6px 8px', borderRadius: 8, fontSize: 11 }}>
                  {t('cancel')}
                </button>
              )}
              {j.status === 'paused' && (
                <button onClick={() => onResume?.(j)} className="brand-gradient" style={{ color: '#fff', border: 0, padding: '6px 8px', borderRadius: 8, fontSize: 11 }}>
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
                    style={{ color: '#fff', border: 0, padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    ⚡ Aç
                  </button>
                  <button
                    onClick={() => {
                      if (j.filePath) onShowInFolder?.(j.filePath)
                      else onOpenFolder()
                    }}
                    style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 9px', borderRadius: 8, fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                    title="Klasör içinde seçili olarak gösterir"
                  >
                    📁 Klasörde Göster
                  </button>
                  <button
                    onClick={() => setConfirmDeleteJob(j)}
                    style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '6px 8px', borderRadius: 8, fontSize: 11, marginLeft: 'auto' }}
                    title="Listeden kaldır veya diskten sil"
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
                    style={{ color: '#fff', border: 0, padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    🔄 Yeniden İndir
                  </button>
                  <button
                    onClick={() => onRemoveJob?.(j.id)}
                    style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 9px', borderRadius: 8, fontSize: 11, marginLeft: 'auto' }}
                  >
                    🗑️ Listeden Kaldır
                  </button>
                </>
              )}

              {j.status === 'error' && (
                <>
                  <button onClick={() => onRetry?.(j)} className="brand-gradient" style={{ color: '#fff', border: 0, padding: '6px 8px', borderRadius: 8, fontSize: 11 }}>
                    🔄 {t('retry')}
                  </button>
                  <button onClick={() => onRemoveJob?.(j.id)} style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '6px 8px', borderRadius: 8, fontSize: 11, marginLeft: 'auto' }}>
                    ✕
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
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
              🗑️ İndirmeyi Kaldır / Sil
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', wordBreak: 'break-word', lineHeight: 1.4 }}>
              <strong>{confirmDeleteJob.title}</strong>
              <br />
              Bu indirme için ne yapmak istersiniz?
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
                📋 Sadece Listeden Kaldır
                <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>
                  Dosya diskte kalır, yalnızca VoltGet geçmişinden silinir.
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
                ❌ Diskten de Sil (Geri Dönüşüm)
                <div style={{ fontSize: 10, fontWeight: 400, color: '#fca5a5', marginTop: 2 }}>
                  Dosya Windows Geri Dönüşüm Kutusuna taşınır.
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
                Vazgeç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
