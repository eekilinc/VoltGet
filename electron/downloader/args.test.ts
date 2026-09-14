import { describe, it, expect } from 'vitest';
import { buildYtDlpArgs, extractHdFilmEmbedId, buildFfmpegFallbackArgs } from './args.ts';

describe('args.ts', () => {
  describe('extractHdFilmEmbedId', () => {
    it('extracts embedId matching pattern from finalUrl', () => {
      const url = 'https://cdnimages.example.com/video-ABC12345.mp4';
      const result = extractHdFilmEmbedId(url);
      expect(result.isHdFilm).toBe(true);
      expect(result.embedId).toBe('ABC12345');
    });

    it('identifies hdfilmcehennemi from pageUrl', () => {
      const result = extractHdFilmEmbedId(
        'https://example.com/stream.m3u8',
        'https://hdfilmcehennemi.mobi/film-izle'
      );
      expect(result.isHdFilm).toBe(true);
    });

    it('returns false for unrelated URLs', () => {
      const result = extractHdFilmEmbedId(
        'https://example.com/video.mp4',
        'https://example.com/watch'
      );
      expect(result.isHdFilm).toBe(false);
      expect(result.embedId).toBe('');
    });
  });

  describe('buildYtDlpArgs', () => {
    it('builds standard args with concurrency and runtime', () => {
      const result = buildYtDlpArgs({
        finalUrl: 'https://youtube.com/watch?v=123',
        speedLimitKB: 0,
        isYouTube: true,
      });
      expect(result.args).toContain('--js-runtimes');
      expect(result.args).toContain('--concurrent-fragments');
      expect(result.args).toContain('16');
      expect(result.isHls).toBe(false);
    });

    it('includes rate limit and custom fragments', () => {
      const result = buildYtDlpArgs({
        finalUrl: 'https://youtube.com/watch?v=123',
        speedLimitKB: 2048,
        isYouTube: true,
        fragments: 8,
      });
      expect(result.args).toContain('--limit-rate');
      expect(result.args).toContain('2048K');
      expect(result.args).toContain('8');
    });

    it('applies HLS specific arguments and native downloader for m3u8', () => {
      const result = buildYtDlpArgs({
        finalUrl: 'https://example.com/stream.m3u8',
        speedLimitKB: 0,
        isYouTube: false,
      });
      expect(result.isHls).toBe(true);
      expect(result.args).toContain('--hls-use-mpegts');
      expect(result.args).toContain('m3u8:native');
    });

    it('adds authentication credentials when provided', () => {
      const result = buildYtDlpArgs({
        finalUrl: 'https://example.com/protected/video.mp4',
        speedLimitKB: 0,
        isYouTube: false,
        username: 'user1',
        password: 'secretpassword',
      });
      expect(result.args).toContain('--username');
      expect(result.args).toContain('user1');
      expect(result.args).toContain('--password');
      expect(result.args).toContain('secretpassword');
    });

    it('adds cookies from browser flag when specified', () => {
      const result = buildYtDlpArgs({
        finalUrl: 'https://example.com/video.mp4',
        speedLimitKB: 0,
        isYouTube: false,
        cookiesFromBrowser: 'chrome',
      });
      expect(result.args).toContain('--cookies-from-browser');
      expect(result.args).toContain('chrome');
    });
  });

  describe('buildFfmpegFallbackArgs', () => {
    it('constructs ffmpeg args with copy codec and input URL', () => {
      const args = buildFfmpegFallbackArgs(
        'https://example.com/hls/playlist.m3u8',
        { pageUrl: 'https://example.com/movie' },
        '/path/to/output.mp4'
      );
      expect(args).toContain('-i');
      expect(args).toContain('https://example.com/hls/playlist.m3u8');
      expect(args).toContain('-c');
      expect(args).toContain('copy');
      expect(args).toContain('/path/to/output.mp4');
    });

    it('includes custom cookie and embed headers when provided', () => {
      const args = buildFfmpegFallbackArgs(
        'https://example.com/stream.m3u8',
        { embedId: 'XYZ987', cookie: 'session=123' },
        '/path/to/output.mp4'
      );
      const headersIndex = args.indexOf('-headers');
      expect(headersIndex).toBeGreaterThanOrEqual(0);
      const headersString = args[headersIndex + 1];
      expect(headersString).toContain('https://hdfilmcehennemi.mobi/video/embed/XYZ987/');
      expect(headersString).toContain('Cookie: session=123');
    });
  });
});
