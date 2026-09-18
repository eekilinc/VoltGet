import { describe, expect, it } from 'vitest';
import { isGenericFileUrl, isMultiSegmentUrl } from './fileTypes';

describe('isGenericFileUrl', () => {
  it('matches generic file extensions', () => {
    expect(isGenericFileUrl('https://example.com/a.zip')).toBe(true);
    expect(isGenericFileUrl('https://example.com/a.pdf?x=1')).toBe(true);
    expect(isGenericFileUrl('https://example.com/setup.exe')).toBe(true);
  });
  it('matches generic type names', () => {
    expect(isGenericFileUrl('https://example.com/stream', 'torrent')).toBe(true);
    expect(isGenericFileUrl('https://example.com/stream', 'FILE')).toBe(true);
  });
  it('rejects media pages and empty urls', () => {
    expect(isGenericFileUrl('https://youtube.com/watch?v=1', 'media')).toBe(false);
    expect(isGenericFileUrl('')).toBe(false);
  });
});

describe('isMultiSegmentUrl', () => {
  it('flags archives and installers as multi-segment', () => {
    expect(isMultiSegmentUrl('https://example.com/a.rar', '')).toBe(true);
    expect(isMultiSegmentUrl('https://example.com/x', 'setup.msi')).toBe(true);
  });
  it('ignores plain video pages', () => {
    expect(isMultiSegmentUrl('https://youtube.com/watch?v=1', '')).toBe(false);
  });
});
