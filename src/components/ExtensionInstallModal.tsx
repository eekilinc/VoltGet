import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Globe,
  Puzzle,
  ShieldCheck,
  X,
  Zap,
} from './icons';
import { useAppSettings } from '../context/AppSettingsContext';
import { useToast } from '../context/ToastContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  connected: boolean;
}

interface DetectedBrowser {
  id: 'chrome' | 'edge' | 'brave' | 'opera' | 'vivaldi' | 'firefox';
  name: string;
  engine: 'chromium' | 'firefox';
  exePath: string;
  extensionsUrl: string;
}

type BrowserType = 'chrome' | 'firefox';

export default function ExtensionInstallModal({ isOpen, onClose, connected }: Props) {
  const { t } = useAppSettings();
  const toast = useToast();
  const [selectedBrowser, setSelectedBrowser] = useState<BrowserType>('chrome');
  const [browsers, setBrowsers] = useState<DetectedBrowser[]>([]);
  const [extPath, setExtPath] = useState('');
  const [nativeHost, setNativeHost] = useState<{
    installed: boolean;
    chromiumOriginsCount: number;
  }>({ installed: false, chromiumOriginsCount: 0 });
  const [chromiumExtId, setChromiumExtId] = useState('');
  const [registeringNm, setRegisteringNm] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [openingFolder, setOpeningFolder] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    window.api
      ?.detectInstalledBrowsers?.()
      .then(list => {
        if (Array.isArray(list)) setBrowsers(list);
      })
      .catch(() => {});

    window.api
      ?.getNativeHostStatus?.()
      .then(st => {
        if (st) setNativeHost(st);
      })
      .catch(() => {});

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    window.api
      ?.getExtensionPath?.(selectedBrowser)
      .then(res => {
        if (res?.path) setExtPath(res.path);
      })
      .catch(() => {});
  }, [isOpen, selectedBrowser]);

  if (!isOpen) return null;

  const handleLaunchBrowser = async (b: DetectedBrowser) => {
    setLaunchingId(b.id);
    setSelectedBrowser(b.engine === 'firefox' ? 'firefox' : 'chrome');
    try {
      const res = await window.api?.launchBrowserExtensions?.(b.id);
      if (res?.success) {
        toast.success(
          `${b.name} eklentiler sayfası açıldı ve eklenti klasör yolu panoya kopyalandı!`,
          'Kurulum Hazır'
        );
      } else {
        toast.error(res?.error || t('error'));
      }
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setLaunchingId(null);
    }
  };

  const handleRegisterNativeHost = async () => {
    setRegisteringNm(true);
    try {
      const ids = chromiumExtId
        .split(/[\s,;]+/)
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
      const res = await window.api?.registerNativeHost?.({ chromiumExtensionIds: ids });
      if (res?.success) {
        const st = await window.api?.getNativeHostStatus?.();
        if (st) setNativeHost(st);
        toast.success(
          res.registeredBrowsers.length
            ? `Otomatik eşleştirme kuruldu: ${res.registeredBrowsers.join(', ')}`
            : 'Native Host dosyaları hazırlandı (Chrome/Edge için eklenti kimliğini ekleyin).'
        );
      } else {
        toast.error(res?.error || t('error'));
      }
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setRegisteringNm(false);
    }
  };

  const handleOpenFolder = async () => {
    setOpeningFolder(true);
    try {
      const res = await window.api?.openExtensionFolder(selectedBrowser);
      if (res?.success) {
        toast.success(t('extFolderOpened'));
      } else {
        toast.error(res?.error || t('error'));
      }
    } catch (e: any) {
      toast.error(t('error') + ': ' + (e?.message || e));
    }
    setOpeningFolder(false);
  };

  const handleExportZip = async () => {
    setZipping(true);
    try {
      const res = await window.api?.exportExtensionZip(selectedBrowser);
      if (res?.success) {
        toast.success(`${res.fileName || 'voltget-extension.zip'} (${t('success')})`);
      } else {
        toast.error(t('error'));
      }
    } catch (e: any) {
      toast.error(t('error') + ': ' + (e?.message || e));
    }
    setZipping(false);
  };

  const handleCopyPath = () => {
    if (!extPath) return;
    navigator.clipboard.writeText(extPath);
    toast.info('Eklenti klasör yolu kopyalandı');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(3, 6, 15, 0.82)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card-premium animate-slide-up"
        style={{
          width: 'min(660px, calc(100vw - 32px))',
          borderRadius: 20,
          border: '1px solid color-mix(in srgb, var(--accent-solid) 35%, var(--border))',
          boxShadow: '0 30px 90px rgba(0,0,0,0.85)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '92vh',
        }}
      >
        {/* Başlık Çubuğu */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--panel-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, var(--accent-from), var(--accent-to))',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 14px color-mix(in srgb, var(--accent-solid) 40%, transparent)',
              }}
            >
              <Puzzle size={19} />
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 15, color: 'var(--text-bright)' }}>
                {t('extModalTitle')}
              </div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 1 }}>
                Tek tık tarayıcı kurulumu, otomatik eşleştirme ve Shadow DOM video yakalayıcı
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--border)',
              width: 32,
              height: 32,
              borderRadius: 8,
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Gövde */}
        <div className="scroll-panel" style={{ padding: '16px 20px', gap: 14 }}>
          {/* Canlı Bağlantı Durumu */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 12,
              border: connected
                ? '1px solid var(--badge-success-border)'
                : '1px solid var(--badge-warning-border)',
              background: connected ? 'var(--badge-success-bg)' : 'var(--badge-warning-bg)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: connected ? '#16a34a' : '#ca8a04',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {connected ? <CheckCircle2 size={18} /> : <Zap size={18} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 12.5,
                  color: connected ? 'var(--badge-success-text)' : 'var(--badge-warning-text)',
                }}
              >
                {connected ? t('extConnectedTitle') : t('extWaitingTitle')}
              </div>
              <div style={{ fontSize: 11, marginTop: 2, color: 'var(--text)', opacity: 0.9 }}>
                {connected ? t('extConnectedLongDesc') : t('extWaitingLongDesc')}
              </div>
            </div>
          </div>

          {/* 1. Kurulu Tarayıcılar — Tek Tıkla Başlat */}
          <div
            style={{
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontWeight: 800,
                  fontSize: 12.5,
                  color: 'var(--text-bright)',
                }}
              >
                <Globe size={15} color="var(--accent-solid)" />
                <span>1. Tarayıcını Seç ve Eklentiyi Yükle</span>
              </div>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                {browsers.length} tarayıcı algılandı
              </span>
            </div>

            {browsers.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                  gap: 8,
                }}
              >
                {browsers.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    disabled={launchingId === b.id}
                    onClick={() => handleLaunchBrowser(b)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                      background: 'var(--panel)',
                      color: 'var(--text)',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12 }}>{b.name}</div>
                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        className="tech-mono"
                      >
                        {b.extensionsUrl}
                      </div>
                    </div>
                    <ExternalLink size={14} color="var(--accent-solid)" />
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Tarayıcı otomatik algılanamadı — aşağıdaki klasör veya ZIP butonlarını kullanın.
              </div>
            )}

            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              Tarayıcına tıkladığında eklentiler sayfası açılır ve klasör yolu panoya kopyalanır.
              <strong style={{ color: 'var(--text)' }}> Geliştirici Modu</strong>nu açıp{' '}
              <strong style={{ color: 'var(--text)' }}>Paketlenmemiş öğe yükle</strong> diyerek
              panodaki yolu yapıştırman yeterli.
            </div>

            {/* Eklenti Tipi + Klasör Yolu + Hızlı Butonlar */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
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
                  onClick={() => setSelectedBrowser('chrome')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    background:
                      selectedBrowser === 'chrome' ? 'var(--accent-solid)' : 'transparent',
                    color: selectedBrowser === 'chrome' ? '#fff' : 'var(--muted)',
                  }}
                >
                  Chrome / Edge / Brave
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBrowser('firefox')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 6,
                    border: 0,
                    fontSize: 11,
                    fontWeight: 700,
                    background:
                      selectedBrowser === 'firefox' ? 'var(--accent-solid)' : 'transparent',
                    color: selectedBrowser === 'firefox' ? '#fff' : 'var(--muted)',
                  }}
                >
                  Firefox
                </button>
              </div>

              <button
                type="button"
                onClick={handleOpenFolder}
                disabled={openingFolder}
                className="btn-secondary"
                style={{
                  padding: '6px 10px',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <FolderOpen size={13} />
                <span>{openingFolder ? t('openingFolder') : 'Klasörü Aç'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportZip}
                disabled={zipping}
                className="btn-secondary"
                style={{
                  padding: '6px 10px',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Download size={13} />
                <span>{zipping ? t('zippingState') : 'ZIP Paketi Al'}</span>
              </button>
            </div>

            {extPath && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: 'var(--panel-3)',
                  border: '1px solid var(--border)',
                  fontSize: 10.5,
                }}
              >
                <span
                  className="tech-mono"
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--muted)',
                  }}
                  title={extPath}
                >
                  {extPath}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPath}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--panel-2)',
                    color: 'var(--text)',
                    fontSize: 10.5,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  <Copy size={11} />
                  <span>Yolu Kopyala</span>
                </button>
              </div>
            )}
          </div>

          {/* 2. Sıfır-Adım Otomatik Eşleştirme (Native Messaging) & Anahtar */}
          <div
            style={{
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontWeight: 800,
                  fontSize: 12.5,
                  color: 'var(--text-bright)',
                }}
              >
                <ShieldCheck size={15} color="#4ade80" />
                <span>2. Otomatik Eşleştirme & Bağlantı Anahtarı</span>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 99,
                  background: nativeHost.installed ? 'var(--badge-success-bg)' : 'var(--panel-3)',
                  color: nativeHost.installed ? 'var(--badge-success-text)' : 'var(--muted)',
                  border: '1px solid var(--border)',
                }}
              >
                {nativeHost.installed ? 'Native Host Hazır' : 'Kurulmadı'}
              </span>
            </div>

            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              Eklentiyi tarayıcıya yükledikten sonra ya tek tıkla{' '}
              <strong style={{ color: 'var(--text)' }}>Bağlantı Anahtarını Kopyala</strong> deyip
              eklentiye yapıştırın, ya da tarayıcının verdiği 32 haneli Eklenti Kimliğini girip{' '}
              <strong style={{ color: 'var(--text)' }}>Otomatik Eşleştirme</strong>yi etkinleştirin
              (Firefox için kimlik girmeniz gerekmez).
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={chromiumExtId}
                onChange={e => setChromiumExtId(e.target.value)}
                placeholder="Chrome/Edge Eklenti Kimliği (isteğe bağlı, 32 harf)"
                className="tech-mono"
                style={{
                  flex: '1 1 220px',
                  padding: '7px 10px',
                  borderRadius: 8,
                  fontSize: 11,
                }}
              />
              <button
                type="button"
                disabled={registeringNm}
                onClick={handleRegisterNativeHost}
                className="btn-premium"
                style={{
                  padding: '7px 12px',
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <ShieldCheck size={13} />
                <span>{registeringNm ? 'Kuruluyor...' : 'Otomatik Eşleştirme Kur'}</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{
                  padding: '7px 12px',
                  fontSize: 11,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onClick={async () => {
                  try {
                    await window.api.copyExtensionToken();
                    toast.success(t('extensionTokenCopied'));
                  } catch {
                    toast.error(t('error'));
                  }
                }}
              >
                <Copy size={13} />
                <span>{t('extensionCopyToken')}</span>
              </button>
              <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                Manuel eşleştirme için kopyalayıp eklenti penceresine yapıştırın.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
