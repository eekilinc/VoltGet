export interface RetryPolicy {
  enabled: boolean;
  maxRetries: number;
  baseDelaySec: number;
}

const attempts = new Map<string, number>();
const timers = new Map<string, NodeJS.Timeout>();

export function resetRetryAttempts(id: string): void {
  attempts.delete(id);
  cancelScheduledRetry(id);
}

export function cancelScheduledRetry(id: string): void {
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  attempts.delete(id);
}

export function getRetryPolicyFrom(config: any): RetryPolicy {
  return {
    enabled: config?.autoRetryEnabled !== false,
    maxRetries: Math.max(0, config?.maxAutoRetries ?? 3),
    baseDelaySec: Math.max(1, config?.retryBaseDelaySec ?? 5),
  };
}

export function scheduleRetry(
  id: string,
  policy: RetryPolicy,
  restart: () => void,
  onScheduled?: (attempt: number, max: number, delayMs: number) => void
): boolean {
  if (!policy.enabled) return false;
  const cur = attempts.get(id) ?? 0;
  if (cur >= policy.maxRetries) {
    attempts.delete(id);
    return false;
  }
  const attempt = cur + 1;
  attempts.set(id, attempt);
  const delayMs = policy.baseDelaySec * 1000 * Math.pow(2, attempt - 1);
  const timer = setTimeout(() => {
    timers.delete(id);
    try {
      restart();
    } catch {}
  }, delayMs);
  (timer as any).unref?.();
  timers.set(id, timer);
  try {
    onScheduled?.(attempt, policy.maxRetries, delayMs);
  } catch {}
  return true;
}
