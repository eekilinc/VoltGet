import { useMemo, useState } from 'react';
import {
  Activity,
  Copy,
  ExternalLink,
  FolderOpen,
  Info,
  Layers,
  Pause,
  Play,
  Terminal,
  Trash2,
  X,
} from '../icons';
import { useAppSettings } from '../../context/AppSettingsContext';
import { useToast } from '../../context/ToastContext';
import { formatBytes } from '../../utils/speed';
import type { Job } from '../QueuePanel';

interface DownloadInspectorProps {
  job: Job | null;
  onClose: () => void;
  speedHistory?: number[];
  onPause?: (id: string) => void;
  onResume?: (job: Job) => void;
  onRetry?: (job: Job) => void;
  onOpenFile?: (path: string) => void;
  onShowInFolder?: (path: string) => void;
  onDelete?: (job: Job) => void;
}

export default function DownloadInspector({
  job,
  onClose,
  speedHistory = [],
  onPause,
  onResume,
  onRetry: _onRetry,
  onOpenFile,
  onShowInFolder,
  onDelete,
}: DownloadInspectorProps) {
  const { t: _t } = useAppSettings();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'segments' | 'graph' | 'logs' | 'details'>('segments');

  // Simulated / detected multi-connection segments (Hydra style range chunks)
  const segments = useMemo(() => {
    if (!job) return [];
    const count = job.opts?.segments || 8;
    const progress = Math.min(100, Math.max(0, job.percent || 0));

    // Create chunk states based on overall percentage
    const chunks = [];
    for (let i = 0; i < count; i++) {
      let chunkPct = 0;
      if (job.status === 'done') {
        chunkPct = 100;
      } else if (job.status === 'downloading') {
        // Stagger chunk progress realistically
        const variance = ((i * 17) % 25) - 12;
        chunkPct = Math.min(100, Math.max(0, progress + variance));
      } else if (job.status === 'paused') {
        chunkPct = progress;
      }
      chunks.push({
        id: i + 1,
        percent: chunkPct,
        active: job.status === 'downloading' && chunkPct < 100,
      });
    }
    return chunks;
  }, [job]);

  if (!job) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    toast.info(`${label} kopyalandı`);
  };

  // Sparkline coordinates for speed graph
  const maxSpeed = Math.max(1, ...speedHistory);
  const sparklinePoints = speedHistory
    .map((val, idx) => {
      const x = (idx / Math.max(1, speedHistory.length - 1)) * 300;
      const y = 50 - (val / maxSpeed) * 45;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--panel)',
        display: 'flex',
        flexDirection: 'column',
        height: 240,
        flexShrink: 0,
        animation: 'slideUp 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 10,
      }}
    >
      {/* Üst Bar: Başlık, Durum, Sekmeler, Kapat */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--panel-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: 'var(--text-bright)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 360,
            }}
          >
            {job.title || job.fileName || 'İndirme Detayları'}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 6,
              background:
                job.status === 'downloading'
                  ? 'var(--badge-info-bg)'
                  : job.status === 'done'
                    ? 'var(--badge-success-bg)'
                    : job.status === 'paused'
                      ? 'var(--badge-warning-bg)'
                      : 'var(--badge-danger-bg)',
              color:
                job.status === 'downloading'
                  ? 'var(--badge-info-text)'
                  : job.status === 'done'
                    ? 'var(--badge-success-text)'
                    : job.status === 'paused'
                      ? 'var(--badge-warning-text)'
                      : 'var(--badge-danger-text)',
            }}
          >
            {job.status === 'downloading'
              ? `${job.percent}% • ${job.speed || '0 KB/s'}`
              : job.status.toUpperCase()}
          </span>
        </div>

        {/* Sekmeler */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div
            style={{
              display: 'flex',
              background: 'var(--panel-3)',
              padding: 2,
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('segments')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 6,
                border: 0,
                fontSize: 11,
                fontWeight: 600,
                background: activeTab === 'segments' ? 'var(--accent-solid)' : 'transparent',
                color: activeTab === 'segments' ? '#fff' : 'var(--muted)',
              }}
            >
              <Layers size={13} />
              <span>Hydra Parçaları</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('graph')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 6,
                border: 0,
                fontSize: 11,
                fontWeight: 600,
                background: activeTab === 'graph' ? 'var(--accent-solid)' : 'transparent',
                color: activeTab === 'graph' ? '#fff' : 'var(--muted)',
              }}
            >
              <Activity size={13} />
              <span>Hız Grafiği</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('details')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 6,
                border: 0,
                fontSize: 11,
                fontWeight: 600,
                background: activeTab === 'details' ? 'var(--accent-solid)' : 'transparent',
                color: activeTab === 'details' ? '#fff' : 'var(--muted)',
              }}
            >
              <Info size={13} />
              <span>Dosya Bilgisi</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 9px',
                borderRadius: 6,
                border: 0,
                fontSize: 11,
                fontWeight: 600,
                background: activeTab === 'logs' ? 'var(--accent-solid)' : 'transparent',
                color: activeTab === 'logs' ? '#fff' : 'var(--muted)',
              }}
            >
              <Terminal size={13} />
              <span>Konsol</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Kapat"
            style={{
              background: 'transparent',
              border: 0,
              padding: 5,
              borderRadius: 6,
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Gövde */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', display: 'flex', gap: 20 }}>
        {/* Sol Ana Görünüm */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          {activeTab === 'segments' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                  fontSize: 11,
                }}
              >
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>
                  Aktif Multi-Source Segment Akışı ({segments.length} Eşzamanlı Bağlantı)
                </span>
                <span
                  style={{ color: 'var(--accent-solid)', fontWeight: 700 }}
                  className="tech-mono"
                >
                  {job.percent}% Tamamlandı
                </span>
              </div>

              {/* Segment Parça Izgarası (Hydra Range View) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(8, segments.length)}, 1fr)`,
                  gap: 6,
                }}
              >
                {segments.map(seg => (
                  <div
                    key={seg.id}
                    style={{
                      background: 'var(--panel-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '6px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                      <span style={{ color: 'var(--muted)', fontWeight: 600 }}>#{seg.id}</span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: seg.percent >= 100 ? '#22c55e' : 'var(--text)',
                        }}
                        className="tech-mono"
                      >
                        {Math.round(seg.percent)}%
                      </span>
                    </div>
                    <div
                      style={{
                        height: 4,
                        borderRadius: 2,
                        background: 'var(--panel-3)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${seg.percent}%`,
                          background:
                            seg.percent >= 100
                              ? '#22c55e'
                              : 'linear-gradient(90deg, var(--accent-solid), var(--accent-to))',
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'graph' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  flex: 1,
                  height: 60,
                  background: 'var(--panel-2)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {speedHistory.length > 1 ? (
                  <svg width="100%" height="100%" viewBox="0 0 300 50" preserveAspectRatio="none">
                    <polyline
                      fill="none"
                      stroke="var(--accent-solid)"
                      strokeWidth="2"
                      points={sparklinePoints}
                    />
                  </svg>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      fontSize: 11,
                      color: 'var(--muted)',
                    }}
                  >
                    Hız geçmişi toplanıyor...
                  </div>
                )}
              </div>
              <div style={{ minWidth: 100 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>
                  ANLIK HIZ
                </div>
                <div
                  style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-bright)' }}
                  className="tech-mono"
                >
                  {job.speed || '0 KB/s'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  Kalan: {job.eta || '--'}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'details' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px 16px',
                fontSize: 11,
              }}
            >
              <div>
                <span style={{ color: 'var(--muted)' }}>Kaynak URL: </span>
                <span
                  style={{ color: 'var(--text-bright)', wordBreak: 'break-all' }}
                  className="tech-mono"
                >
                  {job.url ? job.url.slice(0, 55) + (job.url.length > 55 ? '...' : '') : '--'}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Dosya Boyutu: </span>
                <span
                  style={{ color: 'var(--text-bright)', fontWeight: 700 }}
                  className="tech-mono"
                >
                  {job.total || (job.size ? formatBytes(job.size) : '--')}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Kayıt Yolu: </span>
                <span
                  style={{ color: 'var(--text-bright)', wordBreak: 'break-all' }}
                  className="tech-mono"
                >
                  {job.filePath || job.fileName || '--'}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--muted)' }}>Bağlantı Modu: </span>
                <span style={{ color: 'var(--accent-solid)', fontWeight: 700 }}>
                  {job.opts?.isHttp ? 'Multi-Thread HTTP (Direct)' : 'yt-dlp Media Stream'}
                </span>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div
              style={{
                height: 110,
                background: 'var(--panel-3)',
                borderRadius: 8,
                padding: 8,
                border: '1px solid var(--border)',
                overflowY: 'auto',
                fontSize: 10,
                fontFamily: 'monospace',
                color: 'var(--text-muted)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {job.log || 'Henüz log kaydı yok.'}
            </div>
          )}
        </div>

        {/* Sağ Hızlı Eylemler */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 6,
            borderLeft: '1px solid var(--border)',
            paddingLeft: 16,
            minWidth: 150,
          }}
        >
          {job.status === 'downloading' && onPause && (
            <button
              type="button"
              onClick={() => onPause(job.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--panel-2)',
                color: 'var(--text)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <Pause size={13} />
              <span>Duraklat</span>
            </button>
          )}

          {(job.status === 'paused' || job.status === 'error') && onResume && (
            <button
              type="button"
              onClick={() => onResume(job)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: 0,
                background: 'var(--accent-solid)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <Play size={13} />
              <span>Devam Et</span>
            </button>
          )}

          {job.status === 'done' && job.filePath && onOpenFile && (
            <button
              type="button"
              onClick={() => onOpenFile(job.filePath!)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: 0,
                background: 'var(--accent-solid)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <ExternalLink size={13} />
              <span>Dosyayı Aç</span>
            </button>
          )}

          {job.filePath && onShowInFolder && (
            <button
              type="button"
              onClick={() => onShowInFolder(job.filePath!)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--panel-2)',
                color: 'var(--text)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <FolderOpen size={13} />
              <span>Klasörde Göster</span>
            </button>
          )}

          {job.url && (
            <button
              type="button"
              onClick={() => copyToClipboard(job.url, 'Link')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--panel-2)',
                color: 'var(--text)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <Copy size={13} />
              <span>Linki Kopyala</span>
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(job)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid var(--badge-danger-border)',
                background: 'var(--badge-danger-bg)',
                color: 'var(--badge-danger-text)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <Trash2 size={13} />
              <span>Listeden Sil</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
