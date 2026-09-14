import { useEffect, useState } from 'react';

export function useAppBootstrap(hasApi: boolean) {
  const [status, setStatus] = useState<any>(null);
  const [outDir, setOutDir] = useState('');
  const [appVersion, setAppVersion] = useState<string>('1.0.12');
  const [extConnected, setExtConnected] = useState(false);
  const [clipboardDetectedUrl, setClipboardDetectedUrl] = useState<string | null>(null);
  const [clipboardWatcherActive, setClipboardWatcherActive] = useState<boolean>(true);
  const [speedLimitKB, setSpeedLimitKB] = useState<number>(0);

  useEffect(() => {
    if (!hasApi) return;
    window.api
      ?.getAppVersion?.()
      .then((v: string) => {
        if (v) setAppVersion(v);
      })
      .catch(() => {});
    window.api
      .getYtDlpStatus()
      .then(setStatus)
      .catch(() => {});
    window.api
      .getDefaultDir()
      .then(setOutDir)
      .catch(() => {});
    window.api
      .getConfig?.()
      .then((c: any) => {
        if (c && typeof c.clipboardWatcher === 'boolean')
          setClipboardWatcherActive(c.clipboardWatcher);
        if (c && typeof c.speedLimitKB === 'number') setSpeedLimitKB(c.speedLimitKB);
      })
      .catch(() => {});
    window.api
      .getExtensionStatus?.()
      .then((res: any) => {
        if (res) setExtConnected(!!res.connected);
      })
      .catch(() => {});
  }, [hasApi]);

  useEffect(() => {
    if (!hasApi) return;
    const onClipboard = (d: { url: string }) => {
      if (d?.url) setClipboardDetectedUrl(d.url);
    };
    const onExt = (res: any) => {
      if (res) setExtConnected(!!res.connected);
    };
    window.api.onClipboardUrl?.(onClipboard);
    window.api.onExtensionStatus?.(onExt);
    return () => {};
  }, [hasApi]);

  const toggleClipboardWatcher = async () => {
    const next = !clipboardWatcherActive;
    setClipboardWatcherActive(next);
    await window.api?.setConfig?.({ clipboardWatcher: next });
  };

  return {
    status,
    setStatus,
    outDir,
    setOutDir,
    appVersion,
    extConnected,
    setExtConnected,
    clipboardDetectedUrl,
    setClipboardDetectedUrl,
    clipboardWatcherActive,
    toggleClipboardWatcher,
    speedLimitKB,
    setSpeedLimitKB,
  };
}
