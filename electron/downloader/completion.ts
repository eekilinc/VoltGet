import fs from 'fs';
import path from 'path';

export function shouldRunFfmpegFallback(code: number | null, isHls: boolean): boolean {
  return (code ?? 1) !== 0 && isHls;
}

export function findNewestDownload(
  outDir: string,
  withinMs: number,
  isTemp: (name: string) => boolean
): string {
  try {
    const files = fs
      .readdirSync(outDir)
      .map(f => ({
        name: f,
        path: path.join(outDir, f),
        mtime: fs.statSync(path.join(outDir, f)).mtimeMs,
      }))
      .filter(f => !f.name.startsWith('.') && !isTemp(f.name))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length > 0 && Date.now() - files[0].mtime < withinMs) {
      return files[0].path;
    }
  } catch {}
  return '';
}

export function statSizeOf(p: string): number {
  try {
    if (p && fs.existsSync(p)) return fs.statSync(p).size;
  } catch {}
  return 0;
}

export interface DonePayload {
  id: string;
  code: number;
  outDir: string;
  filePath?: string;
  fileName?: string;
  size: number;
}

export function buildYtDlpDonePayload(
  id: string,
  code: number,
  outDir: string,
  downloadedFilePath: string
): { payload: DonePayload; notify: { title: string; body: string } } {
  const fileSize = statSizeOf(downloadedFilePath);
  return {
    payload: {
      id,
      code,
      outDir,
      filePath: downloadedFilePath || undefined,
      fileName: downloadedFilePath ? path.basename(downloadedFilePath) : undefined,
      size: fileSize,
    },
    notify:
      code === 0
        ? { title: 'İndirme tamamlandı (VoltGet)', body: '' }
        : { title: 'İndirme hatası', body: `Kod ${code}` },
  };
}

export function buildFfmpegDonePayload(
  id: string,
  ffCode: number,
  outDir: string,
  actualOut: string,
  statSize: number
): { payload: DonePayload; notify: { title: string; body: string } } {
  return {
    payload: {
      id,
      code: ffCode,
      outDir,
      filePath: ffCode === 0 ? actualOut : undefined,
      fileName: path.basename(actualOut),
      size: statSize,
    },
    notify:
      ffCode === 0
        ? { title: 'İndirme tamamlandı (VoltGet)', body: '' }
        : { title: 'İndirme hatası', body: `FFmpeg Hata Kodu ${ffCode}` },
  };
}
