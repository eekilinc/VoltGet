import { describe, expect, it } from 'vitest';
import { calcTotalSpeed, formatBytes, formatTotalSpeed, parseSpeedToBytes } from './speed';

describe('parseSpeedToBytes', () => {
  it('parses common units', () => {
    expect(parseSpeedToBytes('1.5 MB/s')).toBe(1.5 * 1024 * 1024);
    expect(parseSpeedToBytes('512 KB/s')).toBe(512 * 1024);
    expect(parseSpeedToBytes('-')).toBe(0);
    expect(parseSpeedToBytes('nonsense')).toBe(0);
  });
});

describe('calcTotalSpeed', () => {
  it('sums only downloading jobs', () => {
    expect(
      calcTotalSpeed([
        { status: 'downloading', speed: '1.5 MB/s' },
        { status: 'paused', speed: '9 MB/s' },
      ])
    ).toBe('1.5 MB/s');
    expect(calcTotalSpeed([{ status: 'paused', speed: '1 MB/s' }])).toBeNull();
  });
});

describe('formatTotalSpeed / formatBytes', () => {
  it('formats human readable values', () => {
    expect(formatTotalSpeed(0)).toBeNull();
    expect(formatTotalSpeed(2048)).toBe('2 KB/s');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
});
