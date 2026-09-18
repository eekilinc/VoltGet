import { describe, expect, it } from 'vitest';
import path from 'path';
import { resolveSafeOutPath } from './misc.js';

describe('resolveSafeOutPath', () => {
  it('keeps normal filenames', () => {
    const r = resolveSafeOutPath('/tmp/out', 'movie.mp4');
    expect(r.filename).toBe('movie.mp4');
    expect(r.outPath).toBe(path.join('/tmp/out', 'movie.mp4'));
  });
  it('neutralizes traversal and absolute paths', () => {
    const traversal = resolveSafeOutPath('/tmp/out', '../../evil.exe');
    expect(traversal.filename).not.toContain('..');
    expect(
      path.normalize(traversal.outPath).startsWith(path.normalize('/tmp/out' + path.sep))
    ).toBe(true);
    const absolute = resolveSafeOutPath('/tmp/out', '/etc/passwd');
    expect(path.basename(absolute.outPath)).toBe('passwd');
  });
  it('falls back for empty names', () => {
    const r = resolveSafeOutPath('/tmp/out', '');
    expect(r.filename.length).toBeGreaterThan(0);
  });
});
