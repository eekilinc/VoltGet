import { app } from 'electron';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

export function isValidExecutable(p: string): boolean {
  try {
    if (!p || !fs.existsSync(p)) return false;
    const stat = fs.statSync(p);
    return stat.isFile() && stat.size > 20000;
  } catch {
    return false;
  }
}

function currentDirname(): string {
  try {
    // @ts-ignore import.meta may not resolve in all build targets
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return __dirname;
  }
}

export function resolveYtDlpPath(overrides?: {
  isPackaged?: boolean;
  exeDir?: string;
  cwd?: string;
  dirname?: string;
}): string {
  const isPackaged = overrides?.isPackaged ?? app.isPackaged;
  const exeDir =
    overrides?.exeDir ??
    (() => {
      try {
        return path.dirname(app.getPath('exe'));
      } catch {
        return '';
      }
    })();
  const cwd = overrides?.cwd ?? process.cwd();
  const dirname = overrides?.dirname ?? currentDirname();
  const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';

  const bundled = path.join(isPackaged ? exeDir : path.join(dirname, '..'), 'bin', binName);
  if (isValidExecutable(bundled)) return bundled;

  const projectBin = path.join(cwd, 'bin', binName);
  if (isValidExecutable(projectBin)) return projectBin;

  const rootBin = path.join(dirname, '..', '..', 'bin', binName);
  if (isValidExecutable(rootBin)) return rootBin;

  try {
    const cmd = process.platform === 'win32' ? 'where.exe yt-dlp' : 'which yt-dlp';
    const out = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    for (const line of out.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && isValidExecutable(trimmed)) return trimmed;
    }
  } catch {}

  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Python313\\Scripts\\yt-dlp.exe',
      'C:\\Python312\\Scripts\\yt-dlp.exe',
      'C:\\Python311\\Scripts\\yt-dlp.exe',
      'C:\\Python310\\Scripts\\yt-dlp.exe',
      path.join(
        process.env.LOCALAPPDATA || '',
        'Programs',
        'Python',
        'Python313',
        'Scripts',
        'yt-dlp.exe'
      ),
      path.join(
        process.env.LOCALAPPDATA || '',
        'Programs',
        'Python',
        'Python312',
        'Scripts',
        'yt-dlp.exe'
      ),
      path.join(
        process.env.LOCALAPPDATA || '',
        'Programs',
        'Python',
        'Python311',
        'Scripts',
        'yt-dlp.exe'
      ),
      'C:\\ProgramData\\chocolatey\\bin\\yt-dlp.exe',
    ];
    for (const cand of candidates) {
      if (isValidExecutable(cand)) return cand;
    }
  }
  return 'yt-dlp';
}

export function resolveFfmpegPath(overrides?: {
  isPackaged?: boolean;
  exeDir?: string;
  dirname?: string;
}): string {
  const isPackaged = overrides?.isPackaged ?? app.isPackaged;
  const exeDir =
    overrides?.exeDir ??
    (() => {
      try {
        return path.dirname(app.getPath('exe'));
      } catch {
        return '';
      }
    })();
  const dirname = overrides?.dirname ?? currentDirname();
  const binName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

  const bundled = path.join(isPackaged ? exeDir : path.join(dirname, '..'), 'bin', binName);
  if (fs.existsSync(bundled)) return bundled;

  try {
    const cmd = process.platform === 'win32' ? 'where.exe ffmpeg' : 'which ffmpeg';
    const out = execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const firstLine = out.split(/\r?\n/)[0]?.trim();
    if (firstLine && fs.existsSync(firstLine)) return firstLine;
  } catch {}

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const wingetSearch = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetSearch)) {
      try {
        for (const dir of fs.readdirSync(wingetSearch)) {
          if (dir.toLowerCase().includes('ffmpeg')) {
            const candidateBin = path.join(wingetSearch, dir);
            for (const sub of fs.readdirSync(candidateBin)) {
              const exe = path.join(candidateBin, sub, 'bin', 'ffmpeg.exe');
              if (fs.existsSync(exe)) return exe;
            }
          }
        }
      } catch {}
    }
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'ffmpeg', 'bin', 'ffmpeg.exe'),
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
      'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) return cand;
    }
  }
  return 'ffmpeg';
}

export function ensureBinDirOnPath(binPath: string): void {
  if (!binPath || binPath === 'yt-dlp' || binPath === 'ffmpeg') return;
  if (!fs.existsSync(binPath)) return;
  const dir = path.dirname(binPath);
  if (!process.env.PATH?.includes(dir)) {
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH || ''}`;
  }
}

export type FfmpegStatus = { path: string; ok: boolean };

export function getFfmpegStatus(ffmpegPath: string): FfmpegStatus {
  try {
    execSync(`"${ffmpegPath}" -version`, { stdio: 'ignore' });
    return { path: ffmpegPath, ok: true };
  } catch {
    return { path: ffmpegPath, ok: false };
  }
}

export function parseYtDlpJson(out: string): any {
  const lines = out
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  const jsonLine = lines.find(l => l.startsWith('{')) || lines[0];
  if (!jsonLine) throw new Error('yt-dlp boş çıktı döndürdü');
  return JSON.parse(jsonLine);
}
