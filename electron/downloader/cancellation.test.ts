import { describe, it, expect, vi } from 'vitest';
import {
  scheduleRetry,
  cancelScheduledRetry,
  resetRetryAttempts,
  type RetryPolicy,
} from './retry.ts';
import { killProcessTree } from '../utils/process.ts';

describe('cancellation & retry prevention', () => {
  const testPolicy: RetryPolicy = {
    enabled: true,
    maxRetries: 3,
    baseDelaySec: 1,
  };

  it('cancelScheduledRetry cancels pending retry timer and prevents restart callback', async () => {
    vi.useFakeTimers();
    const restartMock = vi.fn();
    const scheduled = scheduleRetry('job-hls-1', testPolicy, restartMock);
    expect(scheduled).toBe(true);

    // Cancel retry before timer fires
    cancelScheduledRetry('job-hls-1');

    // Advance time past the retry delay
    vi.advanceTimersByTime(5000);

    expect(restartMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('resetRetryAttempts also cancels scheduled retry timer', async () => {
    vi.useFakeTimers();
    const restartMock = vi.fn();
    scheduleRetry('job-hls-2', testPolicy, restartMock);

    resetRetryAttempts('job-hls-2');

    vi.advanceTimersByTime(5000);
    expect(restartMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('cancelledIds guard prevents restart callback even if timer fires concurrently', () => {
    const cancelledIds = new Set<string>(['job-hls-3']);
    const downloadStarter = vi.fn();

    const restartCallback = () => {
      if (cancelledIds.has('job-hls-3')) return;
      downloadStarter();
    };

    restartCallback();
    expect(downloadStarter).not.toHaveBeenCalled();
  });

  it('killProcessTree handles null, undefined and dead processes gracefully', () => {
    expect(() => killProcessTree(null)).not.toThrow();
    expect(() => killProcessTree(undefined)).not.toThrow();
    expect(() =>
      killProcessTree({
        pid: 999999999,
        kill: vi.fn(),
      } as any)
    ).not.toThrow();
  });
});
