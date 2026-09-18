import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

function findMpCmdRun(): string | null {
  if (process.platform !== 'win32') return null;
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe'),
    path.join(
      process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      'Windows Defender',
      'MpCmdRun.exe'
    ),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return null;
}

/** İndirme bitince Defender ile tara (fire-and-forget, indirmeyi bloklamaz). */
export function maybeVirusScan(
  filePath: string,
  enabled: boolean,
  onLog?: (text: string) => void
): void {
  if (!enabled || !filePath) return;
  if (process.platform !== 'win32') return;
  try {
    if (!fs.existsSync(filePath)) return;
    const mp = findMpCmdRun();
    if (!mp) {
      onLog?.('🛡️ Defender bulunamadı, virüs taraması atlandı');
      return;
    }
    const proc = spawn(mp, ['-Scan', '-ScanType', '3', '-File', filePath], {
      shell: false,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    } as any);
    (proc as any).unref?.();
    onLog?.('🛡️ Windows Defender taraması başlatıldı');
  } catch {}
}
