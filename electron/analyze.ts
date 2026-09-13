import type { SniffDeduper } from './sniff.js';

export interface AnalyzeInfo {
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  extractor: string;
  webpage_url?: string;
  description?: string;
  formats: any[];
  videoFormats: any[];
  audioFormats: any[];
  best?: any;
}

export function tryHlsEarlyReturn(normUrl: string): AnalyzeInfo | null {
  if (
    !(
      normUrl.includes('master.txt') ||
      normUrl.includes('.m3u8') ||
      normUrl.includes('/hls/') ||
      normUrl.includes('playmix') ||
      normUrl.includes('cdnimages') ||
      normUrl.includes('/q/') ||
      normUrl.includes('molystream')
    )
  )
    return null;
  const fn =
    normUrl.split('/').slice(-2, -1)[0] ||
    normUrl.split('/').pop()?.split('?')[0] ||
    'HLS Video Akışı';
  return {
    title: fn.replace(/\.mp4$/i, ''),
    thumbnail: '',
    duration: 0,
    uploader: 'HLS Stream',
    extractor: 'generic:hls',
    formats: [
      {
        id: 'best',
        resolution: '🎬 En İyi Kalite (Hızlı İndir)',
        ext: 'mp4',
        height: 1080,
        tbr: 0,
        filesize: 0,
        note: 'Otomatik Önerilen',
      },
      {
        id: 'bestaudio/best',
        resolution: '🎵 Sadece Ses (MP3)',
        ext: 'mp3',
        height: 0,
        tbr: 0,
        filesize: 0,
        isAudioOnly: true,
        note: 'Ses Akışı',
      },
    ],
    videoFormats: [
      {
        id: 'best',
        resolution: '🎬 En İyi Kalite (Hızlı İndir)',
        ext: 'mp4',
        height: 1080,
        note: 'HLS Akışı',
      },
    ],
    audioFormats: [
      {
        id: 'bestaudio/best',
        resolution: '🎵 Sadece Ses (MP3)',
        ext: 'mp3',
        height: 0,
        isAudioOnly: true,
        note: 'MP3',
      },
    ],
  };
}

export function tryDirectFileEarlyReturn(normUrl: string): AnalyzeInfo | null {
  if (
    !/\.(zip|rar|7z|gz|tar|iso|exe|msi|apk|dmg|pdf|doc|docx|xls|xlsx|ppt|pptx|epub|torrent)($|\?)/i.test(
      normUrl
    )
  )
    return null;
  const fn = normUrl.split('/').pop()?.split('?')[0] || 'İndirilen Dosya';
  return {
    title: fn,
    thumbnail: '',
    duration: 0,
    uploader: 'Doğrudan İndirme',
    extractor: 'http',
    formats: [
      {
        id: 'direct',
        resolution: 'Dosya İndirme',
        ext: fn.split('.').pop() || 'bin',
        height: 0,
        tbr: 0,
        filesize: 0,
        note: '8 Parçalı Hızlı İndirme',
      },
    ],
    videoFormats: [],
    audioFormats: [],
  };
}

export function resolveAnalyzeUrl(
  normUrl: string,
  deduper: SniffDeduper,
  legacy: Map<string, string>,
  isPlayerUrl: (u: string) => boolean,
  isStreamUrl: (u: string) => boolean
): string {
  if (isPlayerUrl(normUrl)) {
    const matched =
      deduper.resolve(normUrl, normUrl) || legacy.get(normUrl) || legacy.get('latest');
    if (matched && isStreamUrl(matched)) return matched;
  }
  return normUrl;
}

export function parseInfo(info: any): AnalyzeInfo {
  const rawFormats = info.formats || [];
  const videoFormats: any[] = [];
  const audioFormats: any[] = [];
  rawFormats.forEach((f: any) => {
    const isAudioOnly = (f.vcodec === 'none' || !f.vcodec) && f.acodec !== 'none';
    const isVideo = f.vcodec && f.vcodec !== 'none';
    const item = {
      id: f.format_id,
      ext: f.ext,
      resolution: f.resolution || (f.height ? `${f.width}x${f.height}` : 'Audio Only'),
      height: f.height || 0,
      fps: f.fps || 0,
      vcodec: f.vcodec,
      acodec: f.acodec,
      filesize: f.filesize || f.filesize_approx || 0,
      tbr: f.tbr || 0,
      isAudioOnly,
      note: f.format_note || (isAudioOnly ? 'Ses Akışı' : ''),
    };
    if (isAudioOnly) audioFormats.push(item);
    else if (isVideo) videoFormats.push(item);
  });
  videoFormats.sort((a, b) => b.height - a.height || b.tbr - a.tbr);
  audioFormats.sort((a, b) => b.tbr - a.tbr || b.filesize - a.filesize);
  return {
    title: info.title,
    thumbnail: info.thumbnail,
    duration: info.duration,
    uploader: info.uploader,
    extractor: info.extractor,
    webpage_url: info.webpage_url,
    description: (info.description || '').slice(0, 500),
    formats: [...videoFormats, ...audioFormats],
    videoFormats,
    audioFormats,
    best: videoFormats[0] || audioFormats[0],
  };
}
