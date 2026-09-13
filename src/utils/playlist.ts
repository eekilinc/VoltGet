// Client-safe playlist helpers (mirrors electron/utils/playlist.ts, no node deps)
export function normalizeToMasterPlaylist(url: string): string {
  if (!url || typeof url !== 'string') return url;
  if (/molystream\.org\/embed\/([a-zA-Z0-9_-]+)($|\?)/i.test(url)) {
    return url.replace(
      /molystream\.org\/embed\/([a-zA-Z0-9_-]+)($|\?)/i,
      'https://dbx.molystream.org/embed/$1/q/1'
    );
  }
  if (/\/(?:txt\/)?[a-zA-Z0-9_.-]*sublist[a-zA-Z0-9_.-]*\.(txt|m3u8)/i.test(url)) {
    return url.replace(
      /\/(?:txt\/)?[a-zA-Z0-9_.-]*sublist[a-zA-Z0-9_.-]*\.(txt|m3u8).*/i,
      '/master.$1'
    );
  }
  if (/\/(?:tracks-[va]\d+|video_\d+|audio_\d+)\/[^/]+\.m3u8/i.test(url)) {
    return url.replace(/\/(?:tracks-[va]\d+|video_\d+|audio_\d+)\/[^/]+\.m3u8.*/i, '/master.m3u8');
  }
  return url;
}

export function isMasterPlaylistUrl(u: string): boolean {
  if (!u || typeof u !== 'string') return false;
  return (
    /master\.(txt|m3u8)|manifest\.mpd|\/q\/\d+/i.test(u) ||
    (/(playlist|index)\.m3u8/i.test(u) && !/(?:video|audio|_vid|_aud|tracks-v)/i.test(u))
  );
}

export function isStreamUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return (
    /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|mov|flv)($|\?)/i.test(url) ||
    url.includes('/q/') ||
    url.includes('master.txt') ||
    url.includes('/hls/') ||
    url.includes('playmix') ||
    url.includes('cdnimages') ||
    url.includes('videoplayback') ||
    url.includes('googlevideo.com')
  );
}
