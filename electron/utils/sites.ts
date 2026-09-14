import { app } from 'electron';
import fs from 'fs';
import os from 'os';
import path from 'path';

export function detectSite(url: string): string {
  try {
    const h = new URL(url).hostname;
    if (h.includes('youtube.com') || h.includes('youtu.be')) return 'YouTube';
    if (h.includes('tiktok.com')) return 'TikTok';
    if (h.includes('instagram.com')) return 'Instagram';
    if (h.includes('twitter.com') || h.includes('x.com') || h.includes('t.co')) return 'X-Twitter';
    if (h.includes('facebook.com') || h.includes('fbcdn')) return 'Facebook';
    if (h.includes('soundcloud.com')) return 'SoundCloud';
    if (h.includes('vimeo.com')) return 'Vimeo';
    if (h.includes('twitch.tv')) return 'Twitch';
    return 'Diger';
  } catch {
    return 'Diger';
  }
}

export interface FolderFlags {
  siteFolders: boolean;
  categoryFolders?: boolean;
}

export function getSiteFolder(
  base: string,
  url: string,
  flags: FolderFlags,
  filename?: string
): string {
  if (flags.categoryFolders) {
    const ext = path
      .extname(filename || url.split('?')[0])
      .slice(1)
      .toLowerCase();
    let catFolder = 'Other';
    if (
      ['mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'ts', 'm4v'].includes(ext) ||
      url.includes('.m3u8')
    )
      catFolder = 'Video';
    else if (['mp3', 'm4a', 'flac', 'wav', 'aac', 'ogg', 'wma'].includes(ext)) catFolder = 'Music';
    else if (
      ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'epub', 'csv'].includes(ext)
    )
      catFolder = 'Documents';
    else if (['zip', 'rar', '7z', 'tar', 'gz', 'iso', 'torrent'].includes(ext))
      catFolder = 'Archives';
    else if (['exe', 'msi', 'apk', 'dmg', 'deb', 'rpm'].includes(ext)) catFolder = 'Programs';
    return path.join(base, catFolder);
  }
  if (!flags.siteFolders) return base;
  return path.join(base, detectSite(url));
}

export function getDefaultDownloadDir(customOutDir?: string): string {
  try {
    if (
      customOutDir &&
      !customOutDir.toLowerCase().endsWith('flexplorer') &&
      fs.existsSync(customOutDir)
    ) {
      return customOutDir;
    }
  } catch {}
  try {
    const cfgPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(cfgPath)) {
      const c = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      if (
        c?.customOutDir &&
        !c.customOutDir.toLowerCase().endsWith('flexplorer') &&
        fs.existsSync(c.customOutDir)
      ) {
        return c.customOutDir;
      }
    }
  } catch {}
  return path.join(os.homedir(), 'Downloads', 'VoltGet');
}

export function getAppIconPath(overrides?: {
  cwd?: string;
  dirname?: string;
  appPath?: string;
  exeDir?: string;
  resourcesPath?: string;
}): string | undefined {
  const isWin = process.platform === 'win32';
  const iconNames = isWin ? ['icon.ico', 'icon.png', 'icon-256.png'] : ['icon.png', 'icon-256.png'];
  const cwd = overrides?.cwd ?? process.cwd();
  const dirname = overrides?.dirname ?? __dirname;
  let appPath = overrides?.appPath ?? '';
  let exeDir = overrides?.exeDir ?? '';
  let resourcesPath = overrides?.resourcesPath ?? '';
  try {
    appPath = appPath || app.getAppPath();
  } catch {}
  try {
    exeDir = exeDir || path.dirname(app.getPath('exe'));
  } catch {}
  try {
    resourcesPath = resourcesPath || process.resourcesPath;
  } catch {}
  const baseDirs = [
    path.join(cwd, 'assets'),
    path.join(dirname, '../../assets'),
    path.join(dirname, '../assets'),
    appPath ? path.join(appPath, 'assets') : '',
    exeDir ? path.join(exeDir, 'assets') : '',
    resourcesPath ? path.join(resourcesPath, 'assets') : '',
  ].filter(Boolean);
  for (const dir of baseDirs) {
    for (const name of iconNames) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}
