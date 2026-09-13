import { isMasterPlaylistUrl, isStreamUrl } from './utils/playlist.js';

export class SniffDeduper {
  private recentByPage = new Map<string, string>();

  remember(url: string, pageUrl?: string): void {
    if (!url || !isStreamUrl(url)) return;
    const isMaster = isMasterPlaylistUrl(url);
    const latest = this.recentByPage.get('latest');
    if (isMaster || !latest || !isMasterPlaylistUrl(latest)) {
      this.recentByPage.set('latest', url);
    }
    if (pageUrl) {
      const existing = this.recentByPage.get(pageUrl);
      if (isMaster || !existing || !isMasterPlaylistUrl(existing)) {
        this.recentByPage.set(pageUrl, url);
      }
      try {
        const u = new URL(pageUrl);
        const cleanHost = u.hostname.replace(/^www\./i, '').toLowerCase();
        const existingHost = this.recentByPage.get(cleanHost);
        if (isMaster || !existingHost || !isMasterPlaylistUrl(existingHost)) {
          this.recentByPage.set(cleanHost, url);
          this.recentByPage.set(u.hostname, url);
        }
      } catch {}
    }
    try {
      const u = new URL(url);
      const cleanHost = u.hostname.replace(/^www\./i, '').toLowerCase();
      const existingHost = this.recentByPage.get(cleanHost);
      if (isMaster || !existingHost || !isMasterPlaylistUrl(existingHost)) {
        this.recentByPage.set(cleanHost, url);
      }
    } catch {}
  }

  resolve(pageUrl?: string, url?: string): string | null {
    const pageHost = (() => {
      try {
        return new URL(pageUrl || '').hostname.replace(/^www\./i, '').toLowerCase();
      } catch {
        return '';
      }
    })();
    const urlHost = (() => {
      try {
        return new URL(url || '').hostname.replace(/^www\./i, '').toLowerCase();
      } catch {
        return '';
      }
    })();
    return (
      this.recentByPage.get(pageUrl || '') ||
      this.recentByPage.get(url || '') ||
      (pageHost ? this.recentByPage.get(pageHost) : null) ||
      (urlHost ? this.recentByPage.get(urlHost) : null) ||
      this.recentByPage.get('latest') ||
      null
    );
  }

  entries(): IterableIterator<[string, string]> {
    return this.recentByPage.entries();
  }
}

const SCRIPT_RE = /\.(js|mjs|cjs|jsx|ts|tsx|css|scss|map)($|\?)/i;

export function shouldIgnoreSniffUrl(url: string, filename?: string): boolean {
  return SCRIPT_RE.test(url || '') || SCRIPT_RE.test(filename || '');
}

export interface SniffFormat {
  id: string;
  resolution: string;
  ext: string;
  note: string;
}

export function buildDefaultSniffFormats(isGeneric: boolean, urlEndsPdf: boolean): SniffFormat[] {
  if (isGeneric || urlEndsPdf) return [];
  return [
    {
      id: 'best',
      resolution: '🎬 En İyi Kalite (Önerilen)',
      ext: 'mp4',
      note: 'Otomatik En Yüksek Kalite',
    },
    {
      id: 'bestvideo[height<=2160]+bestaudio/best[height<=2160]/best',
      resolution: '🎬 4K Ultra HD (2160p)',
      ext: 'mp4',
      note: 'Ultra HD',
    },
    {
      id: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best',
      resolution: '🎬 1080p Full HD',
      ext: 'mp4',
      note: 'Full HD',
    },
    {
      id: 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
      resolution: '🎬 720p HD',
      ext: 'mp4',
      note: 'Standart HD',
    },
    {
      id: 'bestvideo[height<=480]+bestaudio/best[height<=480]/best',
      resolution: '🎬 480p SD',
      ext: 'mp4',
      note: 'Hızlı İndirme',
    },
    {
      id: 'bestaudio/best',
      resolution: '🎵 MP3 / Sadece Ses',
      ext: 'mp3',
      note: 'En Yüksek Ses Kalitesi',
    },
  ];
}
