export interface YtDlpProgress {
  percent: number;
  total: string;
  speed: string;
  eta: string;
  raw: string;
}

export function parseYtDlpProgressLine(line: string): YtDlpProgress | null {
  const t = (line || '').trim();
  if (!t) return null;
  // [download]  12.3% of ~5.20MiB at 1.20MiB/s ETA 00:04
  const m = t.match(
    /(\d+(?:\.\d+)?)%\s+of\s+~?([^\s]+)(?:\s+at\s+([^\s]+))?(?:\s+ETA\s+([^\s]+))?/i
  );
  if (m) {
    return {
      percent: parseFloat(m[1]),
      total: m[2] || '',
      speed: m[3] || '-',
      eta: m[4] || '-',
      raw: t.slice(0, 400),
    };
  }
  if (/\[download\].*Destination/i.test(t)) {
    return { percent: 0, total: '', speed: '-', eta: '-', raw: t.slice(0, 400) };
  }
  return null;
}

export interface FfmpegProgress {
  time: string;
  speed: string;
  raw: string;
}

export function parseFfmpegProgressLine(line: string): FfmpegProgress | null {
  const t = (line || '').trim();
  const m = t.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)\s+bitrate=\s*([^\s]+)\s+speed=\s*([^\s]+)/);
  if (!m) return null;
  return { time: m[1], speed: m[3] || '', raw: t.slice(0, 400) };
}
