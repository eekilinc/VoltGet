import { isHlsUrl, isVideoPlatformUrl } from './url-resolver.js';

export interface YtDlpArgsInput {
  finalUrl: string;
  pageUrl?: string;
  cookie?: string;
  speedLimitKB: number;
  isYouTube: boolean;
  username?: string;
  password?: string;
  cookiesFromBrowser?: string;
  fragments?: number;
}

export function extractHdFilmEmbedId(
  finalUrl: string,
  pageUrl?: string
): { embedId: string; isHdFilm: boolean } {
  const isHdFilm =
    finalUrl.includes('cdnimages') ||
    finalUrl.includes('playmix') ||
    finalUrl.includes('hdfilmcehennemi') ||
    (!!pageUrl && pageUrl.includes('hdfilmcehennemi'));
  let embedId = '';
  if (isHdFilm) {
    try {
      const m = finalUrl.match(/-([A-Za-z0-9]{8,12})\.mp4/);
      if (m) embedId = m[1];
    } catch {
      // Ignore match errors
    }
  }
  return { embedId, isHdFilm };
}

export function buildYtDlpArgs(input: YtDlpArgsInput): {
  args: string[];
  isHls: boolean;
  embedId: string;
} {
  const {
    finalUrl,
    pageUrl,
    cookie,
    speedLimitKB,
    isYouTube,
    username,
    password,
    cookiesFromBrowser,
    fragments,
  } = input;
  const isHls = isHlsUrl(finalUrl);
  const isVideoPlatform = isVideoPlatformUrl(finalUrl, pageUrl);
  const { embedId, isHdFilm } = extractHdFilmEmbedId(finalUrl, pageUrl);
  const fragCount = Math.min(32, Math.max(1, fragments ?? 16));
  const args: string[] = [
    '--js-runtimes',
    'node',
    '--remote-components',
    'ejs:github',
    '--no-warnings',
    '--concurrent-fragments',
    String(fragCount),
  ];
  if (speedLimitKB > 0) args.push('--limit-rate', `${speedLimitKB}K`);
  if (username) args.push('--username', username);
  if (password) args.push('--password', password);
  if (cookiesFromBrowser && cookiesFromBrowser !== 'none') {
    args.push('--cookies-from-browser', cookiesFromBrowser);
  }

  if (isHls) {
    args.push(
      '--extractor-args',
      'generic:variant_query',
      '--extractor-args',
      'generic:fragment_query',
      '--hls-use-mpegts'
    );
    if (isHdFilm && embedId) {
      args.push('--add-header', `Referer:https://hdfilmcehennemi.mobi/video/embed/${embedId}/`);
      args.push('--add-header', 'Origin:https://hdfilmcehennemi.mobi');
    } else if (finalUrl.includes('molystream')) {
      args.push('--add-header', 'Referer:https://dbx.molystream.org/');
      args.push('--add-header', 'Origin:https://dbx.molystream.org');
    } else if (pageUrl && !isVideoPlatform) {
      try {
        args.push('--add-header', `Referer:${pageUrl}`);
        args.push('--add-header', `Origin:${new URL(pageUrl).origin}`);
      } catch {
        // Ignore URL parsing errors
      }
    }
    args.push('--downloader', 'm3u8:native', '-N', '8');
  } else if (pageUrl && !isVideoPlatform) {
    try {
      args.push('--add-header', `Referer:${pageUrl}`);
      args.push('--add-header', `Origin:${new URL(pageUrl).origin}`);
    } catch {
      // Ignore URL parsing errors
    }
  }

  if (!isYouTube) {
    args.push(
      '--add-header',
      'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    if (cookie) args.push('--add-header', `Cookie:${cookie}`);
  }
  return { args, isHls, embedId };
}

export function buildFfmpegFallbackArgs(
  finalUrl: string,
  opts: { pageUrl?: string; cookie?: string; embedId?: string },
  tempOut: string
): string[] {
  let headers =
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n';
  if (opts.embedId) {
    headers += `Referer: https://hdfilmcehennemi.mobi/video/embed/${opts.embedId}/\r\nOrigin: https://hdfilmcehennemi.mobi\r\n`;
  } else if (opts.pageUrl) {
    try {
      headers += `Referer: ${opts.pageUrl}\r\nOrigin: ${new URL(opts.pageUrl).origin}\r\n`;
    } catch {}
  }
  if (opts.cookie) headers += `Cookie: ${opts.cookie}\r\n`;
  return [
    '-headers',
    headers,
    '-allowed_segment_extensions',
    'ALL',
    '-allowed_extensions',
    'ALL',
    '-extension_picky',
    '0',
    '-reconnect',
    '1',
    '-reconnect_at_eof',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '5',
    '-i',
    finalUrl,
    '-c',
    'copy',
    '-bsf:a',
    'aac_adtstoasc',
    tempOut,
  ];
}
