import { describe, it, expect } from 'vitest';
import os from 'os';
import path from 'path';
import { detectSite, getSiteFolder, getDefaultDownloadDir } from './sites.ts';

describe('sites.ts', () => {
  describe('detectSite', () => {
    it('detects YouTube from various formats', () => {
      expect(detectSite('https://www.youtube.com/watch?v=123')).toBe('YouTube');
      expect(detectSite('https://youtu.be/123')).toBe('YouTube');
    });

    it('detects TikTok, Instagram, Twitter/X', () => {
      expect(detectSite('https://www.tiktok.com/@user/video/123')).toBe('TikTok');
      expect(detectSite('https://instagram.com/p/123')).toBe('Instagram');
      expect(detectSite('https://twitter.com/user/status/123')).toBe('X-Twitter');
      expect(detectSite('https://x.com/user/status/123')).toBe('X-Twitter');
    });

    it('detects Facebook, SoundCloud, Vimeo, Twitch', () => {
      expect(detectSite('https://facebook.com/watch?v=123')).toBe('Facebook');
      expect(detectSite('https://soundcloud.com/artist/song')).toBe('SoundCloud');
      expect(detectSite('https://vimeo.com/123')).toBe('Vimeo');
      expect(detectSite('https://twitch.tv/streamer')).toBe('Twitch');
    });

    it('falls back to Diger for other domains or invalid URLs', () => {
      expect(detectSite('https://example.com/file.zip')).toBe('Diger');
      expect(detectSite('not-a-valid-url')).toBe('Diger');
    });
  });

  describe('getSiteFolder', () => {
    it('returns base directory when siteFolders is false', () => {
      const folder = getSiteFolder('/downloads', 'https://youtube.com/watch?v=123', {
        siteFolders: false,
      });
      expect(folder).toBe('/downloads');
    });

    it('appends site name when siteFolders is true', () => {
      const folder = getSiteFolder('/downloads', 'https://youtube.com/watch?v=123', {
        siteFolders: true,
      });
      expect(folder).toBe(path.join('/downloads', 'YouTube'));
    });

    it('groups into category folders when categoryFolders is true', () => {
      const videoFolder = getSiteFolder('/downloads', 'https://example.com/movie.mp4', {
        siteFolders: false,
        categoryFolders: true,
      });
      expect(videoFolder).toBe(path.join('/downloads', 'Video'));

      const musicFolder = getSiteFolder('/downloads', 'https://example.com/song.mp3', {
        siteFolders: false,
        categoryFolders: true,
      });
      expect(musicFolder).toBe(path.join('/downloads', 'Music'));

      const archiveFolder = getSiteFolder('/downloads', 'https://example.com/pack.zip', {
        siteFolders: false,
        categoryFolders: true,
      });
      expect(archiveFolder).toBe(path.join('/downloads', 'Archives'));
    });
  });

  describe('getDefaultDownloadDir', () => {
    it('defaults to Downloads/VoltGet when no custom dir is given', () => {
      const expected = path.join(os.homedir(), 'Downloads', 'VoltGet');
      expect(getDefaultDownloadDir()).toBe(expected);
    });

    it('ignores legacy Flexplorer folder path', () => {
      const legacyPath = path.join(os.homedir(), 'Downloads', 'Flexplorer');
      const expected = path.join(os.homedir(), 'Downloads', 'VoltGet');
      expect(getDefaultDownloadDir(legacyPath)).toBe(expected);
    });
  });
});
