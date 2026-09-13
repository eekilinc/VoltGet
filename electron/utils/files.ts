import fs from 'fs';
import path from 'path';

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export type FileCategory = 'video' | 'audio' | 'document' | 'archive' | 'installer' | 'other';

export function getCategoryFromExt(extWithOrWithoutDot: string): FileCategory {
  const ext = (extWithOrWithoutDot || '').replace(/^\./, '').toLowerCase();
  if (['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'ts', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'm4a', 'flac', 'wav', 'aac', 'ogg', 'wma'].includes(ext)) return 'audio';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'epub', 'csv'].includes(ext))
    return 'document';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'iso', 'torrent'].includes(ext)) return 'archive';
  if (['exe', 'msi', 'apk', 'dmg', 'deb', 'rpm'].includes(ext)) return 'installer';
  return 'other';
}

export function isTemporaryOrPartialFile(name: string): boolean {
  if (!name || typeof name !== 'string') return true;
  if (name.startsWith('.') || name.startsWith('~')) return true;
  if (/\.(part|ytdl|tmp|temp|crdownload|download)$/i.test(name)) return true;
  if (/\.(f[0-9a-zA-Z_.-]+|temp)\.(mp4|m4a|webm|mkv|aac|ts|m4v)$/i.test(name)) return true;
  if (/part[-_]?(?:frag)?[0-9]+/i.test(name)) return true;
  return false;
}

export interface ScannedFile {
  name: string;
  path: string;
  relativePath: string;
  folder: string;
  size: number;
  mtime: number;
  ext: string;
  category: string;
}

export function scanDownloadedFiles(dir: string, baseDir: string): ScannedFile[] {
  if (!fs.existsSync(dir)) return [];
  const results: ScannedFile[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name.startsWith('.') ||
        entry.name.startsWith('.tmp') ||
        entry.name.startsWith('.voltget_')
      )
        continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...scanDownloadedFiles(fullPath, baseDir));
      } else if (entry.isFile()) {
        if (isTemporaryOrPartialFile(entry.name)) continue;
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size === 0) continue;
          const ext = path.extname(entry.name).slice(1).toLowerCase();
          const relative = path.relative(baseDir, fullPath);
          const folder = path.dirname(relative) === '.' ? 'Ana Klasör' : path.dirname(relative);
          results.push({
            name: entry.name,
            path: fullPath,
            relativePath: relative,
            folder,
            size: stat.size,
            mtime: stat.mtimeMs,
            ext,
            category: getCategoryFromExt(ext),
          });
        } catch {}
      }
    }
  } catch {}
  return results;
}

export function sanitizeFilename(name: string, fallback = 'download'): string {
  const cleaned = (name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}
