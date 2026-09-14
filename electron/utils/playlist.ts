export function normalizeToMasterPlaylist(url: string): string {
  if (!url || typeof url !== 'string') return url;
  if (/(?:https?:\/\/)?molystream\.org\/embed\/([a-zA-Z0-9_-]+)($|\?)/i.test(url)) {
    return url.replace(
      /(?:https?:\/\/)?molystream\.org\/embed\/([a-zA-Z0-9_-]+)($|\?)/i,
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

export function isPlayerOrEmbedUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (isStreamUrl(url)) return false;
  if (
    /\.(zip|rar|7z|tar|gz|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(
      url
    )
  )
    return false;
  return (
    /\/(embed|player|oynat|video\/embed|iframe)\//i.test(url) ||
    url.includes('rapidrame_id') ||
    /\.(html|htm|php|asp|aspx)($|\?)/i.test(url)
  );
}

export function isDownloadableUrl(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  text = text.trim();
  if (!text.startsWith('http://') && !text.startsWith('https://')) return false;
  if (text.length > 2000) return false;
  const videoSites =
    /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|reddit\.com|vimeo\.com|dailymotion\.com|twitch\.tv|ddizi|dizibox|hdfilmcehennemi/i;
  const mediaExts =
    /\.(m3u8|mpd|mp4|webm|mkv|avi|mp3|m4a|flac|wav|mov|flv|zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i;
  return videoSites.test(text) || mediaExts.test(text);
}
