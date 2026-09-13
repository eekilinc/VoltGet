export function parseSpeedToBytes(speed: string): number {
  if (!speed || speed === '-') return 0;
  const m = speed.match(/([0-9.]+)\s*([A-Za-z]+)\/s/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  if (Number.isNaN(val)) return 0;
  const unit = m[2].toLowerCase();
  if (unit.startsWith('k')) return val * 1024;
  if (unit.startsWith('m')) return val * 1024 * 1024;
  if (unit.startsWith('g')) return val * 1024 * 1024 * 1024;
  return val;
}

export function formatTotalSpeed(bytes: number): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB/s';
  return (bytes / 1024).toFixed(0) + ' KB/s';
}

export function calcTotalSpeed(jobs: Array<{ status: string; speed?: string }>): string | null {
  let sum = 0;
  let has = false;
  for (const j of jobs) {
    if (j.status !== 'downloading') continue;
    const b = parseSpeedToBytes(j.speed || '-');
    if (b > 0) {
      has = true;
      sum += b;
    }
  }
  if (!has) return null;
  return formatTotalSpeed(sum);
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
