import { useEffect, useState } from 'react';
import AboutPanel from './components/AboutPanel';
import DownloadPanel from './components/DownloadPanel';
import ExtensionInstallModal from './components/ExtensionInstallModal';
import FileConflictDialog from './components/FileConflictDialog';
import FileExplorer from './components/FileExplorer';
import QueuePanel from './components/QueuePanel';
import SettingsPanel from './components/SettingsPanel';
import SniffPanel from './components/SniffPanel';
import VoltLogo from './components/VoltLogo';
import { useAppSettings } from './context/AppSettingsContext';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useJobs, type Job } from './hooks/useJobs';
import { formatBytes } from './utils/speed';

export type { Job };

export default function App() {
  const { t } = useAppSettings();
  const [tab, setTab] = useState<'download' | 'sniff' | 'explorer' | 'settings' | 'about'>(
    'download'
  );
  const [downloadModal, setDownloadModal] = useState<any>(null);
  const [isExtModalOpen, setIsExtModalOpen] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<any>(null);
  const [completedInfo, setCompletedInfo] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
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
    setStatus,
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

  useEffect(() => {
    if (!hasApi) return;
    const cleanups = [
      window.api.onOpenSniffItem(() => setTab('sniff')),
      window.api.onSwitchToSniffTab(() => setTab('sniff')),
      window.api.onSwitchToDownloadTab(() => setTab('download')),
      window.api.onSwitchToSettingsTab(() => setTab('settings')),
      window.api.onFileConflict(d => {
        if (d?.conflictId) setConflictInfo(d);
      }),
      window.api.onDone(d => {
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

  const titles: Record<string, string> = {
    download: '🔗 ' + t('linkDownload'),
    sniff: '🎯 ' + t('autoSniffer'),
    explorer: '📁 ' + t('files'),
    settings: '⚙️ ' + t('settings'),
    about: 'ℹ️ ' + t('about'),
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
        if (url) {
          setDownloadModal({
            sniff: {
              url: url,
              filename: '',
              pageUrl: url,
            },
            formats: [],
          });
        }
      }}
    >
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            gap: 20,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <div style={{ fontSize: 72, animation: 'bounce 1s infinite' }}>📦</div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: '#fff',
              background: 'rgba(59, 130, 246, 0.2)',
              padding: '16px 32px',
              borderRadius: 16,
              border: '2px dashed var(--accent-solid)',
              boxShadow: '0 20px 40px rgba(59, 130, 246, 0.3)',
            }}
          >
            ✨ Bağlantıyı buraya sürükleyin
          </div>
          <div className="text-muted" style={{ fontSize: 13, animation: 'pulse 1.5s infinite' }}>
            URL veya dosya bileşenini açın
          </div>
        </div>
      )}
      <div
        style={{
          width: 224,
          background: 'var(--panel-3)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: 14,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '4px 4px 14px 4px',
            borderBottom: '1px solid var(--border)',
            marginBottom: 12,
          }}
        >
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <VoltLogo size={36} />
            <span
              style={{
                position: 'absolute',
                bottom: -1,
                right: -1,
                width: 9,
                height: 9,
                borderRadius: 99,
                background: extConnected ? '#22c55e' : '#3b82f6',
                border: '2px solid var(--panel-3)',
                boxShadow: extConnected ? '0 0 8px #22c55e' : 'none',
              }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                className="brand-title-gradient"
                style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.02em' }}
              >
                VoltGet
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 900,
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: 'var(--accent-solid)',
                  color: '#fff',
                }}
              >
                PRO
              </span>
            </div>
            <div
              className="text-muted"
              style={{
                fontSize: 10,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t('idmAlt')}
            </div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { id: 'download', icon: '⬇️', label: t('navDownload'), desc: t('navDownloadDesc') },
            { id: 'sniff', icon: '🎯', label: t('navSniff'), desc: t('navSniffDesc') },
            { id: 'explorer', icon: '📁', label: t('navExplorer'), desc: t('navExplorerDesc') },
          ].map(item => {
            const activeDownloads = jobs.filter(
              j => j.status === 'downloading' || j.status === 'queued'
            ).length;
            const isCurrent = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id as any)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid ' + (isCurrent ? 'var(--nav-active-border)' : 'transparent'),
                  background: isCurrent ? 'var(--nav-active-bg)' : 'transparent',
                  color: isCurrent ? 'var(--nav-active-text)' : 'var(--text)',
                  textAlign: 'left',
                  boxShadow: isCurrent
                    ? '0 4px 18px color-mix(in srgb, var(--accent-solid) 12%, transparent)'
                    : 'none',
                  transition: 'all 0.16s ease',
                }}
              >
                {isCurrent && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 8,
                      bottom: 8,
                      width: 3,
                      borderRadius: '0 4px 4px 0',
                      background: 'var(--accent-solid)',
                      boxShadow: '0 0 10px var(--accent-solid)',
                    }}
                  />
                )}
                <span style={{ fontSize: 17 }}>{item.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: isCurrent ? 800 : 600,
                      color: isCurrent ? 'var(--nav-active-text)' : 'var(--text)',
                    }}
                  >
                    {item.label}
                  </div>
                  <div className="text-muted" style={{ fontSize: 10 }}>
                    {item.desc}
                  </div>
                </span>
                {item.id === 'download' && activeDownloads > 0 && (
                  <span
                    style={{
                      background: 'var(--accent-solid)',
                      color: '#fff',
                      padding: '2px 7px',
                      borderRadius: 99,
                      fontSize: 10,
                      fontWeight: 900,
                      boxShadow:
                        '0 2px 8px color-mix(in srgb, var(--accent-solid) 50%, transparent)',
                    }}
                  >
                    {activeDownloads}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { id: 'settings', icon: '⚙️', label: t('navSettings'), desc: t('navSettingsDesc') },
            { id: 'about', icon: 'ℹ️', label: t('navAbout'), desc: t('navAboutDesc') },
          ].map(item => {
            const isCurrent = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id as any)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: '9px 12px',
                  borderRadius: 12,
                  border: '1px solid ' + (isCurrent ? 'var(--nav-active-border)' : 'transparent'),
                  background: isCurrent ? 'var(--nav-active-bg)' : 'transparent',
                  color: isCurrent ? 'var(--nav-active-text)' : 'var(--text)',
                  textAlign: 'left',
                  transition: 'all 0.16s ease',
                }}
              >
                {isCurrent && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 7,
                      bottom: 7,
                      width: 3,
                      borderRadius: '0 4px 4px 0',
                      background: 'var(--accent-solid)',
                      boxShadow: '0 0 10px var(--accent-solid)',
                    }}
                  />
                )}
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                <span>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: isCurrent ? 800 : 600,
                      color: isCurrent ? 'var(--nav-active-text)' : 'var(--text)',
                    }}
                  >
                    {item.label}
                  </div>
                  <div className="text-muted" style={{ fontSize: 10 }}>
                    {item.desc}
                  </div>
                </span>
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        {/* Tarayıcı Eklentisi Durum Kartı */}
        <div
          onClick={() => setIsExtModalOpen(true)}
          style={{
            cursor: 'pointer',
            padding: '10px 12px',
            borderRadius: 14,
            marginBottom: 10,
            border: extConnected
              ? '1px solid rgba(34, 197, 94, 0.4)'
              : '1px solid rgba(234, 179, 8, 0.35)',
            background: extConnected ? 'rgba(34, 197, 94, 0.08)' : 'rgba(234, 179, 8, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            transition: 'all 0.16s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 99,
              background: extConnected ? '#22c55e' : '#eab308',
              boxShadow: extConnected ? '0 0 10px #22c55e' : 'none',
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: extConnected ? '#86efac' : '#fde047',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {extConnected ? 'Eklenti Bağlı ✓' : 'Eklenti Kurulumu ⚡'}
            </div>
            <div
              className="text-muted"
              style={{
                fontSize: 9,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {extConnected ? 'IDM Yakalayıcı Aktif' : 'Chrome & Firefox'}
            </div>
          </div>
        </div>

        {status && (
          <div
            style={{
              borderRadius: 12,
              padding: '10px 12px',
              fontSize: 11,
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <span>⚡</span> Motor Durumu
              </span>
              <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 800 }}>HAZIR</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '3px 6px',
                  background: 'var(--panel-3)',
                  borderRadius: 6,
                  fontSize: 10,
                }}
              >
                <span className="text-muted">yt-dlp</span>
                <span
                  style={{
                    color: status.binExists || status.pathExists ? '#22c55e' : '#f87171',
                    fontWeight: 800,
                  }}
                >
                  {status.binExists || status.pathExists ? '✓' : '✗'}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '3px 6px',
                  background: 'var(--panel-3)',
                  borderRadius: 6,
                  fontSize: 10,
                }}
              >
                <span className="text-muted">ffmpeg</span>
                <span style={{ color: status.ffmpegOk ? '#22c55e' : '#f87171', fontWeight: 800 }}>
                  {status.ffmpegOk ? '✓' : '✗'}
                </span>
              </div>
            </div>
            <div
              className="text-muted"
              style={{
                fontSize: 9,
                marginTop: 6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                opacity: 0.75,
              }}
              title={outDir}
            >
              📂 {outDir}
            </div>
          </div>
        )}
        <div className="text-muted" style={{ fontSize: 10, marginTop: 10, textAlign: 'center' }}>
          v{appVersion} • {t('idmAlt')}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div
          className="glass"
          style={{
            height: 54,
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-bright)' }}>
            {titles[tab]}
          </div>
          {totalSpeed && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--badge-info-bg)',
                border: '1px solid var(--badge-info-border)',
                padding: '4px 10px',
                borderRadius: 20,
                color: 'var(--badge-info-text)',
                fontSize: 11,
                fontWeight: 900,
                boxShadow: '0 0 14px color-mix(in srgb, var(--accent-solid) 20%, transparent)',
              }}
            >
              <span style={{ animation: 'pulse 1s infinite' }}>⚡</span>
              <span>{totalSpeed}</span>
              <span style={{ fontSize: 9, opacity: 0.8 }}>
                • {jobs.filter(j => j.status === 'downloading').length} aktif
              </span>
            </div>
          )}
          <div style={{ flex: 1 }} />

          {/* Hızlı Hız Sınırlayıcı */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <select
              value={speedLimitKB}
              onChange={async e => {
                const val = parseInt(e.target.value) || 0;
                setSpeedLimitKB(val);
                await window.api?.setSpeedLimit?.(val);
              }}
              title={t('speedLimiter')}
              style={{
                background: speedLimitKB > 0 ? 'var(--badge-warning-bg)' : 'var(--panel-2)',
                color: speedLimitKB > 0 ? 'var(--badge-warning-text)' : 'var(--text)',
                border:
                  '1px solid ' +
                  (speedLimitKB > 0 ? 'var(--badge-warning-border)' : 'var(--border)'),
                padding: '6px 9px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value={0}>⚡ {t('speedUnlimited')}</option>
              <option value={500}>🐢 500 KB/s</option>
              <option value={1024}>🐢 1 MB/s</option>
              <option value={2048}>⚡ 2 MB/s</option>
              <option value={5120}>⚡ 5 MB/s</option>
              <option value={10240}>🚀 10 MB/s</option>
              <option value={20480}>🚀 20 MB/s</option>
            </select>
          </div>

          {/* Pano İzleyici Hızlı Geçiş Butonu */}
          <button
            onClick={toggleClipboardWatcher}
            title="Panoya bir link kopyalandığında otomatik algılama"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: clipboardWatcherActive ? 'var(--badge-info-bg)' : 'var(--panel-2)',
              color: clipboardWatcherActive ? 'var(--badge-info-text)' : 'var(--muted)',
              border:
                '1px solid ' +
                (clipboardWatcherActive ? 'var(--badge-info-border)' : 'var(--border)'),
              padding: '6px 11px',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 99,
                background: clipboardWatcherActive ? 'var(--accent-solid)' : 'var(--muted)',
              }}
            />
            <span>
              {clipboardWatcherActive ? t('clipboardWatcherOn') : t('clipboardWatcherOff')}
            </span>
          </button>

          <button
            onClick={() => setIsExtModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: extConnected ? 'var(--badge-success-bg)' : 'var(--badge-warning-bg)',
              color: extConnected ? 'var(--badge-success-text)' : 'var(--badge-warning-text)',
              border: extConnected
                ? '1px solid var(--badge-success-border)'
                : '1px solid var(--badge-warning-border)',
              padding: '6px 12px',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            <span>{extConnected ? '🟢' : '🧩'}</span>
            <span>{extConnected ? t('extConnectedBadge') : t('extSetupBadge')}</span>
          </button>
          <button
            onClick={() => window.api.getYtDlpStatus().then(setStatus)}
            style={{
              background: 'var(--panel-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              padding: '7px 12px',
              borderRadius: 10,
              fontSize: 11,
            }}
          >
            {t('refresh')}
          </button>
          <button
            onClick={() => window.api.openFolder(outDir)}
            className="brand-gradient"
            style={{
              color: '#fff',
              border: 0,
              padding: '7px 12px',
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            📂 {t('folder')}
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg-2)' }}>
          {tab === 'download' && (
            <DownloadPanel
              outDir={outDir}
              onStartDownload={handleStartDownload}
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
          {tab === 'explorer' && <FileExplorer />}
          {tab === 'settings' && <SettingsPanel />}
          {tab === 'about' && <AboutPanel />}
        </div>
      </div>

      {/* Sağ Sidebar - Kuyruk */}
      <div style={{ width: 280, minWidth: 280, borderLeft: '1px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <QueuePanel
          jobs={jobs}
          onCancel={handleCancelJob}
          onMoveJob={handleMoveJob}
          onPause={id => {
            try {
              window.api?.pauseDownload?.(id)?.catch?.(() => {});
            } catch {}
            setJobs(j =>
              j.map(x => (x.id === id ? { ...x, status: 'paused', log: 'Duraklatıldı' } : x))
            );
            try {
              window.api?.saveQueue?.(
                jobs.map(x => (x.id === id ? { ...x, status: 'paused', log: 'Duraklatıldı' } : x))
              );
            } catch {}
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
          onPauseAll={async () => {
            try {
              await window.api.pauseAllDownloads?.();
            } catch {}
            setJobs(j => {
              const n = j.map(x =>
                x.status === 'downloading' || x.status === 'queued'
                  ? { ...x, status: 'paused' as const, log: 'Duraklatıldı' }
                  : x
              );
              try {
                window.api?.saveQueue?.(n);
              } catch {}
              return n;
            });
          }}
          onResumeAll={async () => {
            try {
              await window.api.resumeAllDownloads?.();
            } catch {}
            setJobs(j => {
              const n = j.map(x =>
                x.status === 'paused'
                  ? { ...x, status: 'downloading' as const, log: 'Devam ediyor...' }
                  : x
              );
              try {
                window.api?.saveQueue?.(n);
              } catch {}
              return n;
            });
          }}
          onRetry={job => handleRetry(job as any)}
          onOpenFolder={() => window.api.openFolder(outDir)}
          onOpenFile={filePath => window.api.openFile(filePath)}
        onShowInFolder={filePath => window.api.showInFolder(filePath)}
        onRemoveJob={handleRemoveJob}
        onDeleteJob={handleDeleteJob}
        onImportJobs={imported => {
          const stamp = Date.now().toString(36);
          setJobs(j => {
            const existing = new Set(j.map(x => x.url));
            const fresh = (imported || [])
              .filter((x: any) => x?.url && !existing.has(x.url))
              .map((x: any, i: number) => ({
                id: `${stamp}${i}`,
                url: x.url,
                title: (x.title || x.url).slice(0, 70),
                percent: 0,
                speed: '-',
                eta: '-',
                total: '',
                status: 'paused' as const,
                log: 'İçe aktarıldı',
                opts: x.opts,
              }));
            const n = [...fresh, ...j];
            try {
              window.api?.saveQueue?.(n);
            } catch {}
            return n;
          });
        }}
        onClear={() =>
          setJobs(j => {
            const n = j.filter(
              x => x.status === 'downloading' || x.status === 'queued' || x.status === 'paused'
            );
            try {
              window.api?.saveQueue?.(n);
            } catch {}
            // Hata veren/biten kayıtları history'den de temizle
            try {
              j.filter(x => x.status === 'done' || x.status === 'error').forEach(x => {
                window.api?.removeFromHistory?.(x.id)?.catch?.(() => {});
              });
            } catch {}
            return n;
          })
        }
      />
      </div>

      {/* IDM Tarzı Gelişmiş Dosya Özellikleri ve İndirme Penceresi (Download Properties Dialog) */}
      {downloadModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            animation: 'fadeIn 0.2s',
          }}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--accent-solid)',
              borderRadius: 16,
              width: 500,
              boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                background: 'var(--panel-2)',
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 14,
                  color: 'var(--accent-solid)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>🛡️</span> {t('idmPropsTitle')}
              </div>
              <button
                onClick={() => setDownloadModal(null)}
                style={{
                  background: 'transparent',
                  border: 0,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: 'bold',
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  {t('idmAddressLabel')}
                </label>
                <div
                  style={{
                    fontSize: 11,
                    background: 'var(--panel-2)',
                    padding: '8px 10px',
                    borderRadius: 8,
                    wordBreak: 'break-all',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                >
                  {downloadModal.sniff.url}
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  {t('idmSaveDirLabel')}
                </label>
                <div
                  style={{
                    fontSize: 11,
                    background: 'var(--panel-2)',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    color: 'var(--accent-solid)',
                    fontWeight: 700,
                  }}
                >
                  {outDir}
                </div>
              </div>

              {downloadModal.formats && downloadModal.formats.length > 0 && (
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      display: 'block',
                      marginBottom: 4,
                    }}
                  >
                    {t('idmQualitySelectLabel')}
                  </label>
                  <select
                    id="idm-format-select"
                    style={{
                      width: '100%',
                      background: 'var(--panel-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      padding: '10px',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  >
                    {downloadModal.formats.map((f: any) => (
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
                    const sniff = downloadModal.sniff;
                    const selFormat = (
                      document.getElementById('idm-format-select') as HTMLSelectElement
                    )?.value;
                    setDownloadModal(null);
                    setTab('download');
                    const isGen =
                      /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(
                        sniff.url
                      );
                    if (isGen || sniff.url.endsWith('.pdf')) {
                      await handleHttpDownload({
                        url: sniff.url,
                        outDir,
                        filename: sniff.filename,
                      });
                    } else if (selFormat) {
                      await handleStartDownload({
                        url: sniff.url,
                        outDir,
                        formatId: selFormat,
                        pageUrl: sniff.pageUrl,
                        title: sniff.filename || 'Video',
                      });
                    } else {
                      await handleDirectDownload({
                        url: sniff.url,
                        outDir,
                        pageUrl: sniff.pageUrl,
                        title: sniff.filename || 'İndirme',
                      });
                    }
                  }}
                  className="brand-gradient"
                  style={{
                    flex: 1,
                    border: 0,
                    padding: '12px',
                    borderRadius: 10,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow:
                      '0 6px 20px color-mix(in srgb, var(--accent-solid) 40%, transparent)',
                  }}
                >
                  🚀 {t('idmStartDownload')}
                </button>
                <button
                  onClick={() => setDownloadModal(null)}
                  style={{
                    background: 'var(--panel-2)',
                    border: '1px solid var(--border)',
                    padding: '12px 18px',
                    borderRadius: 10,
                    color: 'var(--text)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
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
        <div
          style={{
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
            animation: 'slideUp 0.25s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 13,
                color: '#60a5fa',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>📋</span> <span>{t('clipboardDetectedTitle')}</span>
            </div>
            <button
              onClick={() => setClipboardDetectedUrl(null)}
              style={{
                background: 'transparent',
                border: 0,
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: 13,
                padding: '2px 6px',
              }}
            >
              ✕
            </button>
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#cbd5e1',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              background: 'rgba(0, 0, 0, 0.4)',
              padding: '6px 8px',
              borderRadius: 8,
            }}
          >
            {clipboardDetectedUrl}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                handleStartDownload({ url: clipboardDetectedUrl, outDir });
                setClipboardDetectedUrl(null);
                setTab('download');
              }}
              className="brand-gradient"
              style={{
                border: 0,
                padding: '8px 14px',
                borderRadius: 8,
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              🚀 {t('downloadNowBtn')}
            </button>
            <button
              onClick={() => {
                setTab('download');
                setClipboardDetectedUrl(null);
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--border)',
                padding: '8px 12px',
                borderRadius: 8,
                color: '#cbd5e1',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {t('inspectBtn')}
            </button>
          </div>
        </div>
      )}

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

      {/* İndirme Tamamlandı Diyaloğu */}
      {completedInfo && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--accent-solid)',
              borderRadius: 16,
              width: 420,
              maxWidth: '92vw',
              boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: 'var(--panel-2)',
                padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
                fontWeight: 900,
                fontSize: 14,
                color: '#22c55e',
              }}
            >
              ✓ {t('downloadDoneTitle')}
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, wordBreak: 'break-all' }}>
                {completedInfo.fileName || completedInfo.title}
              </div>
              {completedInfo.size > 0 && (
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {formatBytes(completedInfo.size)}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    if (completedInfo.filePath) window.api?.openFile?.(completedInfo.filePath);
                    setCompletedInfo(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '9px 8px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: 0,
                    background: 'var(--accent-solid)',
                    color: '#fff',
                  }}
                >
                  ⚡ {t('openFile')}
                </button>
                <button
                  onClick={() => {
                    if (completedInfo.filePath) window.api?.showInFolder?.(completedInfo.filePath);
                    setCompletedInfo(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '9px 8px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'var(--panel-2)',
                    color: 'var(--text)',
                  }}
                >
                  📁 {t('showInFolder')}
                </button>
                <button
                  onClick={() => setCompletedInfo(null)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 10,
                    fontSize: 12,
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                  }}
                >
                  ✕
                </button>
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  onChange={e => {
                    if (e.target.checked) window.api?.setConfig?.({ completionDialog: false });
                  }}
                />
                {t('dontShowAgain')}
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
