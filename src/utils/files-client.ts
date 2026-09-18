export function isTemporaryOrPartialFile(name: string): boolean {
  if (!name || typeof name !== 'string') return true;
  if (name.startsWith('.') || name.startsWith('~')) return true;
  if (/\.(part|ytdl|tmp|temp|crdownload|download)$/i.test(name)) return true;
  if (/\.(f[0-9a-zA-Z_.-]+|temp)\.(mp4|m4a|webm|mkv|aac|ts|m4v)$/i.test(name)) return true;
  if (/part[-_]?(?:frag)?[0-9]+/i.test(name)) return true;
  return false;
}

export function formatDate(ms: number): string {
  try {
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  } catch {
    return '-';
  }
}

export function shortUrl(u: string, max = 60): string {
  if (!u) return '';
  return u.length > max ? u.slice(0, max) + '…' : u;
}
