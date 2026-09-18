import { useCallback, useEffect, useState } from 'react';
import { useAppSettings } from '../context/AppSettingsContext';
import { useToast } from '../context/ToastContext';
import { useFileList } from '../hooks/useFileList';
import { formatDate, isTemporaryOrPartialFile } from '../utils/files-client';
import { formatBytes } from '../utils/speed';
import { CATEGORY_ICONS } from './FileExplorer/FileIcon';

export interface DownloadedFile {
  id?: string;
  name: string;
  path: string;
  relativePath: string;
  folder: string;
  size: number;
  mtime: number;
  ext: string;
  category: 'video' | 'audio' | 'document' | 'archive' | 'installer' | 'other';
  url?: string;
  exists?: boolean;
  deletedFromDisk?: boolean;
}

type SourceMode = 'voltget' | 'all';
type StatusFilter = 'all' | 'existing' | 'deleted';
type CategoryType = 'all' | 'video' | 'audio' | 'document' | 'archive' | 'installer';
type SortType = 'date_desc' | 'date_asc' | 'size_desc' | 'size_asc' | 'name_asc';

export interface FileJobKey {
  id?: string;
  path?: string;
}

export default function FileExplorer({
  refreshKey,
  onRemoveJobs,
}: {
  refreshKey?: number;
  onRemoveJobs?: (keys: FileJobKey[]) => void;
}) {
  const { t } = useAppSettings();
  const toast = useToast();
  const reportError = toast.error;
  const [dir, setDir] = useState<string>('');
  const [files, setFiles] = useState<DownloadedFile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [sourceMode, setSourceMode] = useState<SourceMode>('voltget');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState<string>('');
  const [category, setCategory] = useState<CategoryType>('all');
  const [sort, setSort] = useState<SortType>('date_desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [deleteConfirm, setDeleteConfirm] = useState<DownloadedFile | null>(null);
  const [checksumModal, setChecksumModal] = useState<{
    file: DownloadedFile;
    md5: string;
    sha256: string;
    loading: boolean;
  } | null>(null);
  const [verifyHashInput, setVerifyHashInput] = useState<string>('');

  const handleCalculateChecksum = async (file: DownloadedFile) => {
    if (!file.path || file.deletedFromDisk) return;
    setVerifyHashInput('');
    setChecksumModal({
      file,
      md5: t('checksumCalculating'),
      sha256: t('checksumCalculating'),
      loading: true,
    });
    try {
      const [md5Res, shaRes] = await Promise.all([
        window.api?.computeFileHash?.(file.path, 'md5'),
        window.api?.computeFileHash?.(file.path, 'sha256'),
      ]);
      setChecksumModal({
        file,
        md5: md5Res?.hash || 'Hata',
        sha256: shaRes?.hash || 'Hata',
        loading: false,
      });
    } catch {
      setChecksumModal({
        file,
        md5: t('checksumFailed'),
        sha256: t('checksumFailed'),
        loading: false,
      });
    }
  };

  const loadFiles = useCallback(
    async (mode: SourceMode = sourceMode) => {
      if (!window.api?.listFiles) return;
      setLoading(true);
      try {
        const defaultDir = await window.api.getDefaultDir();
        setDir(defaultDir);
        const list = await window.api.listFiles(mode, defaultDir);
        setFiles((list || []).filter((f: DownloadedFile) => !isTemporaryOrPartialFile(f.name)));
      } catch (err: any) {
        reportError(t('filesLoadError') + ': ' + err.message);
      } finally {
        setLoading(false);
      }
    },
    [sourceMode, reportError, t]
  );

  useEffect(() => {
    loadFiles(sourceMode);
    const cleanup = window.api?.onDone?.(() => {
      loadFiles(sourceMode);
    });
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
    // refreshKey: kuyruk tarafından yapılan silmeler sonrası listeyi tazele
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode, loadFiles, refreshKey]);

  const categoryIcons: Record<string, string> = CATEGORY_ICONS;

  const { filteredFiles, totalBytes, counts } = useFileList(files, {
    statusFilter,
    category,
    search,
    sort,
  });

  const handleOpenFile = async (file: DownloadedFile) => {
    if (file.deletedFromDisk) {
      toast.warning(t('deletedFromDiskMsg'));
      return;
    }
    try {
      await window.api.openFile(file.path);
      toast.info(t('fileOpening').replace('{name}', file.name));
    } catch (e: any) {
      toast.error(t('fileOpenFailed') + ': ' + e.message);
    }
  };

  const handleShowInFolder = async (file: DownloadedFile) => {
    if (file.deletedFromDisk) {
      toast.warning(t('fileNotOnDisk'));
      return;
    }
    try {
      const ok = await window.api.showInFolder(file.path);
      if (ok) {
        toast.info(t('shownInFolder'));
      } else {
        toast.warning(t('fileNotFound'));
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDeleteFromDisk = async (file: DownloadedFile) => {
    try {
      const res = await window.api.deleteFile({
        filePath: file.path,
        deleteFromDisk: true,
        id: file.id,
      });
      if (res?.success) {
        setFiles(prev => prev.filter(f => f.path !== file.path && f.id !== file.id));
        onRemoveJobs?.([{ id: file.id, path: file.path }]);
        toast.success(t('fileDeletedToTrash').replace('{name}', file.name));
      } else {
        toast.error(t('deleteFailed') + ': ' + (res?.error || t('error')));
      }
    } catch (e: any) {
      toast.error(t('error') + ': ' + e.message);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleRemoveFromListOnly = async (file: DownloadedFile) => {
    try {
      const res = await window.api.deleteFile({
        filePath: file.path,
        deleteFromDisk: false,
        id: file.id,
      });
      if (res?.success) {
        setFiles(prev => prev.filter(f => f.path !== file.path && f.id !== file.id));
        onRemoveJobs?.([{ id: file.id, path: file.path }]);
        toast.info(t('fileRemovedFromList').replace('{name}', file.name));
      }
    } catch (e: any) {
      toast.error(t('error') + ': ' + e.message);
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <div
      style={{
        flex: 1,
        padding: 18,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Üst Başlık & Kaynak Modu Seçici */}
      <div className="card-premium glow-accent" style={{ borderRadius: 18, padding: 18 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              className="brand-gradient"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 20,
              }}
            >
              📁
            </span>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>
                {t('files')} - {t('filesHeader')}
              </div>
              <div
                className="text-muted"
                style={{ fontSize: 12, marginTop: 2, wordBreak: 'break-all' }}
              >
                {dir}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Kaynak Modu Değiştirici: VoltGet İndirmeleri vs Tüm Klasör */}
            <div
              style={{
                display: 'flex',
                background: 'var(--panel-2)',
                padding: 3,
                borderRadius: 10,
                border: '1px solid var(--border)',
              }}
            >
              <button
                onClick={() => setSourceMode('voltget')}
                style={{
                  border: 0,
                  padding: '7px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  background: sourceMode === 'voltget' ? 'var(--accent-solid)' : 'transparent',
                  color: sourceMode === 'voltget' ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
                title={t('voltgetDownloadsTooltip')}
              >
                {t('voltgetDownloads')}
              </button>
              <button
                onClick={() => setSourceMode('all')}
                style={{
                  border: 0,
                  padding: '7px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                  background: sourceMode === 'all' ? 'var(--accent-solid)' : 'transparent',
                  color: sourceMode === 'all' ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
                title={t('allFolderTooltip')}
              >
                {t('allFolder')}
              </button>
            </div>

            <button
              onClick={() => loadFiles(sourceMode)}
              style={{
                background: 'var(--panel-2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                padding: '8px 14px',
                borderRadius: 10,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              🔄 {t('refreshBtn')}
            </button>
            <button
              onClick={() => window.api.openFolder(dir)}
              className="brand-gradient"
              style={{
                color: '#fff',
                border: 0,
                padding: '8px 14px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              📂 {t('openFolderBtn')}
            </button>
          </div>
        </div>

        {/* Bilgi Çubuğu & Durum Filtreleri */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--border)',
            fontSize: 12,
            color: 'var(--muted)',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 16 }}>
            <div>
              {t('showingCount')}{' '}
              <strong style={{ color: 'var(--text)' }}>{filteredFiles.length}</strong>{' '}
              {t('filesWord')}
            </div>
            <div>
              {t('currentSize')}{' '}
              <strong style={{ color: 'var(--accent-solid)' }}>{formatBytes(totalBytes)}</strong>
            </div>
          </div>

          {/* Disk Durumu Filtresi */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => setStatusFilter('all')}
              style={{
                background: statusFilter === 'all' ? 'var(--panel)' : 'transparent',
                color: statusFilter === 'all' ? 'var(--text)' : 'var(--text-muted)',
                border:
                  '1px solid ' + (statusFilter === 'all' ? 'var(--accent-solid)' : 'transparent'),
                padding: '4px 9px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t('filterAll')} ({counts.all})
            </button>
            <button
              onClick={() => setStatusFilter('existing')}
              style={{
                background: statusFilter === 'existing' ? 'rgba(34, 197, 94, 0.15)' : 'transparent',
                color: statusFilter === 'existing' ? '#86efac' : 'var(--text-muted)',
                border: '1px solid ' + (statusFilter === 'existing' ? '#22c55e' : 'transparent'),
                padding: '4px 9px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t('filterExisting')} ({counts.existing})
            </button>
            {counts.deleted > 0 && (
              <button
                onClick={() => setStatusFilter('deleted')}
                style={{
                  background:
                    statusFilter === 'deleted' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                  color: statusFilter === 'deleted' ? '#fca5a5' : 'var(--text-muted)',
                  border: '1px solid ' + (statusFilter === 'deleted' ? '#ef4444' : 'transparent'),
                  padding: '4px 9px',
                  borderRadius: 7,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t('filterDeleted')} ({counts.deleted})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Arama, Kategori ve Sıralama Çubuğu */}
      <div
        className="card-premium"
        style={{ borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Arama Input */}
          <div style={{ flex: 1, minWidth: 220, position: 'relative' }}>
            <label htmlFor="voltget-file-search" className="sr-only">
              {t('searchPlaceholder')}
            </label>
            <input
              id="voltget-file-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 12 }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 0,
                  color: 'var(--muted)',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Sıralama */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label htmlFor="voltget-file-sort" style={{ fontSize: 12, color: 'var(--muted)' }}>
              {t('sortBy')}
            </label>
            <select
              id="voltget-file-sort"
              value={sort}
              onChange={e => setSort(e.target.value as SortType)}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                fontSize: 12,
                border: '1px solid var(--border)',
              }}
            >
              <option value="date_desc">{t('sortDateDesc')}</option>
              <option value="date_asc">{t('sortDateAsc')}</option>
              <option value="size_desc">{t('sortSizeDesc')}</option>
              <option value="size_asc">{t('sortSizeAsc')}</option>
              <option value="name_asc">{t('sortNameAsc')}</option>
            </select>
          </div>

          {/* Görünüm Modu */}
          <div
            style={{
              display: 'flex',
              background: 'var(--panel-2)',
              padding: 3,
              borderRadius: 10,
              border: '1px solid var(--border)',
            }}
          >
            <button
              onClick={() => setViewMode('grid')}
              style={{
                border: 0,
                padding: '6px 10px',
                borderRadius: 7,
                fontSize: 12,
                background: viewMode === 'grid' ? 'var(--accent-solid)' : 'transparent',
                color: viewMode === 'grid' ? '#fff' : 'var(--text)',
                cursor: 'pointer',
              }}
              title={t('viewGrid')}
            >
              {t('viewGrid')}
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                border: 0,
                padding: '6px 10px',
                borderRadius: 7,
                fontSize: 12,
                background: viewMode === 'list' ? 'var(--accent-solid)' : 'transparent',
                color: viewMode === 'list' ? '#fff' : 'var(--text)',
                cursor: 'pointer',
              }}
              title={t('viewList')}
            >
              {t('viewList')}
            </button>
          </div>
        </div>

        {/* Kategori Butonları */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: t('catAll') },
            { id: 'video', label: t('catVideos') },
            { id: 'audio', label: t('catAudio') },
            { id: 'archive', label: t('catArchives') },
            { id: 'document', label: t('catDocuments') },
            { id: 'installer', label: t('catInstallers') },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id as CategoryType)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                border:
                  '1px solid ' + (category === cat.id ? 'var(--accent-solid)' : 'var(--border)'),
                background:
                  category === cat.id
                    ? 'color-mix(in srgb, var(--accent-solid) 18%, var(--panel-2))'
                    : 'var(--panel-2)',
                color: category === cat.id ? 'var(--text)' : 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              <span>{categoryIcons[cat.id]}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dosyalar Alanı */}
      {loading ? (
        <div
          className="card-premium"
          style={{ padding: 40, textAlign: 'center', borderRadius: 16 }}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔄</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('scanningFiles')}</div>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div
          className="card-premium"
          style={{ padding: 48, textAlign: 'center', borderRadius: 16 }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{t('noFilesFoundTitle')}</div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
            {search ? t('noFilesSearch') : t('noFilesFilter')}
          </div>
          {sourceMode === 'voltget' && (
            <button
              onClick={() => setSourceMode('all')}
              style={{
                marginTop: 14,
                background: 'var(--panel-2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                padding: '8px 14px',
                borderRadius: 10,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {t('scanAllDownloads')}
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Izgara (Grid) Görünümü */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}
        >
          {filteredFiles.map(file => (
            <div
              key={file.path || file.id}
              className="card-premium"
              style={{
                borderRadius: 14,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                border: file.deletedFromDisk ? '1px solid rgba(239, 68, 68, 0.35)' : undefined,
                transition: 'transform 0.15s ease, border-color 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: file.deletedFromDisk ? 'rgba(239, 68, 68, 0.12)' : 'var(--panel-2)',
                    border:
                      '1px solid ' +
                      (file.deletedFromDisk ? 'rgba(239, 68, 68, 0.3)' : 'var(--border)'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  {categoryIcons[file.category] || '📄'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    title={file.name}
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: file.deletedFromDisk ? 'var(--text-muted)' : 'var(--text)',
                      textDecoration: file.deletedFromDisk ? 'line-through' : 'none',
                    }}
                  >
                    {file.name}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      alignItems: 'center',
                      fontSize: 11,
                      color: 'var(--muted)',
                      marginTop: 4,
                      flexWrap: 'wrap',
                    }}
                  >
                    {file.deletedFromDisk ? (
                      <span
                        style={{
                          background: 'var(--badge-danger-bg)',
                          color: 'var(--badge-danger-text)',
                          padding: '1px 7px',
                          borderRadius: 4,
                          border: '1px solid var(--badge-danger-border)',
                          fontWeight: 800,
                          fontSize: 10,
                        }}
                      >
                        {t('statusDeletedBadge')}
                      </span>
                    ) : (
                      <span>{formatBytes(file.size)}</span>
                    )}
                    <span>•</span>
                    <span
                      style={{
                        background: 'var(--panel-2)',
                        padding: '1px 6px',
                        borderRadius: 4,
                        border: '1px solid var(--border)',
                        fontSize: 10,
                      }}
                    >
                      {file.folder || t('mainFolder')}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{formatDate(file.mtime)}</div>

              {/* Hızlı Butonlar */}
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginTop: 'auto',
                  paddingTop: 8,
                  borderTop: '1px solid var(--border)',
                }}
              >
                {!file.deletedFromDisk ? (
                  <>
                    <button
                      onClick={() => handleOpenFile(file)}
                      className="brand-gradient"
                      style={{
                        flex: 1,
                        border: 0,
                        padding: '7px 10px',
                        borderRadius: 8,
                        color: '#fff',
                        fontSize: 11,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      ▶️ {t('actionOpen')}
                    </button>
                    <button
                      onClick={() => handleShowInFolder(file)}
                      title={t('showInFolderTooltipLong')}
                      style={{
                        background: 'var(--panel-2)',
                        border: '1px solid var(--border)',
                        padding: '7px 10px',
                        borderRadius: 8,
                        color: 'var(--text)',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      📂 {t('actionLocation')}
                    </button>
                    <button
                      onClick={() => handleCalculateChecksum(file)}
                      title={t('checksumTitle')}
                      style={{
                        background: 'var(--panel-2)',
                        border: '1px solid var(--border)',
                        padding: '7px 9px',
                        borderRadius: 8,
                        color: 'var(--text)',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      #️⃣ Hash
                    </button>
                  </>
                ) : (
                  <div
                    style={{
                      flex: 1,
                      fontSize: 11,
                      color: 'var(--badge-danger-text)',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {t('fileDeletedNotice')}
                  </div>
                )}
                <button
                  onClick={() => setDeleteConfirm(file)}
                  title={t('deleteOrRemoveTitle')}
                  style={{
                    background: 'var(--badge-danger-bg)',
                    border: '1px solid var(--badge-danger-border)',
                    padding: '7px 10px',
                    borderRadius: 8,
                    color: 'var(--badge-danger-text)',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Liste (Table) Görünümü */
        <div className="card-premium" style={{ borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}
            >
              <thead>
                <tr
                  style={{
                    background: 'var(--panel-2)',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--muted)',
                  }}
                >
                  <th style={{ padding: '12px 14px' }}>{t('thFileName')}</th>
                  <th style={{ padding: '12px 14px' }}>{t('thFolder')}</th>
                  <th style={{ padding: '12px 14px' }}>{t('thSizeStatus')}</th>
                  <th style={{ padding: '12px 14px' }}>{t('thDate')}</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>{t('thActions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map(file => (
                  <tr
                    key={file.path || file.id}
                    style={{ borderBottom: '1px solid var(--border)' }}
                  >
                    <td style={{ padding: '10px 14px', maxWidth: 320 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{categoryIcons[file.category] || '📄'}</span>
                        <span
                          title={file.name}
                          style={{
                            fontWeight: 600,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: file.deletedFromDisk ? 'var(--text-muted)' : 'var(--text)',
                            textDecoration: file.deletedFromDisk ? 'line-through' : 'none',
                          }}
                        >
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>
                      {file.folder || t('mainFolder')}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                      {file.deletedFromDisk ? (
                        <span
                          style={{
                            background: 'var(--badge-danger-bg)',
                            color: 'var(--badge-danger-text)',
                            padding: '2px 7px',
                            borderRadius: 4,
                            border: '1px solid var(--badge-danger-border)',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {t('statusDeletedBadge')}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--accent-solid)' }}>
                          {formatBytes(file.size)}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>
                      {formatDate(file.mtime)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {!file.deletedFromDisk && (
                          <>
                            <button
                              onClick={() => handleOpenFile(file)}
                              className="brand-gradient"
                              style={{
                                border: 0,
                                padding: '5px 9px',
                                borderRadius: 6,
                                color: '#fff',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              {t('actionOpen')}
                            </button>
                            <button
                              onClick={() => handleShowInFolder(file)}
                              title={t('actionLocation')}
                              style={{
                                background: 'var(--panel-2)',
                                border: '1px solid var(--border)',
                                padding: '5px 9px',
                                borderRadius: 6,
                                color: 'var(--text)',
                                fontSize: 11,
                                cursor: 'pointer',
                              }}
                            >
                              📂
                            </button>
                            <button
                              onClick={() => handleCalculateChecksum(file)}
                              title={t('checksumTitle')}
                              style={{
                                background: 'var(--panel-2)',
                                border: '1px solid var(--border)',
                                padding: '5px 8px',
                                borderRadius: 6,
                                color: 'var(--text)',
                                fontSize: 11,
                                cursor: 'pointer',
                              }}
                            >
                              #️⃣
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setDeleteConfirm(file)}
                          title={t('deleteOrRemoveTitle')}
                          style={{
                            background: 'var(--badge-danger-bg)',
                            border: '1px solid var(--badge-danger-border)',
                            padding: '5px 9px',
                            borderRadius: 6,
                            color: 'var(--badge-danger-text)',
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          {t('actionDelete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Silme & Kaldırma Seçenekleri Modalı */}
      {deleteConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            className="card-premium"
            style={{
              width: 440,
              borderRadius: 16,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              border: '1px solid var(--accent-solid)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                color: 'var(--accent-solid)',
                fontWeight: 900,
                fontSize: 15,
              }}
            >
              <span>🗑️</span> {t('deleteOrRemoveTitle')}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text)' }}>
              {t('deleteOrRemovePrompt')}
            </div>
            <div
              style={{
                background: 'var(--panel-2)',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                fontSize: 11,
                wordBreak: 'break-all',
              }}
            >
              <strong>{deleteConfirm.name}</strong>
              <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
                {deleteConfirm.path}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => handleRemoveFromListOnly(deleteConfirm)}
                style={{
                  background: 'var(--panel-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  padding: '10px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                {t('removeOnlyList')}
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 400,
                    color: 'var(--text-muted)',
                    marginTop: 2,
                  }}
                >
                  {t('removeOnlyListDesc')}
                </div>
              </button>

              {!deleteConfirm.deletedFromDisk && (
                <button
                  onClick={() => handleDeleteFromDisk(deleteConfirm)}
                  style={{
                    background: 'rgba(220, 38, 38, 0.15)',
                    color: '#fca5a5',
                    border: '1px solid rgba(220, 38, 38, 0.35)',
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {t('deleteFromDisk')}
                  <div style={{ fontSize: 10, fontWeight: 400, color: '#fca5a5', marginTop: 2 }}>
                    {t('deleteFromDiskDesc')}
                  </div>
                </button>
              )}

              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: 0,
                  padding: '8px 14px',
                  fontSize: 12,
                  cursor: 'pointer',
                  marginTop: 2,
                }}
              >
                {t('cancelAction')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Checksum / Hash Doğrulama Modalı */}
      {checksumModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(6px)',
          }}
        >
          <div
            className="card-premium"
            style={{
              width: 520,
              borderRadius: 16,
              padding: 22,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              border: '1px solid var(--accent-solid)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: 'var(--accent-solid)',
                fontWeight: 900,
                fontSize: 15,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>#️⃣</span> {t('checksumTitle')}
              </div>
              <button
                onClick={() => {
                  setChecksumModal(null);
                  setVerifyHashInput('');
                }}
                style={{
                  background: 'transparent',
                  border: 0,
                  color: 'var(--text-muted)',
                  fontSize: 16,
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                background: 'var(--panel-2)',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                fontSize: 11,
                wordBreak: 'break-all',
              }}
            >
              <strong>{checksumModal.file.name}</strong>
              <div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 2 }}>
                {formatBytes(checksumModal.file.size)} • {checksumModal.file.path}
              </div>
            </div>

            {/* SHA-256 */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                  SHA-256
                </span>
                <button
                  disabled={checksumModal.loading}
                  onClick={() => {
                    navigator.clipboard.writeText(checksumModal.sha256);
                    toast.success(t('hashCopiedSha256'));
                  }}
                  style={{
                    background: 'var(--panel-2)',
                    border: '1px solid var(--border)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 10,
                    cursor: 'pointer',
                    color: 'var(--text)',
                  }}
                >
                  📋 {t('copy')}
                </button>
              </div>
              <div
                style={{
                  background: 'var(--panel-2)',
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              >
                {checksumModal.sha256}
              </div>
            </div>

            {/* MD5 */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                  MD5
                </span>
                <button
                  disabled={checksumModal.loading}
                  onClick={() => {
                    navigator.clipboard.writeText(checksumModal.md5);
                    toast.success(t('hashCopiedMd5'));
                  }}
                  style={{
                    background: 'var(--panel-2)',
                    border: '1px solid var(--border)',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 10,
                    cursor: 'pointer',
                    color: 'var(--text)',
                  }}
                >
                  📋 {t('copy')}
                </button>
              </div>
              <div
                style={{
                  background: 'var(--panel-2)',
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              >
                {checksumModal.md5}
              </div>
            </div>

            {/* Karşılaştırma & Doğrulama Kutusu */}
            <div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  display: 'block',
                  marginBottom: 4,
                }}
              >
                {t('checksumCompare')}
              </span>
              <input
                type="text"
                value={verifyHashInput}
                onChange={e => setVerifyHashInput(e.target.value.trim().toLowerCase())}
                placeholder="MD5 / SHA-256 / SHA-1..."
                style={{
                  width: '100%',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: 11,
                  color: 'var(--text)',
                  boxSizing: 'border-box',
                }}
              />
              {verifyHashInput && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700 }}>
                  {verifyHashInput === checksumModal.sha256.toLowerCase() ||
                  verifyHashInput === checksumModal.md5.toLowerCase() ? (
                    <span style={{ color: '#22c55e' }}>{t('checksumMatch')}</span>
                  ) : (
                    <span style={{ color: '#ef4444' }}>{t('checksumMismatch')}</span>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                onClick={() => {
                  setChecksumModal(null);
                  setVerifyHashInput('');
                }}
                className="brand-gradient"
                style={{
                  border: 0,
                  padding: '8px 16px',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
