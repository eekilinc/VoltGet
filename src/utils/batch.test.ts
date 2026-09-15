import { describe, it, expect } from 'vitest';
import { expandUrlPattern, parseBatchInput } from './batch.ts';

describe('batch URL expansion', () => {
  it('expands numeric pattern with leading zeros', () => {
    const pattern = 'https://site.com/ep[01-05].mp4';
    const urls = expandUrlPattern(pattern);
    expect(urls).toEqual([
      'https://site.com/ep01.mp4',
      'https://site.com/ep02.mp4',
      'https://site.com/ep03.mp4',
      'https://site.com/ep04.mp4',
      'https://site.com/ep05.mp4',
    ]);
  });

  it('expands single-digit pattern without zero padding', () => {
    const pattern = 'https://site.com/img_[1-3].jpg';
    const urls = expandUrlPattern(pattern);
    expect(urls).toEqual([
      'https://site.com/img_1.jpg',
      'https://site.com/img_2.jpg',
      'https://site.com/img_3.jpg',
    ]);
  });

  it('expands alphabetical pattern [a-d]', () => {
    const pattern = 'https://site.com/part_[a-d].rar';
    const urls = expandUrlPattern(pattern);
    expect(urls).toEqual([
      'https://site.com/part_a.rar',
      'https://site.com/part_b.rar',
      'https://site.com/part_c.rar',
      'https://site.com/part_d.rar',
    ]);
  });

  it('parses multi-line input mixed with patterns', () => {
    const text = `
      https://site.com/file1.zip
      https://site.com/part[1-2].bin
      # this is a comment
      https://site.com/file1.zip
      site.com/extra.iso
    `;
    const urls = parseBatchInput(text);
    expect(urls).toEqual([
      'https://site.com/file1.zip',
      'https://site.com/part1.bin',
      'https://site.com/part2.bin',
      'https://site.com/extra.iso',
    ]);
  });
});
