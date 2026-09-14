import { describe, it, expect } from 'vitest';
import {
  isYouTubeUrl,
  resolveFinalUrl,
  fallbackTitle,
  isGenericFileUrl,
  isHlsUrl,
  isVideoPlatformUrl,
  type ResolveContext,
} from './url-resolver.ts';

describe('url-resolver.ts', () => {
  describe('isYouTubeUrl', () => {
    it('detects standard youtube watch URL', () => {
      expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    });

    it('detects short youtu.be URL', () => {
      expect(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    });

    it('detects googlevideo stream URL', () => {
      expect(
        isYouTubeUrl('https://rr1---sn-4g5edn6s.googlevideo.com/videoplayback?expire=123')
      ).toBe(true);
    });

    it('detects YouTube via pageUrl parameter', () => {
      expect(
        isYouTubeUrl('https://example.com/stream.mp4', 'https://www.youtube.com/watch?v=123')
      ).toBe(true);
    });

    it('returns false for non-youtube URLs', () => {
      expect(isYouTubeUrl('https://vimeo.com/123456')).toBe(false);
      expect(isYouTubeUrl('https://example.com/video.mp4')).toBe(false);
    });
  });

  describe('isGenericFileUrl', () => {
    it('returns true if isHttpOpt is set', () => {
      expect(isGenericFileUrl('https://example.com/anything', undefined, true)).toBe(true);
    });

    it('detects common archive and installer extensions', () => {
      expect(isGenericFileUrl('https://example.com/archive.zip')).toBe(true);
      expect(isGenericFileUrl('https://example.com/setup.exe')).toBe(true);
      expect(isGenericFileUrl('https://example.com/disk.iso')).toBe(true);
      expect(isGenericFileUrl('https://example.com/document.pdf')).toBe(true);
      expect(isGenericFileUrl('https://example.com/data.rar?token=123')).toBe(true);
    });

    it('detects generic file extension from filename parameter', () => {
      expect(isGenericFileUrl('https://example.com/download/file?id=99', 'archive.7z')).toBe(true);
    });

    it('returns false for regular web/video pages', () => {
      expect(isGenericFileUrl('https://example.com/watch?v=123')).toBe(false);
      expect(isGenericFileUrl('https://example.com/stream.m3u8')).toBe(false);
    });
  });

  describe('isHlsUrl', () => {
    it('detects .m3u8 playlists', () => {
      expect(isHlsUrl('https://example.com/video/master.m3u8')).toBe(true);
      expect(isHlsUrl('https://example.com/video/index.m3u8?token=xyz')).toBe(true);
    });

    it('detects master.txt playlists', () => {
      expect(isHlsUrl('https://example.com/video/master.txt')).toBe(true);
    });

    it('detects /hls/ and known streaming CDN tokens', () => {
      expect(isHlsUrl('https://cdn.example.com/hls/1080p/index.m3u8')).toBe(true);
      expect(isHlsUrl('https://example.com/playmix/segment-1.ts')).toBe(true);
      expect(isHlsUrl('https://example.com/cdnimages/v1')).toBe(true);
      expect(isHlsUrl('https://example.com/q/1080')).toBe(true);
      expect(isHlsUrl('https://dbx.molystream.org/embed/123')).toBe(true);
    });

    it('returns false for direct MP4 links without HLS markers', () => {
      expect(isHlsUrl('https://example.com/video.mp4')).toBe(false);
    });
  });

  describe('isVideoPlatformUrl', () => {
    it('identifies major video and social platforms', () => {
      expect(isVideoPlatformUrl('https://tiktok.com/@user/video/123')).toBe(true);
      expect(isVideoPlatformUrl('https://instagram.com/reel/123')).toBe(true);
      expect(isVideoPlatformUrl('https://twitter.com/user/status/123')).toBe(true);
      expect(isVideoPlatformUrl('https://x.com/user/status/123')).toBe(true);
      expect(isVideoPlatformUrl('https://reddit.com/r/videos/comments/123')).toBe(true);
      expect(isVideoPlatformUrl('https://twitch.tv/channel')).toBe(true);
      expect(isVideoPlatformUrl('https://vimeo.com/12345')).toBe(true);
      expect(isVideoPlatformUrl('https://soundcloud.com/artist/track')).toBe(true);
    });

    it('detects video platform from pageUrl', () => {
      expect(
        isVideoPlatformUrl('https://cdn.example.com/media.mp4', 'https://tiktok.com/@user/123')
      ).toBe(true);
    });

    it('returns false for generic websites', () => {
      expect(isVideoPlatformUrl('https://wikipedia.org/wiki/File')).toBe(false);
    });
  });

  describe('fallbackTitle', () => {
    it('preserves valid custom titles', () => {
      expect(fallbackTitle('Inception (2010)')).toBe('Inception (2010)');
    });

    it('ignores generic placeholder titles and generates from pageUrl slug', () => {
      expect(fallbackTitle('Video', 'https://example.com/movies/matrix-resurrections.html')).toBe(
        'Matrix resurrections'
      );
      expect(fallbackTitle('Dosya', 'https://example.com/download/ultimate-pack-2024.zip')).toBe(
        'Ultimate pack 2024'
      );
      expect(fallbackTitle(undefined, 'https://example.com/watch/interstellar_imax')).toBe(
        'Interstellar imax'
      );
    });

    it('handles encoded URLs', () => {
      expect(fallbackTitle('Video', 'https://example.com/films/%C3%B6zel-film-izle')).toBe(
        'Özel film izle'
      );
    });

    it('returns original title when pageUrl is missing or invalid', () => {
      expect(fallbackTitle('Video')).toBe('Video');
      expect(fallbackTitle('Video', 'not-a-valid-url')).toBe('Video');
    });
  });

  describe('resolveFinalUrl', () => {
    const emptyCtx: ResolveContext = { recentStreamsByPage: new Map() };

    it('resolves YouTube googlevideo to page URL if available in context', () => {
      const ctx: ResolveContext = {
        recentStreamsByPage: new Map([
          [
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'https://googlevideo.com/videoplayback?id=123',
          ],
        ]),
      };
      const result = resolveFinalUrl('https://rr1.googlevideo.com/videoplayback', {}, ctx);
      expect(result.finalUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(result.rejectedAsScript).toBe(false);
    });

    it('rejects JavaScript, TypeScript and CSS asset URLs', () => {
      expect(resolveFinalUrl('https://example.com/app.js', {}, emptyCtx).rejectedAsScript).toBe(
        true
      );
      expect(
        resolveFinalUrl('https://example.com/main.mjs?v=2', {}, emptyCtx).rejectedAsScript
      ).toBe(true);
      expect(resolveFinalUrl('https://example.com/style.css', {}, emptyCtx).rejectedAsScript).toBe(
        true
      );
      expect(
        resolveFinalUrl('https://example.com/bundle.js.map', {}, emptyCtx).rejectedAsScript
      ).toBe(true);
    });

    it('resolves embed player URLs using recent streams mapping in context', () => {
      const ctx: ResolveContext = {
        recentStreamsByPage: new Map([
          [
            'https://example.com/player/embed/movie123',
            'https://stream.example.com/hls/movie123.m3u8',
          ],
        ]),
      };
      const result = resolveFinalUrl(
        'https://example.com/player/embed/movie123',
        { pageUrl: 'https://example.com/player/embed/movie123' },
        ctx
      );
      expect(result.finalUrl).toBe('https://stream.example.com/hls/movie123.m3u8');
      expect(result.rejectedAsScript).toBe(false);
    });
  });
});
