import { clipboard } from 'electron';
import { isDownloadableUrl } from './utils/playlist.js';

export function createClipboardWatcher(opts: {
  getEnabled: () => boolean;
  onUrl: (url: string) => void;
}): { start: () => void; stop: () => void } {
  let lastText = '';
  let timer: NodeJS.Timeout | null = null;
  const tick = () => {
    try {
      if (!opts.getEnabled()) return;
      const text = clipboard.readText().trim();
      if (!text || text === lastText) return;
      lastText = text;
      if (isDownloadableUrl(text)) {
        console.log('[VoltGet] Clipboard media URL detected:', text.slice(0, 70));
        opts.onUrl(text);
      }
    } catch {}
  };
  return {
    start() {
      if (timer) return;
      timer = setInterval(tick, 1200);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

export function isStartHidden(argv: string[], startMinimized: boolean): boolean {
  return startMinimized || argv.includes('--hidden');
}
