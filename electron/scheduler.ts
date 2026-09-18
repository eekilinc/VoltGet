export interface SchedulerConfig {
  enabled: boolean;
  startTime: string; // HH:MM
  stopTime: string; // HH:MM
  days: number[]; // 0=Sunday
  runOnceAt?: string; // ISO datetime, tek seferlik kuyruk başlatma
}

export interface SchedulerActions {
  startQueue: () => void;
  stopQueue: () => void;
  log?: (text: string) => void;
}

function parseTime(s: string): { h: number; m: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s || '');
  if (!m) return null;
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
}

function nextOccurrence(time: string, days: number[], from: Date): number | null {
  const t = parseTime(time);
  if (!t) return null;
  const daySet = new Set(days.length ? days : [0, 1, 2, 3, 4, 5, 6]);
  for (let offset = 0; offset < 8; offset++) {
    const d = new Date(from);
    d.setDate(d.getDate() + offset);
    if (!daySet.has(d.getDay())) continue;
    d.setHours(t.h, t.m, 0, 0);
    if (d.getTime() > from.getTime()) return d.getTime();
  }
  return null;
}

export function createScheduler(actions: SchedulerActions) {
  let startTimer: NodeJS.Timeout | null = null;
  let stopTimer: NodeJS.Timeout | null = null;
  let onceTimer: NodeJS.Timeout | null = null;

  function clear() {
    if (startTimer) clearTimeout(startTimer);
    if (stopTimer) clearTimeout(stopTimer);
    if (onceTimer) clearTimeout(onceTimer);
    startTimer = stopTimer = onceTimer = null;
  }

  function arm(
    timer: NodeJS.Timeout | null,
    when: number | null,
    cb: () => void
  ): NodeJS.Timeout | null {
    if (timer) clearTimeout(timer);
    if (when == null) return null;
    const delay = Math.max(1000, when - Date.now());
    // setTimeout üst sınırı (~24.8 gün) aşılmasın
    if (delay > 2147483647) return null;
    const t = setTimeout(() => {
      try {
        cb();
      } catch {}
    }, delay);
    (t as any).unref?.();
    return t;
  }

  function reschedule(cfg: SchedulerConfig) {
    clear();
    const now = new Date();
    if (cfg?.enabled) {
      startTimer = arm(startTimer, nextOccurrence(cfg.startTime, cfg.days, now), () => {
        actions.log?.(`⏰ Zamanlayıcı: kuyruk başlatıldı (${cfg.startTime})`);
        try {
          actions.startQueue();
        } catch {}
        reschedule(cfg);
      });
      stopTimer = arm(stopTimer, nextOccurrence(cfg.stopTime, cfg.days, now), () => {
        actions.log?.(`⏰ Zamanlayıcı: kuyruk durduruldu (${cfg.stopTime})`);
        try {
          actions.stopQueue();
        } catch {}
        reschedule(cfg);
      });
    }
    const onceAt = cfg?.runOnceAt ? new Date(cfg.runOnceAt).getTime() : NaN;
    if (Number.isFinite(onceAt) && onceAt > now.getTime()) {
      onceTimer = arm(onceTimer, onceAt, () => {
        actions.log?.('⏰ Zamanlayıcı: tek seferlik kuyruk başlatıldı');
        try {
          actions.startQueue();
        } catch {}
      });
    }
  }

  function dispose() {
    clear();
  }

  return { reschedule, dispose };
}

export type Scheduler = ReturnType<typeof createScheduler>;
