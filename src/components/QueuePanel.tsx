import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowDownCircle,
  ArrowUpDown,
  Copy,
  ExternalLink,
  FileCheck,
  FileText,
  FolderOpen,
  LayoutGrid,
  List,
  Music,
  Pause,
  Play,
  Trash2,
  Video,
  Zap,
} from './icons';
import { useAppSettings } from '../context/AppSettingsContext';
import { useToast } from '../context/ToastContext';
import {
  useJobFilter,
  type JobCategory,
  type JobFilterTab,
  getJobCategory,
} from '../hooks/useJobFilter';
import { formatBytes } from '../utils/speed';
import DownloadInspector from './QueuePanel/DownloadInspector';
import JobStatusBadge from './QueuePanel/JobStatusBadge';

export type Job = {
  id: string;
  url: string;
  title: string;
  percent: number;
  speed: string;
  eta: string;
  total: string;
  status: 'downloading' | 'done' | 'error' | 'queued' | 'paused';
  log: string;
  thumbnail?: string;
  opts?: any;
  filePath?: string;
  fileName?: string;
  deletedFromDisk?: boolean;
  note?: string;
  tags?: string[];
  size?: number;
};

export default function QueuePanel({
  jobs,
  filterTab: parentFilterTab,
  categoryFilter: parentCategoryFilter,
  searchQuery: parentSearchQuery,
  onOpenNewDownload,
  onCancel: _onCancel,
  onRetry,
  onPause,
  onResume,
  onPauseAll: _onPauseAll,
  onResumeAll: _onResumeAll,
  onOpenFolder: _onOpenFolder,
  onOpenFile,
  onShowInFolder,
  onRemoveJob,
  onDeleteJob,
  onClear: _onClear,
  onMoveJob: _onMoveJob,
  onReorderJob: _onReorderJob,
  onUpdateJob: _onUpdateJob,
}: {
  jobs: Job[];
  filterTab?: JobFilterTab;
  categoryFilter?: JobCategory;
  searchQuery?: string;
  onOpenNewDownload?: () => void;
  onCancel?: (id: string) => void;
  onRetry?: (job: Job) => void;
  onPause?: (id: string) => void;
  onResume?: (job: Job) => void;
  onPauseAll?: () => void;
  onResumeAll?: () => void;
  onOpenFolder?: () => void;
  onOpenFile?: (filePath: string) => void;
  onShowInFolder?: (filePath: string) => void;
  onRemoveJob?: (id: string) => void;
  onDeleteJob?: (job: Job, deleteFromDisk: boolean) => void;
  onClear?: () => void;
  onImportJobs?: (jobs: any[]) => void;
  onMoveJob?: (id: string, direction: 'up' | 'down') => void;
  onReorderJob?: (dragId: string, targetId: string) => void;
  onUpdateJob?: (id: string, patch: Partial<Job>) => void;
}) {
  const { t: _t } = useAppSettings();
  const toast = useToast();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [confirmDeleteJob, setConfirmDeleteJob] = useState<Job | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; job: Job } | null>(null);
  const [speedHistory, setSpeedHistory] = useState<Record<string, number[]>>({});
  const [sortField, setSortField] = useState<'title' | 'size' | 'percent' | 'speed' | 'status'>(
    'percent'
  );
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Speed recording for sparklines
  useEffect(() => {
    const interval = setInterval(() => {
      setSpeedHistory(prev => {
        const next: Record<string, number[]> = {};
        for (const j of jobs) {
          if (j.status === 'downloading') {
            const raw = j.speed || '';
            let kb = 0;
            const numMatch = raw.match(/[\d.]+/);
            if (numMatch) kb = parseFloat(numMatch[0]);
            if (/mb/i.test(raw)) kb *= 1024;
            const arr = [...(prev[j.id] || []), kb].slice(-24);
            next[j.id] = arr;
          }
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [jobs]);

  const {
    filterTab: internalFilterTab,
    categoryFilter: internalCategoryFilter,
    searchQuery: internalSearchQuery,
  } = useJobFilter(jobs);

  const activeFilterTab = parentFilterTab ?? internalFilterTab;
  const activeCategory = parentCategoryFilter ?? internalCategoryFilter;
  const activeQuery = (parentSearchQuery ?? internalSearchQuery).trim().toLowerCase();

  const filteredJobs = useMemo(() => {
    const list = jobs.filter(j => {
      if (
        activeFilterTab === 'downloading' &&
        !(j.status === 'downloading' || j.status === 'queued')
      )
        return false;
      if (
        activeFilterTab !== 'all' &&
        activeFilterTab !== 'downloading' &&
        j.status !== activeFilterTab
      )
        return false;
      if (activeCategory !== 'all' && getJobCategory(j) !== activeCategory) return false;
      if (activeQuery) {
        const matchTitle = j.title?.toLowerCase().includes(activeQuery);
        const matchUrl = j.url?.toLowerCase().includes(activeQuery);
        const matchFile = j.fileName?.toLowerCase().includes(activeQuery);
        if (!matchTitle && !matchUrl && !matchFile) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'title') {
        cmp = (a.title || a.fileName || '').localeCompare(b.title || b.fileName || '');
      } else if (sortField === 'percent') {
        cmp = (a.percent || 0) - (b.percent || 0);
      } else if (sortField === 'status') {
        cmp = a.status.localeCompare(b.status);
      } else if (sortField === 'speed') {
        cmp = (parseFloat(a.speed || '0') || 0) - (parseFloat(b.speed || '0') || 0);
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [jobs, activeFilterTab, activeCategory, activeQuery, sortField, sortAsc]);

  const selectedJob = useMemo(() => {
    return jobs.find(j => j.id === selectedJobId) || null;
  }, [jobs, selectedJobId]);

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getCategoryIcon = (job: Job) => {
    const cat = getJobCategory(job);
    switch (cat) {
      case 'video':
        return <Video size={16} color="#38bdf8" />;
      case 'audio':
        return <Music size={16} color="#c084fc" />;
      case 'document':
        return <FileText size={16} color="#fbbf24" />;
      case 'archive':
        return <Archive size={16} color="#fb923c" />;
      default:
        return <FileCheck size={16} color="#94a3b8" />;
    }
  };

  const openContextMenu = (e: React.MouseEvent, job: Job) => {
    e.preventDefault();
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: Math.min(e.clientY, window.innerHeight - 260),
      job,
    });
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--panel)',
        overflow: 'hidden',
        position: 'relative',
      }}
      onClick={() => setContextMenu(null)}
    >
      {/* İkincil Araç Çubuğu (Toolbar): Görünüm Geçişi, Toplam Sayı, Eylemler */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--panel-2)',
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>
            {filteredJobs.length} {filteredJobs.length === 1 ? 'öğe' : 'öğe'}
          </span>
          {activeFilterTab !== 'all' && (
            <span
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                background: 'var(--panel-3)',
                padding: '2px 6px',
                borderRadius: 4,
                color: 'var(--muted)',
                fontWeight: 600,
              }}
            >
              Filtre: {activeFilterTab}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Görünüm Modu Değiştirici */}
          <div
            style={{
              display: 'flex',
              background: 'var(--panel-3)',
              padding: 2,
              borderRadius: 6,
              border: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Tablo Görünümü (Hydra Grid)"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 8px',
                borderRadius: 4,
                border: 0,
                background: viewMode === 'table' ? 'var(--accent-solid)' : 'transparent',
                color: viewMode === 'table' ? '#fff' : 'var(--muted)',
              }}
            >
              <List size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('card')}
              title="Kart Görünümü"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 8px',
                borderRadius: 4,
                border: 0,
                background: viewMode === 'card' ? 'var(--accent-solid)' : 'transparent',
                color: viewMode === 'card' ? '#fff' : 'var(--muted)',
              }}
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Ana Liste Alanı */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {filteredJobs.length === 0 ? (
          /* Boş Durum (Empty State) */
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 40,
              color: 'var(--muted)',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-solid)',
              }}
            >
              <ArrowDownCircle size={32} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-bright)' }}>
              {activeQuery ? 'Aramanıza uygun indirme bulunamadı' : 'Kuyrukta Henüz İndirme Yok'}
            </div>
            <div style={{ fontSize: 12, maxWidth: 360, textAlign: 'center' }}>
              Tarayıcınızdan bir link kopyalayın, sürükleyip bırakın veya aşağıdaki butonla yeni bir
              indirme ekleyin.
            </div>
            {onOpenNewDownload && (
              <button
                type="button"
                onClick={onOpenNewDownload}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 18px',
                  borderRadius: 10,
                  border: 0,
                  background: 'var(--accent-solid)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  marginTop: 6,
                  boxShadow: '0 4px 14px color-mix(in srgb, var(--accent-solid) 30%, transparent)',
                }}
              >
                <Zap size={14} />
                <span>+ Yeni İndirme Başlat</span>
              </button>
            )}
          </div>
        ) : viewMode === 'table' ? (
          /* Hydra Tarzı Modern Veri Tablosu */
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 12,
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--panel-3)',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--muted)',
                  fontSize: 11,
                  fontWeight: 700,
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                  userSelect: 'none',
                }}
              >
                <th
                  style={{ padding: '10px 14px', cursor: 'pointer' }}
                  onClick={() => handleSort('title')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>DOSYA ADI / BAŞLIK</span>
                    <ArrowUpDown size={12} opacity={sortField === 'title' ? 1 : 0.3} />
                  </div>
                </th>
                <th
                  style={{ padding: '10px 10px', width: 110, cursor: 'pointer' }}
                  onClick={() => handleSort('size')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>BOYUT</span>
                    <ArrowUpDown size={12} opacity={sortField === 'size' ? 1 : 0.3} />
                  </div>
                </th>
                <th
                  style={{ padding: '10px 10px', width: 170, cursor: 'pointer' }}
                  onClick={() => handleSort('percent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>İLERLEME</span>
                    <ArrowUpDown size={12} opacity={sortField === 'percent' ? 1 : 0.3} />
                  </div>
                </th>
                <th
                  style={{ padding: '10px 10px', width: 110, cursor: 'pointer' }}
                  onClick={() => handleSort('speed')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>HIZ</span>
                    <ArrowUpDown size={12} opacity={sortField === 'speed' ? 1 : 0.3} />
                  </div>
                </th>
                <th style={{ padding: '10px 10px', width: 90 }}>KALAN</th>
                <th
                  style={{ padding: '10px 10px', width: 110, cursor: 'pointer' }}
                  onClick={() => handleSort('status')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>DURUM</span>
                    <ArrowUpDown size={12} opacity={sortField === 'status' ? 1 : 0.3} />
                  </div>
                </th>
                <th style={{ padding: '10px 14px', width: 120, textAlign: 'right' }}>EYLEMLER</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map(job => {
                const isSelected = selectedJobId === job.id;
                const isDownloading = job.status === 'downloading';
                const isDone = job.status === 'done';
                const isPaused = job.status === 'paused';
                const isError = job.status === 'error';

                return (
                  <tr
                    key={job.id}
                    onClick={() => setSelectedJobId(isSelected ? null : job.id)}
                    onContextMenu={e => openContextMenu(e, job)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: isSelected
                        ? 'color-mix(in srgb, var(--accent-solid) 14%, var(--panel))'
                        : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.12s ease',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--panel-2)';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {/* Dosya Başlığı & Kategori İkonu */}
                    <td style={{ padding: '10px 14px', maxWidth: 320 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 6,
                            background: 'var(--panel-3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            border: '1px solid var(--border)',
                          }}
                        >
                          {job.thumbnail ? (
                            <img
                              src={job.thumbnail}
                              alt=""
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                borderRadius: 5,
                              }}
                            />
                          ) : (
                            getCategoryIcon(job)
                          )}
                        </div>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 700,
                              color: isSelected ? 'var(--accent-solid)' : 'var(--text-bright)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: 12.5,
                            }}
                            title={job.title || job.fileName}
                          >
                            {job.title || job.fileName || 'İsimsiz İndirme'}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              opacity: 0.8,
                            }}
                          >
                            {job.fileName || job.url}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Boyut */}
                    <td
                      style={{ padding: '10px 10px', color: 'var(--text)' }}
                      className="tech-mono"
                    >
                      {job.total || (job.size ? formatBytes(job.size) : '--')}
                    </td>

                    {/* İlerleme Çubuğu & Yüzde */}
                    <td style={{ padding: '10px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div
                          style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}
                          className="tech-mono"
                        >
                          <span style={{ fontWeight: 700, color: 'var(--text-bright)' }}>
                            {(job.percent || 0).toFixed(1)}%
                          </span>
                          {job.opts?.segments && (
                            <span style={{ fontSize: 9.5, color: 'var(--muted)' }}>
                              {job.opts.segments} parça
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            height: 5,
                            borderRadius: 99,
                            background: 'var(--panel-3)',
                            overflow: 'hidden',
                            border: '1px solid var(--border)',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, Math.max(0, job.percent || 0))}%`,
                              background: isDone
                                ? '#22c55e'
                                : isPaused
                                  ? '#eab308'
                                  : isError
                                    ? '#ef4444'
                                    : 'linear-gradient(90deg, var(--accent-solid), var(--accent-to))',
                              transition: 'width 0.25s ease',
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Hız */}
                    <td style={{ padding: '10px 10px' }} className="tech-mono">
                      {isDownloading && job.speed ? (
                        <span style={{ color: '#4ade80', fontWeight: 700 }}>{job.speed}</span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>--</span>
                      )}
                    </td>

                    {/* Kalan Süre */}
                    <td
                      style={{ padding: '10px 10px', color: 'var(--muted)' }}
                      className="tech-mono"
                    >
                      {isDownloading && job.eta && job.eta !== '-' ? job.eta : '--'}
                    </td>

                    {/* Durum */}
                    <td style={{ padding: '10px 10px' }}>
                      <JobStatusBadge
                        status={job.status}
                        deletedFromDisk={job.deletedFromDisk}
                        label={
                          isDone
                            ? job.deletedFromDisk
                              ? 'Silinmiş'
                              : 'Tamamlandı'
                            : isDownloading
                              ? 'İndiriliyor'
                              : isPaused
                                ? 'Duraklatıldı'
                                : isError
                                  ? 'Hata'
                                  : 'Sırada'
                        }
                      />
                    </td>

                    {/* Hızlı Eylemler */}
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 4,
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        {isDownloading && onPause && (
                          <button
                            type="button"
                            onClick={() => onPause(job.id)}
                            title="Duraklat"
                            style={{
                              background: 'transparent',
                              border: 0,
                              color: 'var(--muted)',
                              padding: 6,
                              borderRadius: 6,
                              display: 'flex',
                            }}
                          >
                            <Pause size={14} />
                          </button>
                        )}

                        {(isPaused || isError) && onResume && (
                          <button
                            type="button"
                            onClick={() => onResume(job)}
                            title="Devam Et"
                            style={{
                              background: 'transparent',
                              border: 0,
                              color: 'var(--accent-solid)',
                              padding: 6,
                              borderRadius: 6,
                              display: 'flex',
                            }}
                          >
                            <Play size={14} />
                          </button>
                        )}

                        {isDone && job.filePath && onOpenFile && (
                          <button
                            type="button"
                            onClick={() => onOpenFile(job.filePath!)}
                            title="Dosyayı Aç"
                            style={{
                              background: 'transparent',
                              border: 0,
                              color: 'var(--accent-solid)',
                              padding: 6,
                              borderRadius: 6,
                              display: 'flex',
                            }}
                          >
                            <ExternalLink size={14} />
                          </button>
                        )}

                        {job.filePath && onShowInFolder && (
                          <button
                            type="button"
                            onClick={() => onShowInFolder(job.filePath!)}
                            title="Klasörde Göster"
                            style={{
                              background: 'transparent',
                              border: 0,
                              color: 'var(--muted)',
                              padding: 6,
                              borderRadius: 6,
                              display: 'flex',
                            }}
                          >
                            <FolderOpen size={14} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setConfirmDeleteJob(job)}
                          title="Listeden Kaldır"
                          style={{
                            background: 'transparent',
                            border: 0,
                            color: 'var(--muted)',
                            padding: 6,
                            borderRadius: 6,
                            display: 'flex',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          /* Kart Görünümü */
          <div
            style={{
              padding: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}
          >
            {filteredJobs.map(job => (
              <div
                key={job.id}
                onClick={() => setSelectedJobId(selectedJobId === job.id ? null : job.id)}
                style={{
                  background: selectedJobId === job.id ? 'var(--panel-2)' : 'var(--panel)',
                  border:
                    selectedJobId === job.id
                      ? '1px solid var(--accent-solid)'
                      : '1px solid var(--border)',
                  borderRadius: 12,
                  padding: 14,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {job.thumbnail ? (
                    <img
                      src={job.thumbnail}
                      alt=""
                      style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        background: 'var(--panel-3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {getCategoryIcon(job)}
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 12.5,
                        color: 'var(--text-bright)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {job.title || job.fileName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }} className="tech-mono">
                      {job.total || '--'} • {job.status}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    height: 5,
                    borderRadius: 99,
                    background: 'var(--panel-3)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${job.percent || 0}%`,
                      background: 'var(--accent-solid)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hydra Tarzı Alt Detay Çekmecesi (Download Inspector) */}
      {selectedJob && (
        <DownloadInspector
          job={selectedJob}
          speedHistory={speedHistory[selectedJob.id] || []}
          onClose={() => setSelectedJobId(null)}
          onPause={onPause}
          onResume={onResume}
          onRetry={onRetry}
          onOpenFile={onOpenFile}
          onShowInFolder={onShowInFolder}
          onDelete={job => setConfirmDeleteJob(job)}
        />
      )}

      {/* Silme Onay Modalı */}
      {confirmDeleteJob && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setConfirmDeleteJob(null)}
        >
          <div
            style={{
              width: 380,
              background: 'var(--panel)',
              borderRadius: 14,
              border: '1px solid var(--border-2)',
              padding: 20,
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: 'var(--text-bright)',
                marginBottom: 8,
              }}
            >
              İndirmeyi Kaldır
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
              "{confirmDeleteJob.title || confirmDeleteJob.fileName}" kuyruktan silinecek. Dosyayı
              yerel diskten de silmek ister misiniz?
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmDeleteJob(null)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text)',
                  fontSize: 12,
                }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => {
                  onRemoveJob?.(confirmDeleteJob.id);
                  setConfirmDeleteJob(null);
                  if (selectedJobId === confirmDeleteJob.id) setSelectedJobId(null);
                }}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--panel-2)',
                  color: 'var(--text)',
                  fontSize: 12,
                }}
              >
                Sadece Listeden Sil
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteJob?.(confirmDeleteJob, true);
                  setConfirmDeleteJob(null);
                  if (selectedJobId === confirmDeleteJob.id) setSelectedJobId(null);
                }}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: 0,
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Diskten de Sil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sağ Tık (Context) Menüsü */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 99999,
            background: 'var(--panel)',
            border: '1px solid var(--border-2)',
            borderRadius: 10,
            padding: 4,
            minWidth: 180,
            boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.job.status === 'downloading' && onPause && (
            <button
              type="button"
              onClick={() => {
                onPause(contextMenu.job.id);
                setContextMenu(null);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 6,
                border: 0,
                background: 'transparent',
                color: 'var(--text)',
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <Pause size={14} /> <span>Duraklat</span>
            </button>
          )}

          {(contextMenu.job.status === 'paused' || contextMenu.job.status === 'error') &&
            onResume && (
              <button
                type="button"
                onClick={() => {
                  onResume(contextMenu.job);
                  setContextMenu(null);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: 0,
                  background: 'transparent',
                  color: 'var(--text)',
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Play size={14} /> <span>Devam Et</span>
              </button>
            )}

          {contextMenu.job.filePath && onOpenFile && (
            <button
              type="button"
              onClick={() => {
                onOpenFile(contextMenu.job.filePath!);
                setContextMenu(null);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 6,
                border: 0,
                background: 'transparent',
                color: 'var(--text)',
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <ExternalLink size={14} /> <span>Dosyayı Aç</span>
            </button>
          )}

          {contextMenu.job.filePath && onShowInFolder && (
            <button
              type="button"
              onClick={() => {
                onShowInFolder(contextMenu.job.filePath!);
                setContextMenu(null);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 6,
                border: 0,
                background: 'transparent',
                color: 'var(--text)',
                fontSize: 12,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <FolderOpen size={14} /> <span>Klasörde Göster</span>
            </button>
          )}

          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(contextMenu.job.url || '');
              toast.info('Bağlantı kopyalandı');
              setContextMenu(null);
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 6,
              border: 0,
              background: 'transparent',
              color: 'var(--text)',
              fontSize: 12,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Copy size={14} /> <span>Linki Kopyala</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const job = contextMenu.job;
              setContextMenu(null);
              setConfirmDeleteJob(job);
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 6,
              border: 0,
              background: 'transparent',
              color: '#ef4444',
              fontSize: 12,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Trash2 size={14} /> <span>Listeden Sil</span>
          </button>
        </div>
      )}
    </div>
  );
}
