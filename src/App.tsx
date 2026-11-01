import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowDownCircle,
  CheckCircle2,
  Cpu,
  Download,
  FileText,
  FolderOpen,
  Info,
  Music,
  Pause,
  PauseCircle,
  Play,
  Plus,
  Puzzle,
  Radio,
  Search,
  Settings,
  Trash2,
  Video,
  X,
  Zap,
} from './components/icons';
import AboutPanel from './components/AboutPanel';
import ExtensionInstallModal from './components/ExtensionInstallModal';
import FileConflictDialog from './components/FileConflictDialog';
import FileExplorer from './components/FileExplorer';
import NewDownloadModal from './components/NewDownloadModal';
import QueuePanel, { type Job } from './components/QueuePanel';
import SettingsPanel from './components/SettingsPanel';
import SniffPanel from './components/SniffPanel';
import VoltLogo from './components/VoltLogo';
import { useAppSettings } from './context/AppSettingsContext';
import { useToast } from './context/ToastContext';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { type JobCategory, type JobFilterTab, useJobFilter } from './hooks/useJobFilter';
import { useJobs } from './hooks/useJobs';
import { formatBytes } from './utils/speed';

export type { Job };

export default function App() {
  const { t: _t } = useAppSettings();
  const toast = useToast();

  // Navigation: 'downloads' is our primary dashboard!
  const [tab, setTab] = useState<'downloads' | 'sniff' | 'explorer' | 'settings' | 'about'>(
    'downloads'
  );
  const [filterTab, setFilterTab] = useState<JobFilterTab>('all');
  const [categoryFilter, setCategoryFilter] = useState<JobCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Dialogs
  const [isNewDownloadOpen, setIsNewDownloadOpen] = useState(false);
  const [newDownloadInitialUrl, setNewDownloadInitialUrl] = useState('');
  const [isExtModalOpen, setIsExtModalOpen] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<any>(null);
  const [completedInfo, setCompletedInfo] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [filesRefreshKey, setFilesRefreshKey] = useState(0);
  const bumpFiles = () => setFilesRefreshKey(k => k + 1);

  const hasApi = typeof window !== 'undefined' && !!window.api;
  const {
    jobs,
    setJobs,
    totalSpeed,
    handleStartDownload,
    handleDirectDownload,
    handleHttpDownload,
    handleRetry,
    handleRemoveJob,
    handleDeleteJob,
    handleCancelJob,
    handleMoveJob,
  } = useJobs(hasApi);

  const {
    status,
    setStatus: _setStatus,
    outDir,
    appVersion,
    extConnected,
    clipboardDetectedUrl,
    setClipboardDetectedUrl,
    clipboardWatcherActive,
    toggleClipboardWatcher,
    speedLimitKB,
    setSpeedLimitKB,
  } = useAppBootstrap(hasApi);

  const { counts } = useJobFilter(jobs);

  // Global IPC listeners
  useEffect(() => {
    if (!hasApi) return;
    const cleanups = [
      window.api.onOpenSniffItem(() => setTab('sniff')),
      window.api.onSwitchToSniffTab(() => setTab('sniff')),
      window.api.onSwitchToDownloadTab(() => setTab('downloads')),
      window.api.onSwitchToSettingsTab(() => setTab('settings')),
      window.api.onFileConflict((d: any) => {
        if (d?.conflictId) setConflictInfo(d);
      }),
      window.api.onDone((d: any) => {
        if (d?.code === 0 && d?.filePath) {
          window.api
            ?.getConfig?.()
            .then((c: any) => {
              if (c?.completionDialog !== false) setCompletedInfo(d);
            })
            .catch(() => setCompletedInfo(d));
        }
      }),
    ];
    return () => cleanups.forEach(unsubscribe => unsubscribe());
  }, [hasApi]);

  // Keyboard shortcut Ctrl+N / Cmd+N to open New Download
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setIsNewDownloadOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getPageTitle = () => {
    if (tab === 'sniff') return 'Medya Yakalayıcı (Sniffer)';
    if (tab === 'explorer') return 'İndirilen Dosyalar';
    if (tab === 'settings') return 'Ayarlar';
    if (tab === 'about') return 'Hakkında';
    if (categoryFilter !== 'all') {
      const catNames: Record<string, string> = {
        video: 'Videolar',
        audio: 'Ses / Müzik',
        document: 'Belgeler',
        archive: 'Sıkıştırılmış Dosyalar',
        program: 'Programlar & Kurulumlar',
      };
      return catNames[categoryFilter] || 'Kategori';
    }
    const filterNames: Record<string, string> = {
      all: 'Tüm İndirmeler',
      downloading: 'İndirilenler',
      done: 'Tamamlananlar',
      paused: 'Duraklatılanlar',
      error: 'Hatalar',
    };
    return filterNames[filterTab] || 'İndirmeler';
  };

  const handlePauseAll = async () => {
    try {
      await window.api?.pauseAllDownloads?.();
    } catch {}
    setJobs(j =>
      j.map(x =>
        x.status === 'downloading' || x.status === 'queued'
          ? { ...x, status: 'paused' as const, log: 'Duraklatıldı' }
          : x
      )
    );
  };

  const handleResumeAll = async () => {
    try {
      await window.api?.resumeAllDownloads?.();
    } catch {}
    setJobs(j =>
      j.map(x =>
        x.status === 'paused' ? { ...x, status: 'downloading' as const, log: 'Devam ediyor...' } : x
      )
    );
  };

  const handleClearFinished = () => {
    setJobs(j => {
      const n = j.filter(
        x => x.status === 'downloading' || x.status === 'queued' || x.status === 'paused'
      );
      try {
        window.api?.saveQueue?.(n);
      } catch {}
      return n;
    });
    bumpFiles();
    toast.info('Tamamlananlar listeden temizlendi');
  };

  if (!hasApi) {
    return (
      <div
        style={{ padding: 24, background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh' }}
      >
        <h2 style={{ color: '#f87171' }}>Electron dışında açıldı</h2>
        <div className="card-premium" style={{ marginTop: 12, padding: 12, borderRadius: 12 }}>
          <pre>{`npm run dev`}</pre>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      onDragOver={e => {
        e.preventDefault();
        if (!isDragging) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setIsDragging(false);
        const url = e.dataTransfer.getData('text/plain');
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          setNewDownloadInitialUrl(url);
          setIsNewDownloadOpen(true);
        }
      }}
    >
      {/* Sürükle Bırak Bildirimi (Drag Overlay) */}
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5, 7, 14, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            gap: 16,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: 'var(--panel)',
              border: '2px dashed var(--accent-solid)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-solid)',
            }}
          >
            <Download size={40} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-bright)' }}>
            Bağlantıyı Buraya Bırakın
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Çok parçalı hızlı indirme otomatik olarak başlatılacak
          </div>
        </div>
      )}

      {/* SOL SIDEBAR: Marka, Yeni İndirme CTA, Durumlar, Kategoriler, Araçlar */}
      <aside
        style={{
          width: 240,
          height: '100%',
          background: 'var(--panel)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {/* Üst Logo ve Başlık */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '16px 18px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}
        >
          <VoltLogo size={32} />
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontWeight: 900,
                  fontSize: 15,
                  letterSpacing: '-0.02em',
                  color: 'var(--text-bright)',
                  whiteSpace: 'nowrap',
                }}
              >
                VoltGet
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
              Modern İndirme Yöneticisi
            </div>
          </div>
        </div>

        {/* Birincil Eylem Butonu: + Yeni İndirme */}
        <div style={{ padding: '14px 14px 8px 14px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => {
              setNewDownloadInitialUrl('');
              setIsNewDownloadOpen(true);
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 10,
              border: 0,
              background: 'var(--accent-solid)',
              color: '#fff',
              fontSize: 12.5,
              fontWeight: 800,
              boxShadow: '0 4px 14px color-mix(in srgb, var(--accent-solid) 35%, transparent)',
              cursor: 'pointer',
            }}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Yeni İndirme</span>
          </button>
        </div>

        {/* Navigasyon Grupları (Kaydırılabilir Alan) */}
        <div
          style={{
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
          }}
        >
          {/* GRUP 1: DURUMLAR */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                padding: '0 8px',
                marginBottom: 4,
                letterSpacing: '0.04em',
              }}
            >
              Durumlar
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                {
                  id: 'all',
                  label: 'Tüm İndirmeler',
                  icon: <Download size={14} />,
                  count: counts.all,
                },
                {
                  id: 'downloading',
                  label: 'İndirilenler',
                  icon: <ArrowDownCircle size={14} color="#38bdf8" />,
                  count: counts.downloading,
                  pulse: counts.downloading > 0,
                },
                {
                  id: 'done',
                  label: 'Tamamlananlar',
                  icon: <CheckCircle2 size={14} color="#4ade80" />,
                  count: counts.done,
                },
                {
                  id: 'paused',
                  label: 'Duraklatılanlar',
                  icon: <PauseCircle size={14} color="#facc15" />,
                  count: counts.paused,
                },
                {
                  id: 'error',
                  label: 'Hatalar',
                  icon: <AlertCircle size={14} color="#f87171" />,
                  count: counts.error,
                },
              ].map(item => {
                const isActive =
                  tab === 'downloads' && categoryFilter === 'all' && filterTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTab('downloads');
                      setCategoryFilter('all');
                      setFilterTab(item.id as any);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: 0,
                      background: isActive
                        ? 'color-mix(in srgb, var(--accent-solid) 16%, transparent)'
                        : 'transparent',
                      color: isActive ? 'var(--accent-solid)' : 'var(--text)',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {item.icon}
                      <span>{item.label}</span>
                    </div>
                    {item.count > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 99,
                          background: isActive ? 'var(--accent-solid)' : 'var(--panel-2)',
                          color: isActive ? '#fff' : 'var(--muted)',
                        }}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* GRUP 2: KATEGORİLER */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                padding: '0 8px',
                marginBottom: 4,
                letterSpacing: '0.04em',
              }}
            >
              Kategoriler
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { id: 'video', label: 'Videolar', icon: <Video size={14} color="#38bdf8" /> },
                { id: 'audio', label: 'Müzik / Ses', icon: <Music size={14} color="#c084fc" /> },
                { id: 'document', label: 'Belgeler', icon: <FileText size={14} color="#fbbf24" /> },
                {
                  id: 'archive',
                  label: 'Sıkıştırılmış',
                  icon: <Archive size={14} color="#fb923c" />,
                },
                { id: 'program', label: 'Programlar', icon: <Cpu size={14} color="#34d399" /> },
              ].map(item => {
                const isActive = tab === 'downloads' && categoryFilter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTab('downloads');
                      setCategoryFilter(item.id as any);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: 0,
                      background: isActive
                        ? 'color-mix(in srgb, var(--accent-solid) 16%, transparent)'
                        : 'transparent',
                      color: isActive ? 'var(--accent-solid)' : 'var(--text)',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* GRUP 3: ARAÇLAR & MODÜLLER */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--muted)',
                textTransform: 'uppercase',
                padding: '0 8px',
                marginBottom: 4,
                letterSpacing: '0.04em',
              }}
            >
              Araçlar
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <button
                type="button"
                onClick={() => setTab('sniff')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: 0,
                  background:
                    tab === 'sniff'
                      ? 'color-mix(in srgb, var(--accent-solid) 16%, transparent)'
                      : 'transparent',
                  color: tab === 'sniff' ? 'var(--accent-solid)' : 'var(--text)',
                  fontWeight: tab === 'sniff' ? 700 : 500,
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Radio size={14} color="#f43f5e" />
                <span>Medya Yakalayıcı (Sniff)</span>
              </button>

              <button
                type="button"
                onClick={() => setTab('explorer')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 8,
                  border: 0,
                  background:
                    tab === 'explorer'
                      ? 'color-mix(in srgb, var(--accent-solid) 16%, transparent)'
                      : 'transparent',
                  color: tab === 'explorer' ? 'var(--accent-solid)' : 'var(--text)',
                  fontWeight: tab === 'explorer' ? 700 : 500,
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <FolderOpen size={14} color="#fbbf24" />
                <span>İndirilen Dosyalar</span>
              </button>
            </div>
          </div>
        </div>

        {/* SIDEBAR ALT BÖLÜM: Eklenti & Motor Durumu, Ayarlar, Hakkında */}
        <div
          style={{
            padding: '12px 14px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flexShrink: 0,
          }}
        >
          {status && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 8px',
                borderRadius: 6,
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                fontSize: 10,
                color: 'var(--muted)',
              }}
              className="tech-mono"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  title={status.binExists || status.pathExists ? 'yt-dlp aktif' : 'yt-dlp eksik'}
                >
                  yt-dlp:{' '}
                  <strong
                    style={{ color: status.binExists || status.pathExists ? '#4ade80' : '#f87171' }}
                  >
                    {status.binExists || status.pathExists ? '✓' : '✗'}
                  </strong>
                </span>
                <span>•</span>
                <span title={status.ffmpegOk ? 'ffmpeg aktif' : 'ffmpeg eksik'}>
                  ffmpeg:{' '}
                  <strong style={{ color: status.ffmpegOk ? '#4ade80' : '#f87171' }}>
                    {status.ffmpegOk ? '✓' : '✗'}
                  </strong>
                </span>
              </div>
              <span
                style={{
                  fontWeight: 700,
                  color: 'var(--accent-solid)',
                  background: 'color-mix(in srgb, var(--accent-solid) 12%, transparent)',
                  padding: '1px 6px',
                  borderRadius: 4,
                }}
              >
                v{appVersion}
              </span>
            </div>
          )}
          {/* Eklenti Durumu */}
          <div
            onClick={() => setIsExtModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: 8,
              background: extConnected ? 'var(--badge-success-bg)' : 'var(--panel-2)',
              border: extConnected
                ? '1px solid var(--badge-success-border)'
                : '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
              <Puzzle size={13} color={extConnected ? '#4ade80' : 'var(--muted)'} />
              <span style={{ fontWeight: 600, color: extConnected ? '#4ade80' : 'var(--muted)' }}>
                {extConnected ? 'Eklenti Bağlı' : 'Eklenti Kur'}
              </span>
            </div>
            <span style={{ fontSize: 9, opacity: 0.7 }}>{extConnected ? '✓' : '⚡'}</span>
          </div>

          {/* Ayarlar ve Hakkında Butonları */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <button
              type="button"
              onClick={() => setTab('settings')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '7px 8px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: tab === 'settings' ? 'var(--panel-2)' : 'transparent',
                color: tab === 'settings' ? 'var(--accent-solid)' : 'var(--muted)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <Settings size={13} />
              <span>Ayarlar</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('about')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '7px 8px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: tab === 'about' ? 'var(--panel-2)' : 'transparent',
                color: tab === 'about' ? 'var(--accent-solid)' : 'var(--muted)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <Info size={13} />
              <span>Hakkında</span>
            </button>
          </div>
        </div>
      </aside>

      {/* MERKEZ GÖRÜNÜM: Üst Toolbar + Aktif Panel */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {/* ÜST TOOLBAR (Modern Header) */}
        <header
          style={{
            height: 52,
            borderBottom: '1px solid var(--border)',
            background: 'var(--panel)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: 12,
            flexShrink: 0,
          }}
        >
          {/* Başlık */}
          <div
            style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-bright)', minWidth: 150 }}
          >
            {getPageTitle()}
          </div>

          {/* Anlık Hız Rozeti */}
          {totalSpeed && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 99,
                background: 'var(--badge-info-bg)',
                border: '1px solid var(--badge-info-border)',
                color: 'var(--badge-info-text)',
                fontSize: 11,
                fontWeight: 800,
              }}
              className="tech-mono"
            >
              <Zap size={13} color="var(--badge-info-text)" />
              <span>{totalSpeed}</span>
              <span style={{ fontSize: 9.5, opacity: 0.7 }}>
                • {jobs.filter(j => j.status === 'downloading').length} aktif
              </span>
            </div>
          )}

          {/* Arama Kutusu */}
          <div style={{ position: 'relative', width: 220, marginLeft: 'auto' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="İndirmelerde ara..."
              style={{
                width: '100%',
                padding: '6px 28px 6px 30px',
                borderRadius: 8,
                fontSize: 11,
                background: 'var(--panel-2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            />
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 9,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted)',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 0,
                  color: 'var(--muted)',
                  padding: 2,
                  display: 'flex',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Hız Sınırlayıcı */}
          <select
            value={speedLimitKB}
            onChange={async e => {
              const val = parseInt(e.target.value) || 0;
              setSpeedLimitKB(val);
              await window.api?.setSpeedLimit?.(val);
            }}
            style={{
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--panel-2)',
              color: 'var(--text)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <option value={0}>⚡ Sınırsız Hız</option>
            <option value={1024}>1 MB/s</option>
            <option value={2048}>2 MB/s</option>
            <option value={5120}>5 MB/s</option>
            <option value={10240}>10 MB/s</option>
          </select>

          {/* Pano İzleyici Toggle */}
          <button
            type="button"
            onClick={toggleClipboardWatcher}
            title="Panoya link kopyalandığında otomatik algılama"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 8,
              border: clipboardWatcherActive
                ? '1px solid var(--accent-solid)'
                : '1px solid var(--border)',
              background: clipboardWatcherActive
                ? 'color-mix(in srgb, var(--accent-solid) 12%, transparent)'
                : 'var(--panel-2)',
              color: clipboardWatcherActive ? 'var(--accent-solid)' : 'var(--muted)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: clipboardWatcherActive ? 'var(--accent-solid)' : 'var(--muted)',
              }}
            />
            <span>Pano İzleme</span>
          </button>

          {/* Hızlı Eylemler: Başlat / Durdur / Temizle / Klasör */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              onClick={handleResumeAll}
              title="Tüm İndirmeleri Başlat"
              style={{
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--panel-2)',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
              }}
            >
              <Play size={12} />
              <span>Başlat</span>
            </button>

            <button
              type="button"
              onClick={handlePauseAll}
              title="Tüm İndirmeleri Duraklat"
              style={{
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--panel-2)',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
              }}
            >
              <Pause size={12} />
              <span>Durdur</span>
            </button>

            <button
              type="button"
              onClick={handleClearFinished}
              title="Tamamlananları Listeden Temizle"
              style={{
                padding: '6px 8px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--panel-2)',
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
              }}
            >
              <Trash2 size={12} />
              <span>Temizle</span>
            </button>

            <button
              type="button"
              onClick={() => window.api?.openFolder?.(outDir)}
              title="İndirme Klasörünü Aç"
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: 0,
                background: 'var(--accent-solid)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              <FolderOpen size={13} />
              <span>Klasör</span>
            </button>
          </div>
        </header>

        {/* ANA İÇERİK ALANI */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', background: 'var(--bg)' }}>
          {tab === 'downloads' && (
            <QueuePanel
              jobs={jobs}
              filterTab={filterTab}
              categoryFilter={categoryFilter}
              searchQuery={searchQuery}
              onOpenNewDownload={() => setIsNewDownloadOpen(true)}
              onCancel={handleCancelJob}
              onMoveJob={handleMoveJob}
              onPause={id => {
                try {
                  window.api?.pauseDownload?.(id)?.catch?.(() => {});
                } catch {}
                setJobs(j =>
                  j.map(x => (x.id === id ? { ...x, status: 'paused', log: 'Duraklatıldı' } : x))
                );
              }}
              onResume={async job => {
                let res: any = null;
                try {
                  res = await window.api.resumeDownload({ id: job.id, opts: job.opts });
                } catch {}
                setJobs(j =>
                  j.map(x =>
                    x.id === job.id
                      ? {
                          ...x,
                          status: res?.queued ? 'queued' : 'downloading',
                          log: res?.queued ? 'Sırada…' : 'Devam ediyor...',
                        }
                      : x
                  )
                );
              }}
              onPauseAll={handlePauseAll}
              onResumeAll={handleResumeAll}
              onRetry={job => handleRetry(job as any)}
              onOpenFolder={() => window.api.openFolder(outDir)}
              onOpenFile={filePath => window.api.openFile(filePath)}
              onShowInFolder={filePath => window.api.showInFolder(filePath)}
              onRemoveJob={id => {
                handleRemoveJob(id);
                bumpFiles();
              }}
              onDeleteJob={(job, deleteFromDisk) => {
                handleDeleteJob(job, deleteFromDisk);
                bumpFiles();
              }}
              onClear={handleClearFinished}
            />
          )}

          {tab === 'sniff' && (
            <SniffPanel
              outDir={outDir}
              onStartDownload={handleStartDownload}
              onDirectDownload={handleDirectDownload}
              onHttpDownload={handleHttpDownload}
            />
          )}

          {tab === 'explorer' && (
            <FileExplorer
              refreshKey={filesRefreshKey}
              onRemoveJobs={keys => {
                if (!keys?.length) return;
                setJobs(prev => {
                  const n = prev.filter(
                    x =>
                      !keys.some(
                        k =>
                          (k.id && x.id === k.id) ||
                          (k.path && (x.filePath === k.path || x.opts?.outPath === k.path))
                      )
                  );
                  return n;
                });
              }}
            />
          )}

          {tab === 'settings' && <SettingsPanel />}
          {tab === 'about' && <AboutPanel />}
        </div>
      </main>

      {/* YENİ İNDİRME MODALI (VoltGet New Download Dialog) */}
      <NewDownloadModal
        isOpen={isNewDownloadOpen}
        onClose={() => setIsNewDownloadOpen(false)}
        outDir={outDir}
        initialUrl={newDownloadInitialUrl}
        onStartDownload={handleStartDownload}
      />

      {/* Eklenti Kurulum Modalı */}
      <ExtensionInstallModal
        isOpen={isExtModalOpen}
        onClose={() => setIsExtModalOpen(false)}
        connected={extConnected}
      />

      {/* Dosya Çakışma Diyaloğu */}
      {conflictInfo && (
        <FileConflictDialog
          info={conflictInfo}
          onResolve={(decision: string, remember: boolean) => {
            try {
              window.api
                ?.resolveFileConflict?.({
                  conflictId: conflictInfo.conflictId,
                  decision,
                  remember,
                })
                ?.catch?.(() => {});
            } catch {}
            setConflictInfo(null);
          }}
        />
      )}

      {/* Pano Bağlantı Algılama Bildirimi */}
      {clipboardDetectedUrl && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            background: 'var(--panel)',
            border: '1px solid var(--accent-solid)',
            borderRadius: 14,
            padding: '14px 18px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            maxWidth: 420,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 13,
                color: 'var(--accent-solid)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Download size={14} />
              <span>Panoda Bağlantı Algılandı</span>
            </div>
            <button
              type="button"
              onClick={() => setClipboardDetectedUrl(null)}
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            className="tech-mono"
          >
            {clipboardDetectedUrl}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                setNewDownloadInitialUrl(clipboardDetectedUrl);
                setClipboardDetectedUrl(null);
                setIsNewDownloadOpen(true);
              }}
              style={{
                border: 0,
                padding: '6px 14px',
                borderRadius: 8,
                background: 'var(--accent-solid)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              İndirmeyi Aç
            </button>
          </div>
        </div>
      )}

      {/* İndirme Tamamlandı Bildirimi */}
      {completedInfo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border-2)',
              borderRadius: 14,
              width: 420,
              boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: 'var(--panel-2)',
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                fontWeight: 800,
                fontSize: 13,
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <CheckCircle2 size={16} color="#22c55e" />
              <span>İndirme Tamamlandı</span>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, wordBreak: 'break-all' }}>
                {completedInfo.fileName || completedInfo.title}
              </div>
              {completedInfo.size > 0 && (
                <div style={{ fontSize: 11, color: 'var(--muted)' }} className="tech-mono">
                  {formatBytes(completedInfo.size)}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => {
                    if (completedInfo.filePath) window.api?.openFile?.(completedInfo.filePath);
                    setCompletedInfo(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    border: 0,
                    background: 'var(--accent-solid)',
                    color: '#fff',
                  }}
                >
                  Dosyayı Aç
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (completedInfo.filePath) window.api?.showInFolder?.(completedInfo.filePath);
                    setCompletedInfo(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    border: '1px solid var(--border)',
                    background: 'var(--panel-2)',
                    color: 'var(--text)',
                  }}
                >
                  Klasörde Göster
                </button>
                <button
                  type="button"
                  onClick={() => setCompletedInfo(null)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--muted)',
                    fontSize: 12,
                  }}
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
