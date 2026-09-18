import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScheduler } from './scheduler.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-18T10:00:00'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('one-shot scheduling', () => {
  it('starts the queue once at runOnceAt', () => {
    const startQueue = vi.fn();
    const s = createScheduler({ startQueue, stopQueue: vi.fn() });
    s.reschedule({
      enabled: false,
      startTime: '02:00',
      stopTime: '07:00',
      days: [],
      runOnceAt: new Date('2026-09-18T10:01:00').toISOString(),
    });
    expect(startQueue).not.toHaveBeenCalled();
    vi.advanceTimersByTime(61_000);
    expect(startQueue).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('ignores past runOnceAt values', () => {
    const startQueue = vi.fn();
    const s = createScheduler({ startQueue, stopQueue: vi.fn() });
    s.reschedule({
      enabled: false,
      startTime: '02:00',
      stopTime: '07:00',
      days: [],
      runOnceAt: new Date('2026-09-18T09:00:00').toISOString(),
    });
    vi.advanceTimersByTime(3_600_000);
    expect(startQueue).not.toHaveBeenCalled();
    s.dispose();
  });
  it('does nothing when disabled without runOnceAt', () => {
    const startQueue = vi.fn();
    const s = createScheduler({ startQueue, stopQueue: vi.fn() });
    s.reschedule({ enabled: false, startTime: '02:00', stopTime: '07:00', days: [] });
    vi.advanceTimersByTime(24 * 3_600_000);
    expect(startQueue).not.toHaveBeenCalled();
    s.dispose();
  });
});
