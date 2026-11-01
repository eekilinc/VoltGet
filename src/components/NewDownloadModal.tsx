import { useEffect, useRef, useState } from 'react';
import {
  Download,
  Folder,
  Layers,
  Link2,
  Music,
  Plus,
  Sparkles,
  Video,
  X,
  Gauge,
  FileCheck,
  AlertCircle,
  Loader2,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  Globe,
  ShieldCheck,
} from './icons';
import { useAppSettings } from '../context/AppSettingsContext';
import { useToast } from '../context/ToastContext';
import { parseBatchInput } from '../utils/batch';
import { formatBytes } from '../utils/speed';

type Format = {
  id: string;
  ext: string;
  resolution: string;
  height: number;
  filesize: number;
  tbr: number;
  note: string;
  isAudioOnly?: boolean;
};

type Info = {
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  extractor: string;
  formats: Format[];
};

interface NewDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  outDir: string;
  initialUrl?: string;
  onStartDownload: (opts: any) => Promise<any>;
}

export default function NewDownloadModal({
  isOpen,
  onClose,
  outDir,
  initialUrl = '',
  onStartDownload,
}: NewDownloadModalProps) {
  const { t } = useAppSettings();
  const toast = useToast();
  const [panelMode, setPanelMode] = useState<'single' | 'batch'>('single');
  const [url, setUrl] = useState(initialUrl);
  const [batchText, setBatchText] = useState('');
  const [info, setInfo] = useState<Info | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [asAudio, setAsAudio] = useState(false);
  const [formatTab, setFormatTab] = useState<'video' | 'audio'>('video');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [speedLimitKB, setSpeedLimitKB] = useState(0);
  const [starting, setStarting] = useState(false);
  const [batchAdding, setBatchAdding] = useState(false);
  const [segments, setSegments] = useState<number>(8);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mirrorUrlsText, setMirrorUrlsText] = useState('');
  const [expectedHash, setExpectedHash] = useState('');
  const [hashAlgorithm, setHashAlgorithm] = useState<'sha256' | 'md5' | 'sha1'>('sha256');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialUrl) {
        setUrl(initialUrl);
        analyze(initialUrl);
      } else {
        // Auto-check clipboard for link
        window.api
          ?.readClipboard?.()
          .then((text: string) => {
            if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
              setUrl(text);
            }
          })
          .catch(() => {});
      }
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setError('');
      setLoading(false);
      setStarting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialUrl]);

  if (!isOpen) return null;

  async function analyze(targetUrl?: string) {
    const u = (targetUrl || url).trim();
    if (!u) return;
    if (!window.api) {
      setError(t('apiMissing') || 'API not available');
      return;
    }
    setError('');
    setInfo(null);
    setLoading(true);
    try {
      const r = await window.api.analyzeUrl(u);
      setInfo(r);
      const bestMp4 =
        r.formats?.find((f: Format) => !f.isAudioOnly && f.height > 0) || r.formats?.[0];
      setSelectedFormat(bestMp4?.id || '');
      setAsAudio(false);
    } catch (e: any) {
      setError(String(e?.message || e).slice(0, 400));
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    if (!url.trim() || starting) return;
    setStarting(true);
    try {
      const chosenFormat = info?.formats?.find(f => f.id === selectedFormat);
      const mirrors = mirrorUrlsText
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(s => s.startsWith('http://') || s.startsWith('https://'));

      await onStartDownload({
        url: url.trim(),
        mirrors: mirrors.length ? mirrors : undefined,
        expectedHash: expectedHash.trim() ? expectedHash.trim() : undefined,
        hashAlgorithm: expectedHash.trim() ? hashAlgorithm : undefined,
        formatId: asAudio ? undefined : selectedFormat,
        outDir,
        asAudio,
        isAudioOnly: chosenFormat?.isAudioOnly,
        title: info?.title,
        speedLimitKB: speedLimitKB > 0 ? speedLimitKB : undefined,
        segments,
      });
      toast.success(t('statusDownloading') || 'İndirme kuyruğa eklendi');
      onClose();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setStarting(false);
    }
  }

  async function handleBatchAdd() {
    const parsed = parseBatchInput(batchText);
    if (!parsed.length) {
      toast.warning('Geçerli URL bulunamadı');
      return;
    }
    setBatchAdding(true);
    try {
      for (const itemUrl of parsed) {
        await onStartDownload({
          url: itemUrl,
          asAudio,
          outDir,
          speedLimitKB: speedLimitKB > 0 ? speedLimitKB : undefined,
          segments,
        });
      }
      toast.success(`${parsed.length} indirme kuyruğa eklendi`);
      onClose();
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setBatchAdding(false);
    }
  }

  async function handlePaste() {
    try {
      const clip = await window.api?.readClipboard?.();
      if (clip) {
        setUrl(clip);
        analyze(clip);
      }
    } catch {}
  }

  const videoFormats = info?.formats?.filter(f => !f.isAudioOnly && f.height > 0) || [];
  const audioFormats = info?.formats?.filter(f => f.isAudioOnly) || [];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 7, 13, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          background: 'var(--panel)',
          border: '1px solid var(--border-2)',
          borderRadius: 16,
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
        }}
      >
        {/* Modal Başlık */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--panel-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'color-mix(in srgb, var(--accent-solid) 15%, transparent)',
                color: 'var(--accent-solid)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Download size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-bright)' }}>
                {t('singleLinkDownload') || 'Yeni İndirme Ekle'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Çok parçalı hızlı indirme ve yt-dlp medya desteği
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                background: 'var(--panel-3)',
                padding: 3,
                borderRadius: 8,
                border: '1px solid var(--border)',
              }}
            >
              <button
                type="button"
                onClick={() => setPanelMode('single')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  background: panelMode === 'single' ? 'var(--accent-solid)' : 'transparent',
                  color: panelMode === 'single' ? '#fff' : 'var(--muted)',
                }}
              >
                {t('singleLinkDownload') || 'Tekli'}
              </button>
              <button
                type="button"
                onClick={() => setPanelMode('batch')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: 0,
                  fontSize: 11,
                  fontWeight: 700,
                  background: panelMode === 'batch' ? 'var(--accent-solid)' : 'transparent',
                  color: panelMode === 'batch' ? '#fff' : 'var(--muted)',
                }}
              >
                {t('batchExtractor') || 'Toplu (Batch)'}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 0,
                color: 'var(--muted)',
                padding: 6,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              hover-style={{ color: 'var(--text)' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Gövde */}
        <div
          style={{
            padding: 20,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {panelMode === 'single' ? (
            <>
              {/* URL Giriş Alanı */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--muted)',
                    marginBottom: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {t('pasteLink') || 'İndirme Bağlantısı'}
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      ref={inputRef}
                      type="text"
                      value={url}
                      onChange={e => setUrl(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') analyze();
                      }}
                      placeholder="https://... doğrudan dosya veya video bağlantısı"
                      style={{
                        width: '100%',
                        padding: '10px 12px 10px 36px',
                        borderRadius: 10,
                        fontSize: 13,
                        background: 'var(--panel-2)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-bright)',
                      }}
                    />
                    <Link2
                      size={16}
                      style={{
                        position: 'absolute',
                        left: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--muted)',
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handlePaste}
                    title="Panodan Yapıştır"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0 12px',
                      background: 'var(--panel-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      color: 'var(--text)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <ClipboardPaste size={15} />
                    <span>Yapıştır</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => analyze()}
                    disabled={loading || !url.trim()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0 16px',
                      background: 'var(--accent-solid)',
                      border: 0,
                      borderRadius: 10,
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {loading ? (
                      <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      <Sparkles size={15} />
                    )}
                    <span>
                      {loading ? t('scanningState') || 'Analiz...' : t('analyzeBtn') || 'Analiz Et'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Hata Mesajı */}
              {error && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'var(--badge-danger-bg)',
                    border: '1px solid var(--badge-danger-border)',
                    color: 'var(--badge-danger-text)',
                    fontSize: 12,
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, wordBreak: 'break-word' }}>{error}</div>
                </div>
              )}

              {/* Analiz Edilen Medya / Dosya Kartı */}
              {info && (
                <div
                  style={{
                    background: 'var(--panel-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 14,
                    display: 'flex',
                    gap: 14,
                  }}
                >
                  {info.thumbnail ? (
                    <img
                      src={info.thumbnail}
                      alt="Thumbnail"
                      style={{
                        width: 120,
                        height: 72,
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 8,
                        background: 'var(--panel-3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--muted)',
                      }}
                    >
                      <Video size={28} />
                    </div>
                  )}

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--text-bright)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {info.title}
                    </div>
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--muted)' }}>
                      {info.uploader && <span>👤 {info.uploader}</span>}
                      {info.duration > 0 && (
                        <span>
                          ⏱ {Math.floor(info.duration / 60)}:
                          {String(info.duration % 60).padStart(2, '0')}
                        </span>
                      )}
                      {info.extractor && <span>🏷 {info.extractor}</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* Format ve Kalite Seçimi */}
              {info && info.formats && info.formats.length > 0 && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'var(--muted)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {t('qualityAndFormatSelection') || 'Format ve Kalite'}
                    </div>

                    {/* Video vs Sadece Ses Sekmeleri */}
                    <div
                      style={{
                        display: 'flex',
                        background: 'var(--panel-3)',
                        padding: 2,
                        borderRadius: 6,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setFormatTab('video');
                          setAsAudio(false);
                          const bestMp4 = videoFormats[0] || info.formats[0];
                          setSelectedFormat(bestMp4?.id || '');
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 8px',
                          borderRadius: 4,
                          border: 0,
                          fontSize: 10,
                          fontWeight: 700,
                          background: formatTab === 'video' ? 'var(--accent-solid)' : 'transparent',
                          color: formatTab === 'video' ? '#fff' : 'var(--muted)',
                        }}
                      >
                        <Video size={12} />
                        <span>Video</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormatTab('audio');
                          setAsAudio(true);
                          const bestAudio = audioFormats[0] || info.formats[0];
                          setSelectedFormat(bestAudio?.id || '');
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 8px',
                          borderRadius: 4,
                          border: 0,
                          fontSize: 10,
                          fontWeight: 700,
                          background: formatTab === 'audio' ? 'var(--accent-solid)' : 'transparent',
                          color: formatTab === 'audio' ? '#fff' : 'var(--muted)',
                        }}
                      >
                        <Music size={12} />
                        <span>{t('tabAudioOnly') || 'Sadece Ses'}</span>
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      maxHeight: 150,
                      overflowY: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      background: 'var(--panel-2)',
                    }}
                  >
                    {(formatTab === 'video' ? videoFormats : audioFormats).map(f => {
                      const isSel = selectedFormat === f.id;
                      return (
                        <div
                          key={f.id}
                          onClick={() => setSelectedFormat(f.id)}
                          style={{
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderBottom: '1px solid var(--border)',
                            cursor: 'pointer',
                            background: isSel
                              ? 'color-mix(in srgb, var(--accent-solid) 16%, transparent)'
                              : 'transparent',
                            color: isSel ? 'var(--accent-solid)' : 'var(--text)',
                            fontSize: 12,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              fontWeight: isSel ? 700 : 500,
                            }}
                          >
                            <span
                              style={{
                                textTransform: 'uppercase',
                                fontSize: 10,
                                padding: '2px 5px',
                                borderRadius: 4,
                                background: 'var(--panel-3)',
                              }}
                            >
                              {f.ext || 'mp4'}
                            </span>
                            <span>{f.resolution || f.note || f.id}</span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              color: 'var(--muted)',
                              fontSize: 11,
                            }}
                            className="tech-mono"
                          >
                            {f.filesize
                              ? formatBytes(f.filesize)
                              : f.tbr
                                ? `${Math.round(f.tbr)} kbps`
                                : ''}
                            {isSel && <FileCheck size={14} color="var(--accent-solid)" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* İleri Seviye Seçenekler (Çoklu Bağlantı Parçaları & Hız Limiti) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  padding: 12,
                  borderRadius: 10,
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--muted)',
                      marginBottom: 6,
                    }}
                  >
                    <Layers size={13} />
                    <span>Çoklu Bağlantı Parça Sayısı</span>
                  </div>
                  <select
                    value={segments}
                    onChange={e => setSegments(parseInt(e.target.value) || 8)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: 'var(--panel-3)',
                      border: '1px solid var(--border)',
                      fontSize: 12,
                      color: 'var(--text)',
                    }}
                  >
                    <option value={1}>1 Bağlantı (Tek Parça)</option>
                    <option value={4}>4 Bağlantı (Standart)</option>
                    <option value={8}>8 Bağlantı (Turbo - Önerilen)</option>
                    <option value={16}>16 Bağlantı (Maksimum Hızlandırma)</option>
                    <option value={32}>32 Bağlantı (Ekstrem Hatlar)</option>
                  </select>
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--muted)',
                      marginBottom: 6,
                    }}
                  >
                    <Gauge size={13} />
                    <span>Hız Limiti</span>
                  </div>
                  <select
                    value={speedLimitKB}
                    onChange={e => setSpeedLimitKB(parseInt(e.target.value) || 0)}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 8,
                      background: 'var(--panel-3)',
                      border: '1px solid var(--border)',
                      fontSize: 12,
                      color: 'var(--text)',
                    }}
                  >
                    <option value={0}>⚡ Sınırsız (Tam Hat)</option>
                    <option value={1024}>1 MB/s</option>
                    <option value={2048}>2 MB/s</option>
                    <option value={5120}>5 MB/s</option>
                    <option value={10240}>10 MB/s</option>
                  </select>
                </div>
              </div>

              {/* İndirme Hedef Klasörü */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  color: 'var(--muted)',
                  background: 'var(--panel-3)',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                }}
              >
                <Folder size={14} style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>Kayıt Yeri:</span>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                  className="tech-mono"
                >
                  {outDir}
                </span>
                <button
                  type="button"
                  onClick={() => window.api?.openFolder?.(outDir)}
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--accent-solid)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  Klasörü Aç
                </button>
              </div>

              {/* Gelişmiş Seçenekler: Çoklu Ayna Linkler & Bütünlük Kontrolü (Checksum) */}
              <div
                style={{
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  style={{
                    padding: '9px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text)',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldCheck size={14} color="var(--accent-solid)" />
                    <span>Gelişmiş: Çoklu Ayna Kaynakları (Mirrors) & Bütünlük Kontrolü</span>
                  </div>
                  {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>

                {showAdvanced && (
                  <div
                    style={{
                      padding: '12px',
                      borderTop: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                      background: 'var(--panel-3)',
                    }}
                  >
                    {/* Ayna Linkler */}
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--muted)',
                          marginBottom: 4,
                        }}
                      >
                        <Globe size={13} />
                        <span>Alternatif Ayna Linkler (Mirror URLs)</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6 }}>
                        İndirmeyi hızlandırmak veya kesintilere karşı korumak için aynı dosyanın
                        alternatif linklerini ekleyin (her satıra bir link).
                      </div>
                      <textarea
                        value={mirrorUrlsText}
                        onChange={e => setMirrorUrlsText(e.target.value)}
                        placeholder={
                          'https://mirror1.example.com/file.iso\nhttps://mirror2.example.com/file.iso'
                        }
                        rows={2}
                        style={{
                          width: '100%',
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: 'var(--panel-2)',
                          border: '1px solid var(--border)',
                          fontSize: 11,
                          color: 'var(--text)',
                          fontFamily: 'monospace',
                        }}
                      />
                    </div>

                    {/* Checksum / Hash */}
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--muted)',
                          marginBottom: 4,
                        }}
                      >
                        <ShieldCheck size={13} />
                        <span>Otomatik Dosya Bütünlük Doğrulama (Checksum)</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <select
                          value={hashAlgorithm}
                          onChange={e => setHashAlgorithm(e.target.value as any)}
                          style={{
                            padding: '6px 8px',
                            borderRadius: 8,
                            background: 'var(--panel-2)',
                            border: '1px solid var(--border)',
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--text)',
                          }}
                        >
                          <option value="sha256">SHA-256</option>
                          <option value="md5">MD5</option>
                          <option value="sha1">SHA-1</option>
                        </select>
                        <input
                          type="text"
                          value={expectedHash}
                          onChange={e => setExpectedHash(e.target.value)}
                          placeholder="İsteğe bağlı beklenen hash değeri (ör: e3b0c44298fc1c149afb...)"
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: 8,
                            background: 'var(--panel-2)',
                            border: '1px solid var(--border)',
                            fontSize: 11,
                            color: 'var(--text)',
                            fontFamily: 'monospace',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Batch / Toplu Mod */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {t('batchInstruction') ||
                  'İçinde bağlantılar geçen metin yapıştırın. Her satır ayrı bir indirme olarak kuyruğa eklenir.'}
              </div>
              <textarea
                value={batchText}
                onChange={e => setBatchText(e.target.value)}
                placeholder={t('batchPlaceholder') || 'https://...\nhttps://...'}
                rows={7}
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: 12,
                  fontFamily: 'monospace',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={asAudio}
                    onChange={e => setAsAudio(e.target.checked)}
                  />
                  <span>Tümünü MP3 / Ses Olarak İndir</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Modal Alt Kontroller */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            background: 'var(--panel-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {t('cancel') || 'Vazgeç'}
          </button>

          {panelMode === 'single' ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={starting || !url.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 20px',
                borderRadius: 8,
                border: 0,
                background: 'var(--accent-solid)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                boxShadow: '0 4px 12px color-mix(in srgb, var(--accent-solid) 30%, transparent)',
              }}
            >
              {starting ? (
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <Download size={15} />
              )}
              <span>{starting ? 'Başlatılıyor...' : 'İndirmeyi Başlat'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleBatchAdd}
              disabled={batchAdding || !batchText.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 20px',
                borderRadius: 8,
                border: 0,
                background: 'var(--accent-solid)',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {batchAdding ? (
                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <Plus size={15} />
              )}
              <span>{batchAdding ? 'Ekleniyor...' : 'Kuyruğa Ekle'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
