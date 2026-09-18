import { describe, it, expect } from 'vitest';
import { tryHlsEarlyReturn, tryDirectFileEarlyReturn, parseInfo } from '../electron/analyze.ts';
import { normalizeToMasterPlaylist, isMasterPlaylistUrl } from '../electron/utils/playlist.ts';
import { parseSpeedToBytes, calcTotalSpeed } from '../src/utils/speed.ts';

describe('analyze.ts', () => {
  describe('tryHlsEarlyReturn', () => {
    it('returns info for master.txt URLs', () => {
      const result = tryHlsEarlyReturn('https://example.com/master.txt');
      expect(result).not.toBeNull();
      expect(result?.extractor).toBe('generic:hls');
      expect(result?.formats.length).toBe(2);
    });

    it('returns info for .m3u8 URLs', () => {
      const result = tryHlsEarlyReturn('https://example.com/stream.m3u8');
      expect(result).not.toBeNull();
      expect(result?.extractor).toBe('generic:hls');
    });

    it('returns null for non-HLS URLs', () => {
      const result = tryHlsEarlyReturn('https://example.com/video.mp4');
      expect(result).toBeNull();
    });

    it('returns info for /hls/ URLs', () => {
      const result = tryHlsEarlyReturn('https://example.com/hls/stream.m3u8');
      expect(result).not.toBeNull();
    });
  });

  describe('tryDirectFileEarlyReturn', () => {
    it('returns info for .zip URLs', () => {
      const result = tryDirectFileEarlyReturn('https://example.com/file.zip');
      expect(result).not.toBeNull();
      expect(result?.extractor).toBe('http');
    });

    it('returns info for .pdf URLs', () => {
      const result = tryDirectFileEarlyReturn('https://example.com/doc.pdf');
      expect(result).not.toBeNull();
    });

    it('returns null for non-file URLs', () => {
      const result = tryDirectFileEarlyReturn('https://youtube.com/watch?v=123');
      expect(result).toBeNull();
    });
  });

  describe('parseInfo', () => {
    it('separates audio and video formats', () => {
      const mockInfo = {
        title: 'Test Video',
        thumbnail: 'https://example.com/thumb.jpg',
        duration: 300,
        uploader: 'TestChannel',
        extractor: 'youtube',
        webpage_url: 'https://youtube.com/watch?v=123',
        description: 'Test description',
        formats: [
          {
            format_id: '137',
            ext: 'mp4',
            vcodec: 'avc1.640028',
            acodec: 'none',
            height: 1080,
            width: 1920,
            fps: 30,
            tbr: 4500,
            filesize: 50000000,
            resolution: '1920x1080',
            format_note: '1080p',
          },
          {
            format_id: '140',
            ext: 'm4a',
            vcodec: 'none',
            acodec: 'mp4a.40.2',
            height: 0,
            width: 0,
            fps: 0,
            tbr: 128,
            filesize: 5000000,
            resolution: 'Audio Only',
            format_note: 'Audio',
          },
        ],
      };
      const result = parseInfo(mockInfo);
      expect(result.videoFormats.length).toBe(1);
      expect(result.audioFormats.length).toBe(1);
      expect(result.videoFormats[0].height).toBe(1080);
      expect(result.audioFormats[0].isAudioOnly).toBe(true);
    });

    it('sorts video formats by height descending', () => {
      const mockInfo = {
        title: 'Test',
        formats: [
          {
            format_id: '135',
            ext: 'mp4',
            vcodec: 'avc1',
            acodec: 'none',
            height: 480,
            width: 854,
            tbr: 800,
            filesize: 10000000,
            resolution: '854x480',
          },
          {
            format_id: '137',
            ext: 'mp4',
            vcodec: 'avc1',
            acodec: 'none',
            height: 1080,
            width: 1920,
            tbr: 4500,
            filesize: 50000000,
            resolution: '1920x1080',
          },
          {
            format_id: '136',
            ext: 'mp4',
            vcodec: 'avc1',
            acodec: 'none',
            height: 720,
            width: 1280,
            tbr: 2500,
            filesize: 25000000,
            resolution: '1280x720',
          },
        ],
      };
      const result = parseInfo(mockInfo);
      expect(result.videoFormats[0].height).toBe(1080);
      expect(result.videoFormats[1].height).toBe(720);
      expect(result.videoFormats[2].height).toBe(480);
    });
  });
});

describe('playlist utilities', () => {
  it('normalizeToMasterPlaylist handles molystream embed', () => {
    const url = 'https://molystream.org/embed/abc123';
    const result = normalizeToMasterPlaylist(url);
    expect(result).toBe('https://dbx.molystream.org/embed/abc123/q/1');
  });

  it('isMasterPlaylistUrl detects master playlists', () => {
    expect(isMasterPlaylistUrl('https://example.com/master.m3u8')).toBe(true);
    expect(isMasterPlaylistUrl('https://example.com/master.txt')).toBe(true);
    expect(isMasterPlaylistUrl('https://example.com/playlist.m3u8')).toBe(true);
    expect(isMasterPlaylistUrl('https://example.com/video_123/playlist.m3u8')).toBe(false);
    expect(isMasterPlaylistUrl('https://example.com/index.m3u8')).toBe(true);
  });
});

describe('speed utilities', () => {
  it('parseSpeedToBytes converts KB/s correctly', () => {
    expect(parseSpeedToBytes('100 KB/s')).toBe(102400);
    expect(parseSpeedToBytes('1.5 MB/s')).toBeCloseTo(1.5 * 1024 * 1024, 0);
    expect(parseSpeedToBytes('500 B/s')).toBe(500);
    expect(parseSpeedToBytes('-')).toBe(0);
  });

  it('calcTotalSpeed sums multiple speeds', () => {
    const jobs = [
      { status: 'downloading', speed: '500 KB/s' },
      { status: 'downloading', speed: '1 MB/s' },
      { status: 'done', speed: '-' },
    ];
    const result = calcTotalSpeed(jobs);
    expect(result).toContain('MB/s');
  });
});
