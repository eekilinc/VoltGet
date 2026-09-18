import { describe, expect, it } from 'vitest';
import { formatDate, isTemporaryOrPartialFile, shortUrl } from './files-client';

describe('isTemporaryOrPartialFile', () => {
  it('flags partial and temp names', () => {
    expect(isTemporaryOrPartialFile('movie.mp4.part')).toBe(true);
    expect(isTemporaryOrPartialFile('.hidden')).toBe(true);
    expect(isTemporaryOrPartialFile('video.frag12.mp4')).toBe(true);
  });
  it('accepts finished files', () => {
    expect(isTemporaryOrPartialFile('movie.mp4')).toBe(false);
    expect(isTemporaryOrPartialFile('song.mp3')).toBe(false);
  });
  it('treats empty names as temporary', () => {
    expect(isTemporaryOrPartialFile('')).toBe(true);
  });
});

describe('formatDate', () => {
  it('formats timestamps and never throws', () => {
    expect(formatDate(0)).not.toBe('-');
    expect(formatDate(NaN)).toBe('-');
  });
});

describe('shortUrl', () => {
  it('truncates long urls', () => {
    expect(shortUrl('https://example.com/' + 'a'.repeat(100), 60)).toHaveLength(61);
    expect(shortUrl('short', 60)).toBe('short');
  });
});
