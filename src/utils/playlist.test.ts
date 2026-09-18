import { describe, expect, it } from 'vitest';
import { isMasterPlaylistUrl, isStreamUrl, normalizeToMasterPlaylist } from './playlist';

describe('normalizeToMasterPlaylist', () => {
  it('leaves ordinary urls untouched', () => {
    expect(normalizeToMasterPlaylist('https://youtube.com/watch?v=1')).toBe(
      'https://youtube.com/watch?v=1'
    );
    expect(normalizeToMasterPlaylist('')).toBe('');
  });
  it('collapses track playlists to master', () => {
    expect(normalizeToMasterPlaylist('https://cdn.example.com/video_720/index.m3u8')).toBe(
      'https://cdn.example.com/master.m3u8'
    );
    expect(normalizeToMasterPlaylist('https://cdn.example.com/tracks-v1/seg.m3u8?token=1')).toBe(
      'https://cdn.example.com/master.m3u8'
    );
  });
});

describe('isMasterPlaylistUrl', () => {
  it('detects master playlists', () => {
    expect(isMasterPlaylistUrl('https://x/master.m3u8')).toBe(true);
    expect(isMasterPlaylistUrl('https://x/manifest.mpd')).toBe(true);
  });
  it('rejects rendition playlists', () => {
    expect(isMasterPlaylistUrl('https://x/tracks-v1.m3u8')).toBe(false);
    expect(isMasterPlaylistUrl('')).toBe(false);
  });
});

describe('isStreamUrl', () => {
  it('detects streams and chunk hosts', () => {
    expect(isStreamUrl('https://x/v.m3u8')).toBe(true);
    expect(isStreamUrl('https://googlevideo.com/videoplayback?x=1')).toBe(true);
  });
  it('rejects pages', () => {
    expect(isStreamUrl('https://example.com/article')).toBe(false);
  });
});
