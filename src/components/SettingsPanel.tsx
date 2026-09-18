import { useEffect, useState } from 'react';
import { useAppSettings } from '../context/AppSettingsContext';
import { useToast } from '../context/ToastContext';
import { ACCENTS, AccentColor, ThemeMode } from '../theme';
import { LANGS, Lang } from '../i18n';
import ExtensionInstallModal from './ExtensionInstallModal';

export default function SettingsPanel() {
  const { theme, accent, lang, setTheme, setAccent, setLang, t } = useAppSettings();
  const toast = useToast();
  const [outDir, setOutDir] = useState('');
  const [status, setStatus] = useState<any>(null);
  const [cfg, setCfg] = useState<any>({
    concurrent: 3,
    speedLimitKB: 0,
    siteFolders: true,
    autoUpdateCheck: true,
    interceptBrowserDownloads: true,
    captureMediaRequests: true,
    captureDocuments: true,
    captureArchives: true,
    captureInstallers: true,
    openAtLogin: false,
    startMinimized: false,
  });
  const [updating, setUpdating] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [extConnected, setExtConnected] = useState(false);
  const [extModalOpen, setExtModalOpen] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [appUpdateState, setAppUpdateState] = useState<
    'idle' | 'checking' | 'available' | 'downloaded' | 'uptodate'
  >('idle');
  const [appUpdateVersion, setAppUpdateVersion] = useState('');
  const [siteHost, setSiteHost] = useState('');
  const [siteUser, setSiteUser] = useState('');
  const [sitePass, setSitePass] = useState('');
  const [catName, setCatName] = useState('');
  const [catExts, setCatExts] = useState('');

  useEffect(() => {
    window.api?.getDefaultDir().then(setOutDir);
    window.api?.getYtDlpStatus().then(setStatus);
    window.api?.getConfig().then(setCfg);
    window.api
      ?.checkYtDlpUpdate()
      .then(setUpdateInfo)
      .catch(() => {});

    const offUpd1 = window.api?.onUpdateAvailable?.((info: any) => {
      setAppUpdateState('available');
      if (info?.version) setAppUpdateVersion(info.version);
    });
    const offUpd2 = window.api?.onUpdateDownloaded?.((info: any) => {
      setAppUpdateState('downloaded');
      if (info?.version) setAppUpdateVersion(info.version);
    });
    window.api?.getExtensionStatus?.().then((res: any) => {
      if (res) setExtConnected(!!res.connected);
    });
    const onExt = (res: any) => {
      if (res) setExtConnected(!!res.connected);
    };
    const offExt = window.api?.onExtensionStatus?.(onExt);
    return () => {
      try {
        offUpd1?.();
      } catch {}
      try {
        offUpd2?.();
      } catch {}
      try {
        offExt?.();
      } catch {}
    };
  }, []);

  async function pickFolder() {
    const f = await window.api.selectFolder();
    if (f) {
      setOutDir(f);
      await window.api.setConfig({ customOutDir: f });
      toast.success(t('folderUpdated'));
    }
  }
  async function resetFolderToDefault() {
    await window.api.setConfig({ customOutDir: '' });
    const def = await window.api.getDefaultDir();
    setOutDir(def);
    toast.success(t('folderUpdated'));
  }
  async function updateYtDlp() {
    setUpdating(true);
    try {
      await window.api.downloadYtDlp();
      setStatus(await window.api.getYtDlpStatus());
      setUpdateInfo(await window.api.checkYtDlpUpdate());
      toast.success(t('ytdlpUpdateSuccess'));
    } catch (e: any) {
      toast.error(t('error') + ': ' + String(e?.message || e));
    }
    setUpdating(false);
  }
  async function saveCfg(patch: any) {
    const n = await window.api.setConfig(patch);
    setCfg(n);
    toast.info(t('configSaved'));
  }

  async function checkAppUpdate() {
    setAppUpdateState('checking');
    try {
      await window.api?.checkForUpdates?.();
      setTimeout(() => {
        setAppUpdateState(s => (s === 'checking' ? 'uptodate' : s));
      }, 15000);
    } catch (e: any) {
      setAppUpdateState('idle');
      toast.error(t('error') + ': ' + String(e?.message || e));
    }
  }

  async function addSiteLogin() {
    const host = siteHost
      .trim()
      .toLowerCase()
      .replace(/^www\./, '');
    if (!host || !siteUser.trim()) {
      toast.warning(t('siteLoginIncomplete'));
      return;
    }
    const entry = {
      id: Date.now().toString(36),
      host,
      username: siteUser.trim(),
      password: sitePass,
    };
    const next = [...(cfg.siteLogins || []), entry];
    await saveCfg({ siteLogins: next });
    setSiteHost('');
    setSiteUser('');
    setSitePass('');
  }

  async function removeSiteLogin(id: string) {
    await saveCfg({ siteLogins: (cfg.siteLogins || []).filter((l: any) => l.id !== id) });
  }

  async function addCustomCat() {
    const name = catName.trim();
    const exts = catExts
      .split(',')
      .map(e => e.trim().replace(/^\./, '').toLowerCase())
      .filter(Boolean);
    if (!name || !exts.length) {
      toast.warning(t('customCatIncomplete'));
      return;
    }
    const next = [...(cfg.customCategories || []), { name, extensions: exts }];
    await saveCfg({ customCategories: next });
    setCatName('');
    setCatExts('');
  }

  async function removeCustomCat(idx: number) {
    await saveCfg({
      customCategories: (cfg.customCategories || []).filter((_: any, i: number) => i !== idx),
    });
  }

  const inputStyle = {
    width: '100%',
    marginTop: 4,
    padding: 6,
    borderRadius: 8,
    background: 'var(--panel-2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    outline: 'none',
    fontSize: 12,
  } as const;

  async function openExtFolder() {
    const res = await window.api?.openExtensionFolder();
    if (res?.success) toast.success(t('extFolderOpened'));
    else toast.error(res?.error || t('error'));
  }

  async function exportExtZip() {
    setZipping(true);
    try {
      const res = await window.api?.exportExtensionZip();
      if (res?.success) toast.success(`${res.fileName || 'voltget-eklenti.zip'} ${t('done')}`);
      else toast.error(t('error'));
    } catch (e: any) {
      toast.error(t('error') + ': ' + (e?.message || e));
    }
    setZipping(false);
  }

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
      {/* Tarayıcı Eklentisi Yönetim Kartı */}
      <div className="card-premium glow-accent" style={{ borderRadius: 18, padding: 18 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>🧩</span>
            <div>
              <div style={{ fontWeight: 900, fontSize: 15 }}>{t('extCardTitle')}</div>
              <div className="text-muted" style={{ fontSize: 11 }}>
                {t('extCardDesc')}
              </div>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 20,
              background: extConnected ? 'var(--badge-success-bg)' : 'var(--badge-warning-bg)',
              border: extConnected
                ? '1px solid var(--badge-success-border)'
                : '1px solid var(--badge-warning-border)',
              color: extConnected ? 'var(--badge-success-text)' : 'var(--badge-warning-text)',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            <span>{extConnected ? '🟢' : '⚪'}</span>
            <span>{extConnected ? t('extConnectedStatus') : t('extWaitingStatus')}</span>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={openExtFolder}
            className="brand-gradient"
            style={{
              color: '#fff',
              border: 0,
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>📂</span>
            <span>{t('openExtFolderBtn')}</span>
          </button>

          <button
            onClick={exportExtZip}
            disabled={zipping}
            style={{
              background: 'var(--panel-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>📦</span>
            <span>{zipping ? t('updating') : t('exportExtZipBtn')}</span>
          </button>

          <button
            onClick={() => setExtModalOpen(true)}
            style={{
              background: 'var(--panel-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>🚀</span>
            <span>{t('viewExtGuideBtn')}</span>
          </button>
        </div>
      </div>

      <ExtensionInstallModal
        isOpen={extModalOpen}
        onClose={() => setExtModalOpen(false)}
        connected={extConnected}
      />

      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{t('settingsAppearance')}</div>
        <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
          {t('settingsTheme')} • {t('settingsLanguage')} • {t('accentColor')}
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {(['dark', 'light'] as ThemeMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setTheme(mode)}
              style={{
                padding: '14px 12px',
                borderRadius: 14,
                textAlign: 'left',
                color: 'var(--text)',
                border: '1px solid ' + (theme === mode ? 'var(--accent-solid)' : 'var(--border)'),
                background:
                  theme === mode
                    ? 'color-mix(in srgb, var(--accent-solid) 14%, var(--panel-2))'
                    : 'var(--panel-2)',
              }}
            >
              <div style={{ fontWeight: 800 }}>
                {mode === 'dark' ? t('themeDark') : t('themeLight')}
              </div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                {mode === 'dark' ? t('themeDarkDesc') : t('themeLightDesc')}
              </div>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 16, fontWeight: 700, fontSize: 12 }}>{t('accentColor')}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {(Object.keys(ACCENTS) as AccentColor[]).map(key => (
            <button
              key={key}
              onClick={() => setAccent(key)}
              title={ACCENTS[key].name}
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                border: accent === key ? '3px solid var(--text)' : '2px solid var(--border)',
                background: `linear-gradient(135deg, ${ACCENTS[key].from}, ${ACCENTS[key].to})`,
              }}
            />
          ))}
        </div>

        <div style={{ marginTop: 16, fontWeight: 700, fontSize: 12 }}>{t('settingsLanguage')}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {(Object.keys(LANGS) as Lang[]).map(code => (
            <button
              key={code}
              onClick={() => setLang(code)}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                color: 'var(--text)',
                border: '1px solid ' + (lang === code ? 'var(--accent-solid)' : 'var(--border)'),
                background:
                  lang === code
                    ? 'color-mix(in srgb, var(--accent-solid) 16%, var(--panel-2))'
                    : 'var(--panel-2)',
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              {LANGS[code]}
            </button>
          ))}
        </div>
      </div>

      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <div
            style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <span>🚀</span>
            <span>{t('settingsTrayAndStartup')}</span>
          </div>
          <span
            style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 6,
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              fontWeight: 800,
            }}
          >
            {t('trayStartupDesc')}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              cursor: 'pointer',
              padding: '8px 10px',
              borderRadius: 10,
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
            }}
          >
            <input
              type="checkbox"
              style={{ marginTop: 2 }}
              checked={!!cfg.openAtLogin}
              onChange={e => saveCfg({ openAtLogin: e.target.checked })}
            />
            <div>
              <div style={{ fontWeight: 700 }}>{t('autoStartWindows')}</div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                {t('autoStartDesc')}
              </div>
            </div>
          </label>

          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              cursor: 'pointer',
              padding: '8px 10px',
              borderRadius: 10,
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
            }}
          >
            <input
              type="checkbox"
              style={{ marginTop: 2 }}
              checked={cfg.closeToTray !== false}
              onChange={e => saveCfg({ closeToTray: e.target.checked })}
            />
            <div>
              <div style={{ fontWeight: 700 }}>{t('closeToTray')}</div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                {t('closeToTrayDesc')}
              </div>
            </div>
          </label>

          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              cursor: 'pointer',
              padding: '8px 10px',
              borderRadius: 10,
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
            }}
          >
            <input
              type="checkbox"
              style={{ marginTop: 2 }}
              checked={!!cfg.minimizeToTray}
              onChange={e => saveCfg({ minimizeToTray: e.target.checked })}
            />
            <div>
              <div style={{ fontWeight: 700 }}>{t('minimizeToTray')}</div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                {t('minimizeToTrayDesc')}
              </div>
            </div>
          </label>

          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              cursor: 'pointer',
              padding: '8px 10px',
              borderRadius: 10,
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
            }}
          >
            <input
              type="checkbox"
              style={{ marginTop: 2 }}
              checked={!!cfg.startMinimized}
              onChange={e => saveCfg({ startMinimized: e.target.checked })}
            />
            <div>
              <div style={{ fontWeight: 700 }}>{t('startMinimized')}</div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                {t('startMinimizedDesc')}
              </div>
            </div>
          </label>

          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              cursor: 'pointer',
              padding: '8px 10px',
              borderRadius: 10,
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
            }}
          >
            <input
              type="checkbox"
              style={{ marginTop: 2 }}
              checked={cfg.clipboardWatcher !== false}
              onChange={e => saveCfg({ clipboardWatcher: e.target.checked })}
            />
            <div>
              <div style={{ fontWeight: 700 }}>📋 {t('smartClipboardWatcher')}</div>
              <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                {t('smartClipboardWatcherDesc')}
              </div>
            </div>
          </label>
        </div>
      </div>

      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>{t('settingsFolder')}</div>
        <div
          className="text-muted"
          style={{
            fontSize: 12,
            marginTop: 6,
            wordBreak: 'break-all',
            background: 'var(--panel-2)',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--border)',
          }}
        >
          {outDir}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={pickFolder}
            className="brand-gradient"
            style={{
              color: '#fff',
              border: 0,
              padding: '8px 12px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {t('selectFolder')}
          </button>
          <button
            onClick={() => window.api.openFolder(outDir)}
            style={{
              background: 'var(--panel-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              padding: '8px 12px',
              borderRadius: 10,
              fontSize: 12,
            }}
          >
            {t('open')}
          </button>
          <button
            onClick={resetFolderToDefault}
            style={{
              background: 'var(--panel-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              padding: '8px 12px',
              borderRadius: 10,
              fontSize: 12,
            }}
            title="Downloads\VoltGet"
          >
            🔄 {t('resetToDefault')}
          </button>
        </div>
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 12,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!cfg.siteFolders}
            onChange={e => saveCfg({ siteFolders: e.target.checked })}
          />{' '}
          {t('siteSubfolders')}
        </label>
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 8,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!cfg.categoryFolders}
            onChange={e => saveCfg({ categoryFolders: e.target.checked })}
          />{' '}
          🗂️ {t('categorySubfolders')}
        </label>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
            📄 {t('conflictPolicyLabel')}
          </div>
          <select
            value={cfg.fileConflictAction || 'rename'}
            onChange={e => saveCfg({ fileConflictAction: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 10,
              background: 'var(--panel-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              fontSize: 12,
            }}
          >
            <option value="ask">{t('conflictAsk')}</option>
            <option value="resume">{t('conflictResume')}</option>
            <option value="overwrite">{t('conflictOverwrite')}</option>
            <option value="rename">{t('conflictRename')}</option>
            <option value="skip">{t('conflictSkip')}</option>
          </select>
        </div>
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 10,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={cfg.completionDialog !== false}
            onChange={e => saveCfg({ completionDialog: e.target.checked })}
          />{' '}
          {t('completionDialogShow')}
        </label>
      </div>

      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>{t('settingsPerf')}</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 140, fontSize: 12 }}>
            {' '}
            {t('concurrentDownloads')}
            <br />
            <select
              value={cfg.concurrent}
              onChange={e => saveCfg({ concurrent: parseInt(e.target.value) })}
              style={{ marginTop: 6, width: '100%', padding: '8px', borderRadius: 10 }}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={8}>8</option>
            </select>
          </label>
          <label style={{ flex: 1, minWidth: 140, fontSize: 12 }}>
            {' '}
            {t('speedLimiter')}
            <br />
            <select
              value={cfg.speedLimitKB || 0}
              onChange={e => saveCfg({ speedLimitKB: parseInt(e.target.value) || 0 })}
              style={{ marginTop: 6, width: '100%', padding: '8px', borderRadius: 10 }}
            >
              <option value={0}>⚡ {t('speedUnlimited')}</option>
              <option value={1024}>1 MB/s</option>
              <option value={2048}>2 MB/s</option>
              <option value={5120}>5 MB/s</option>
              <option value={10240}>10 MB/s</option>
              <option value={20480}>20 MB/s</option>
            </select>
          </label>
        </div>

        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 14,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={cfg.soundNotification !== false}
            onChange={e => saveCfg({ soundNotification: e.target.checked })}
          />{' '}
          🔔 {t('soundNotification')}
        </label>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
            ⚡ {t('postDownloadAction')}
          </div>
          <select
            value={cfg.postDownloadAction || 'none'}
            onChange={e => saveCfg({ postDownloadAction: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 10,
              background: 'var(--panel-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              fontSize: 12,
            }}
          >
            <option value="none">{t('actionNone')}</option>
            <option value="shutdown">{t('actionShutdown')}</option>
            <option value="sleep">{t('actionSleep')}</option>
            <option value="quit">{t('actionQuit')}</option>
          </select>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
            🔄 {t('retrySettingsTitle')}
          </div>
          <label
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={cfg.autoRetryEnabled !== false}
              onChange={e => saveCfg({ autoRetryEnabled: e.target.checked })}
            />{' '}
            {t('autoRetryEnabled')}
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <label style={{ flex: 1, fontSize: 12 }}>
              {t('maxAutoRetries')}
              <select
                value={cfg.maxAutoRetries ?? 3}
                onChange={e => saveCfg({ maxAutoRetries: parseInt(e.target.value) || 0 })}
                style={{ marginTop: 4, width: '100%', padding: '8px', borderRadius: 10 }}
              >
                {[0, 1, 2, 3, 5, 10].map(n => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1, fontSize: 12 }}>
              {t('retryBaseDelay')}
              <select
                value={cfg.retryBaseDelaySec ?? 5}
                onChange={e => saveCfg({ retryBaseDelaySec: parseInt(e.target.value) || 5 })}
                style={{ marginTop: 4, width: '100%', padding: '8px', borderRadius: 10 }}
              >
                {[1, 2, 5, 10, 30, 60, 300].map(n => (
                  <option key={n} value={n}>
                    {n} sn
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 14,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!cfg.virusScanEnabled}
            onChange={e => saveCfg({ virusScanEnabled: e.target.checked })}
          />{' '}
          🛡️ {t('virusScanEnabled')}
        </label>
      </div>

      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>{t('settingsSniffer')}</div>
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 10,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!cfg.sniffNotifications}
            onChange={e => saveCfg({ sniffNotifications: e.target.checked })}
          />{' '}
          {t('sniffNotificationShow')}
        </label>
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 10,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <span style={{ flex: 1 }}>{t('sniffDebounce')}</span>
          <select
            value={cfg.sniffDebounceMs ?? 8000}
            onChange={e =>
              saveCfg({ sniffDebounceMs: Math.max(1000, parseInt(e.target.value) || 8000) })
            }
            style={{
              padding: '6px 8px',
              borderRadius: 8,
              fontSize: 12,
              background: 'var(--panel-2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value={3000}>{t('sniffDebounce3s')}</option>
            <option value={5000}>{t('sniffDebounce5s')}</option>
            <option value={8000}>{t('sniffDebounce8s')}</option>
            <option value={15000}>{t('sniffDebounce15s')}</option>
            <option value={30000}>{t('sniffDebounce30s')}</option>
          </select>
        </label>
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 10,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!cfg.interceptBrowserDownloads}
            onChange={e => saveCfg({ interceptBrowserDownloads: e.target.checked })}
          />{' '}
          {t('interceptBrowserDownloads')}
        </label>
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 10,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!cfg.captureMediaRequests}
            onChange={e => saveCfg({ captureMediaRequests: e.target.checked })}
          />{' '}
          {t('captureVideoAudio')}
        </label>
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 10,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!cfg.captureDocuments}
            onChange={e => saveCfg({ captureDocuments: e.target.checked })}
          />{' '}
          {t('captureDocs')}
        </label>
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 10,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!cfg.captureArchives}
            onChange={e => saveCfg({ captureArchives: e.target.checked })}
          />{' '}
          {t('captureArchives')}
        </label>
        <label
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginTop: 10,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={!!cfg.captureInstallers}
            onChange={e => saveCfg({ captureInstallers: e.target.checked })}
          />{' '}
          {t('captureInstallers')}
        </label>
      </div>

      {/* İndirme Zamanlayıcı (Scheduler) */}
      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>
          ⏰ {t('schedulerTitle') || 'İndirme Zamanlayıcı'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!cfg.scheduler?.enabled}
              onChange={e =>
                saveCfg({ scheduler: { ...cfg.scheduler, enabled: e.target.checked } })
              }
            />
            {t('schedulerEnabled') || 'Zamanlanmış indirmeyi etkinleştir'}
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ flex: 1 }}>
              {t('schedulerStart') || 'Başlangıç Saati'}
              <input
                type="time"
                value={cfg.scheduler?.startTime || '00:00'}
                onChange={e =>
                  saveCfg({ scheduler: { ...cfg.scheduler, startTime: e.target.value } })
                }
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: 6,
                  borderRadius: 8,
                  background: 'var(--panel-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  outline: 'none',
                }}
              />
            </label>
            <label style={{ flex: 1 }}>
              {t('schedulerStop') || 'Bitiş Saati'}
              <input
                type="time"
                value={cfg.scheduler?.stopTime || '00:00'}
                onChange={e =>
                  saveCfg({ scheduler: { ...cfg.scheduler, stopTime: e.target.value } })
                }
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: 6,
                  borderRadius: 8,
                  background: 'var(--panel-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  outline: 'none',
                }}
              />
            </label>
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>{t('schedulerDays') || 'Günler'}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {[
                { d: 1, l: 'Pzt' },
                { d: 2, l: 'Sal' },
                { d: 3, l: 'Çar' },
                { d: 4, l: 'Per' },
                { d: 5, l: 'Cum' },
                { d: 6, l: 'Cmt' },
                { d: 0, l: 'Paz' },
              ].map(day => {
                const days: number[] = cfg.scheduler?.days ?? [0, 1, 2, 3, 4, 5, 6];
                const active = days.includes(day.d);
                return (
                  <button
                    key={day.d}
                    onClick={() => {
                      const next = active ? days.filter(x => x !== day.d) : [...days, day.d];
                      saveCfg({ scheduler: { ...cfg.scheduler, days: next } });
                    }}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      color: active ? '#fff' : 'var(--text)',
                      background: active ? 'var(--accent-solid)' : 'var(--panel-2)',
                      border: '1px solid ' + (active ? 'var(--accent-solid)' : 'var(--border)'),
                    }}
                  >
                    {day.l}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>{t('schedulerOnce')}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input
                type="datetime-local"
                value={cfg.scheduler?.runOnceAt || ''}
                onChange={e =>
                  saveCfg({ scheduler: { ...cfg.scheduler, runOnceAt: e.target.value } })
                }
                style={{
                  flex: 1,
                  padding: 6,
                  borderRadius: 8,
                  background: 'var(--panel-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  outline: 'none',
                }}
              />
              {cfg.scheduler?.runOnceAt && (
                <button
                  onClick={() => saveCfg({ scheduler: { ...cfg.scheduler, runOnceAt: '' } })}
                  style={{
                    background: 'var(--panel-2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
              {t('schedulerOnceDesc')}
            </div>
          </div>
        </div>
      </div>

      {/* Site Girişleri */}
      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
          🔑 {t('siteLoginsTitle')}
        </div>
        <div className="text-muted" style={{ fontSize: 11, marginBottom: 10 }}>
          {t('siteLoginsDesc')}
        </div>
        {(cfg.siteLogins || []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {(cfg.siteLogins || []).map((l: any) => (
              <div
                key={l.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  padding: '6px 10px',
                  borderRadius: 10,
                  fontSize: 12,
                }}
              >
                <span
                  style={{
                    flex: 1,
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {l.host} • {l.username}
                </span>
                <button
                  onClick={() => removeSiteLogin(l.id)}
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--text-muted)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  title={t('remove')}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ flex: 2, minWidth: 140, fontSize: 12 }}>
            {t('siteHost')}
            <input
              type="text"
              value={siteHost}
              onChange={e => setSiteHost(e.target.value)}
              placeholder="example.com"
              style={inputStyle}
            />
          </label>
          <label style={{ flex: 1, minWidth: 110, fontSize: 12 }}>
            {t('siteUser')}
            <input
              type="text"
              value={siteUser}
              onChange={e => setSiteUser(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ flex: 1, minWidth: 110, fontSize: 12 }}>
            {t('sitePass')}
            <input
              type="password"
              value={sitePass}
              onChange={e => setSitePass(e.target.value)}
              style={inputStyle}
            />
          </label>
        </div>
        <button
          onClick={addSiteLogin}
          className="brand-gradient"
          style={{
            marginTop: 10,
            color: '#fff',
            border: 0,
            padding: '8px 12px',
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ＋ {t('siteAdd')}
        </button>
        <label style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
          {t('cookiesFromBrowser')}
          <select
            value={cfg.cookiesFromBrowser || 'none'}
            onChange={e => saveCfg({ cookiesFromBrowser: e.target.value })}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="none">{t('cookiesNone')}</option>
            <option value="chrome">Chrome</option>
            <option value="edge">Edge</option>
            <option value="firefox">Firefox</option>
            <option value="brave">Brave</option>
            <option value="opera">Opera</option>
          </select>
        </label>
      </div>

      {/* Bağlantı Ayarları */}
      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>
          🔌 {t('connSettingsTitle')}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
          <label style={{ flex: 1, minWidth: 140 }}>
            {t('partsCount')}
            <select
              value={cfg.partsCount ?? 8}
              onChange={e => saveCfg({ partsCount: parseInt(e.target.value) || 8 })}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {[1, 2, 4, 8, 12, 16].map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1, minWidth: 140 }}>
            {t('ytDlpFragments')}
            <select
              value={cfg.ytDlpFragments ?? 16}
              onChange={e => saveCfg({ ytDlpFragments: parseInt(e.target.value) || 16 })}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {[4, 8, 16, 24, 32].map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1, minWidth: 140 }}>
            {t('requestTimeout')}
            <select
              value={cfg.requestTimeoutMs ?? 30000}
              onChange={e => saveCfg({ requestTimeoutMs: parseInt(e.target.value) || 30000 })}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              {[
                { v: 5000, l: '5 sn' },
                { v: 15000, l: '15 sn' },
                { v: 30000, l: '30 sn' },
                { v: 60000, l: '60 sn' },
                { v: 120000, l: '120 sn' },
              ].map(o => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Özel Kategoriler */}
      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
          🏷️ {t('customCatsTitle')}
        </div>
        <div className="text-muted" style={{ fontSize: 11, marginBottom: 10 }}>
          {t('customCatsDesc')}
        </div>
        {(cfg.customCategories || []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {(cfg.customCategories || []).map((c: any, i: number) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  padding: '6px 10px',
                  borderRadius: 10,
                  fontSize: 12,
                }}
              >
                <span style={{ flex: 1, fontWeight: 700 }}>{c.name}</span>
                <span className="text-muted" style={{ fontSize: 11 }}>
                  {(c.extensions || []).join(', ')}
                </span>
                <button
                  onClick={() => removeCustomCat(i)}
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--text-muted)',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  title={t('remove')}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 140, fontSize: 12 }}>
            {t('customCatName')}
            <input
              type="text"
              value={catName}
              onChange={e => setCatName(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ flex: 2, minWidth: 180, fontSize: 12 }}>
            {t('customCatExts')}
            <input
              type="text"
              value={catExts}
              onChange={e => setCatExts(e.target.value)}
              placeholder="mp4, mkv"
              style={inputStyle}
            />
          </label>
        </div>
        <button
          onClick={addCustomCat}
          className="brand-gradient"
          style={{
            marginTop: 10,
            color: '#fff',
            border: 0,
            padding: '8px 12px',
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ＋ {t('siteAdd')}
        </button>
      </div>

      {/* Proxy Ayarları */}
      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>
          🌐 {t('proxyTitle') || 'Proxy Ayarları'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
          <label>
            {t('proxyMode') || 'Proxy Modu'}
            <select
              value={cfg.proxy?.mode || 'none'}
              onChange={e => saveCfg({ proxy: { ...cfg.proxy, mode: e.target.value } })}
              style={{
                width: '100%',
                marginTop: 4,
                padding: 8,
                borderRadius: 8,
                background: 'var(--panel-2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="system">{t('proxySystem') || 'Sistem Proxy'}</option>
              <option value="none">{t('proxyNone') || 'Proxy Yok'}</option>
              <option value="manual">{t('proxyManual') || 'Manuel Proxy'}</option>
              <option value="pac">{t('proxyPac') || 'Otomatik (PAC)'}</option>
            </select>
          </label>
          {cfg.proxy?.mode === 'manual' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ flex: 2 }}>
                {t('proxyHost') || 'Host'}
                <input
                  type="text"
                  placeholder="127.0.0.1"
                  value={cfg.proxy?.host || ''}
                  onChange={e => saveCfg({ proxy: { ...cfg.proxy, host: e.target.value } })}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: 6,
                    borderRadius: 8,
                    background: 'var(--panel-2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                  }}
                />
              </label>
              <label style={{ flex: 1 }}>
                Port
                <input
                  type="number"
                  placeholder="8080"
                  value={cfg.proxy?.port || ''}
                  onChange={e =>
                    saveCfg({ proxy: { ...cfg.proxy, port: parseInt(e.target.value) || 0 } })
                  }
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: 6,
                    borderRadius: 8,
                    background: 'var(--panel-2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                  }}
                />
              </label>
            </div>
          )}
          {cfg.proxy?.mode === 'manual' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ flex: 1 }}>
                Kullanıcı Adı
                <input
                  type="text"
                  value={cfg.proxy?.username || ''}
                  onChange={e => saveCfg({ proxy: { ...cfg.proxy, username: e.target.value } })}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: 6,
                    borderRadius: 8,
                    background: 'var(--panel-2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                  }}
                />
              </label>
              <label style={{ flex: 1 }}>
                Şifre
                <input
                  type="password"
                  value={cfg.proxy?.password || ''}
                  onChange={e => saveCfg({ proxy: { ...cfg.proxy, password: e.target.value } })}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: 6,
                    borderRadius: 8,
                    background: 'var(--panel-2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                  }}
                />
              </label>
            </div>
          )}
          {cfg.proxy?.mode === 'manual' && (
            <label>
              Hariç Tut (bypass, virgülle)
              <input
                type="text"
                placeholder="localhost,127.0.0.1"
                value={cfg.proxy?.bypass || ''}
                onChange={e => saveCfg({ proxy: { ...cfg.proxy, bypass: e.target.value } })}
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: 6,
                  borderRadius: 8,
                  background: 'var(--panel-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  outline: 'none',
                }}
              />
            </label>
          )}
          {cfg.proxy?.mode === 'pac' && (
            <label>
              PAC URL
              <input
                type="text"
                placeholder="http://ornek/proxy.pac"
                value={cfg.proxy?.pacUrl || ''}
                onChange={e => saveCfg({ proxy: { ...cfg.proxy, pacUrl: e.target.value } })}
                style={{
                  width: '100%',
                  marginTop: 4,
                  padding: 6,
                  borderRadius: 8,
                  background: 'var(--panel-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  outline: 'none',
                }}
              />
            </label>
          )}
        </div>
      </div>

      <div className="card-premium" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>{t('settingsTools')}</div>
        {status ? (
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                background: 'var(--panel-2)',
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid var(--border)',
              }}
            >
              <span>yt-dlp</span>
              <span>{status.ytdlpVer || (status.binExists || status.pathExists ? '✓' : '✗')}</span>
            </div>
            {updateInfo?.latest && (
              <div className="text-muted" style={{ fontSize: 11 }}>
                {t('latestVersion')} {updateInfo.latest}
              </div>
            )}
            <button
              onClick={updateYtDlp}
              disabled={updating}
              className="brand-gradient"
              style={{
                color: '#fff',
                border: 0,
                padding: '8px 12px',
                borderRadius: 10,
                fontWeight: 700,
              }}
            >
              {updating ? t('updating') : t('ytDlpUpdateBtn')}
            </button>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                background: 'var(--panel-2)',
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid var(--border)',
              }}
            >
              <span>ffmpeg</span>
              <span>{status.ffmpegOk ? t('ffmpegReady') : t('ffmpegMissing')}</span>
            </div>
            <div
              style={{
                background: 'var(--panel-2)',
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid var(--border)',
              }}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>{t('appUpdateTitle')}</span>
                <span className="text-muted" style={{ fontSize: 11 }}>
                  {appUpdateState === 'checking'
                    ? t('updating')
                    : appUpdateState === 'available'
                      ? `${t('updateAvailable')} ${appUpdateVersion}`
                      : appUpdateState === 'downloaded'
                        ? t('updateDownloaded')
                        : appUpdateState === 'uptodate'
                          ? t('updateNotAvailable')
                          : ''}
                </span>
              </div>
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  marginTop: 8,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={cfg.appAutoUpdate !== false}
                  onChange={e => saveCfg({ appAutoUpdate: e.target.checked })}
                />{' '}
                {t('appAutoUpdate')}
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={checkAppUpdate}
                  disabled={appUpdateState === 'checking'}
                  style={{
                    flex: 1,
                    background: 'var(--panel)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    padding: '8px 12px',
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🔄 {t('checkUpdates')}
                </button>
                {appUpdateState === 'downloaded' && (
                  <button
                    onClick={() => window.api?.quitAndInstall?.()}
                    className="brand-gradient"
                    style={{
                      flex: 1,
                      color: '#fff',
                      border: 0,
                      padding: '8px 12px',
                      borderRadius: 10,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ↺ {t('updateRestart')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-muted" style={{ fontSize: 12 }}>
            {t('loading')}
          </div>
        )}
      </div>
    </div>
  );
}
