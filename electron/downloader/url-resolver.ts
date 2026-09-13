import { normalizeToMasterPlaylist, isPlayerOrEmbedUrl, isStreamUrl } from '../utils/playlist.js';

export interface ResolveContext {
  recentStreamsByPage: Map<string, string>;
}

export interface ResolvedUrl {
  finalUrl: string;
  rejectedAsScript: boolean;
}

export function isYouTubeUrl(u: string, pageUrl?: string): boolean {
  return (
    /youtube\.com|youtu\.be|googlevideo\.com/i.test(u || '') ||
    (!!pageUrl && /youtube\.com|youtu\.be/i.test(pageUrl))
  );
}

export function resolveFinalUrl(
  rawUrl: string,
  opts: { pageUrl?: string },
  ctx: ResolveContext
): ResolvedUrl {
  let finalUrl = normalizeToMasterPlaylist(rawUrl || '');
  const isYouTube = isYouTubeUrl(finalUrl, opts.pageUrl);

  if (isYouTube) {
    if (opts.pageUrl && /youtube\.com|youtu\.be/i.test(opts.pageUrl)) {
      finalUrl = opts.pageUrl;
    } else if (finalUrl.includes('googlevideo.com')) {
      for (const [key] of ctx.recentStreamsByPage.entries()) {
        if (/youtube\.com\/watch|youtu\.be\//i.test(key)) {
          finalUrl = key;
          break;
        }
      }
    }
    return { finalUrl, rejectedAsScript: false };
  }

  if (isPlayerOrEmbedUrl(finalUrl)) {
    const pageHost = (() => {
      try {
        return new URL(opts.pageUrl || '').hostname.replace(/^www\./i, '').toLowerCase();
      } catch {
        return '';
      }
    })();
    const urlHost = (() => {
      try {
        return new URL(finalUrl).hostname.replace(/^www\./i, '').toLowerCase();
      } catch {
        return '';
      }
    })();
    const matched =
      ctx.recentStreamsByPage.get(opts.pageUrl || '') ||
      ctx.recentStreamsByPage.get(finalUrl) ||
      (pageHost ? ctx.recentStreamsByPage.get(pageHost) : null) ||
      (urlHost ? ctx.recentStreamsByPage.get(urlHost) : null) ||
      ctx.recentStreamsByPage.get('latest');
    if (matched && isStreamUrl(matched)) finalUrl = matched;
  }

  const rejectedAsScript = /\.(js|mjs|cjs|jsx|ts|tsx|css|scss|map)($|\?)/i.test(finalUrl);
  return { finalUrl, rejectedAsScript };
}

export function fallbackTitle(title: string | undefined, pageUrl?: string): string | undefined {
  if (title && title !== 'Video' && title !== 'Dosya' && title !== 'İndiriliyor...') return title;
  if (!pageUrl) return title;
  try {
    const u = new URL(pageUrl);
    const slug = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '')
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ');
    if (slug && slug.length > 3) return slug.charAt(0).toUpperCase() + slug.slice(1);
  } catch {}
  return title;
}

const GENERIC_RE =
  /\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i;

export function isGenericFileUrl(
  finalUrl: string,
  filename?: string,
  isHttpOpt?: boolean
): boolean {
  if (isHttpOpt) return true;
  return GENERIC_RE.test(finalUrl) || (!!filename && GENERIC_RE.test(filename));
}

export function isHlsUrl(finalUrl: string): boolean {
  return (
    finalUrl.includes('.m3u8') ||
    finalUrl.includes('master.txt') ||
    finalUrl.includes('/hls/') ||
    finalUrl.includes('playmix') ||
    finalUrl.includes('cdnimages') ||
    finalUrl.includes('/q/') ||
    finalUrl.includes('molystream')
  );
}

export function isVideoPlatformUrl(finalUrl: string, pageUrl?: string): boolean {
  const re =
    /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|reddit\.com|twitch\.tv|vimeo\.com|soundcloud\.com/i;
  return re.test(finalUrl) || (!!pageUrl && re.test(pageUrl));
}
