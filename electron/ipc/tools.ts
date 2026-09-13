import { ipcMain } from 'electron';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';

export function registerToolsIpc(deps: {
  getYtDlpPath: () => string;
  setYtDlpPath: (p: string) => void;
  findYtDlp: () => string;
  getFfmpegPath: () => string;
  ensureDir: (d: string) => void;
  isValidExecutable: (p: string) => boolean;
  loadConfig: () => any;
  appDirname: string;
  isPackaged: boolean;
  exeDir: string;
}) {
  ipcMain.handle('get-yt-dlp-status', async () => {
    const ytDlpPath = deps.getYtDlpPath();
    const ffmpegPath = deps.getFfmpegPath();
    const binExists = fs.existsSync(ytDlpPath);
    let pathExists = false;
    try {
      execSync('yt-dlp --version', { stdio: 'ignore' });
      pathExists = true;
    } catch {}
    let ffmpegOk = false;
    try {
      execSync(`"${ffmpegPath}" -version`, { stdio: 'ignore' });
      ffmpegOk = true;
    } catch {}
    let ytdlpVer = '';
    try {
      ytdlpVer = execSync(`"${deps.findYtDlp()}" --version`, { encoding: 'utf-8' }).trim();
    } catch {}
    const ffmpegHint = ffmpegOk
      ? ''
      : process.platform === 'win32'
        ? 'winget install Gyan.FFmpeg'
        : 'ffmpeg kurun ve PATH ekleyin';
    return {
      binExists,
      pathExists,
      ytDlpPath,
      ffmpegOk,
      ffmpegPath,
      ffmpegHint,
      ytdlpVer,
      config: deps.loadConfig(),
    };
  });

  ipcMain.handle('check-yt-dlp-update', async () => {
    try {
      const get = (url: string) =>
        new Promise<string>((res, rej) => {
          https
            .get(url, { headers: { 'User-Agent': 'VoltGet' } }, r => {
              let d = '';
              r.on('data', c => (d += c));
              r.on('end', () => res(d));
            })
            .on('error', rej);
        });
      const data = await get('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest');
      const j = JSON.parse(data);
      const latest = j.tag_name || j.name;
      let cur = '';
      try {
        cur = execSync(`"${deps.findYtDlp()}" --version`, { encoding: 'utf-8' }).trim();
      } catch {}
      return {
        latest,
        current: cur,
        hasUpdate: latest && cur && !latest.includes(cur),
        url: j.html_url,
      };
    } catch (e: any) {
      return { error: String(e) };
    }
  });

  ipcMain.handle('download-yt-dlp', async () => {
    const curPath = deps.getYtDlpPath();
    const targetBin = deps.isValidExecutable(curPath)
      ? curPath
      : path.join(
          deps.isPackaged ? deps.exeDir : path.join(deps.appDirname, '..'),
          'bin',
          process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
        );
    const binDir = path.dirname(targetBin);
    deps.ensureDir(binDir);
    const tempPath = `${targetBin}.download.tmp`;
    const initialUrl =
      process.platform === 'win32'
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

    const downloadWithRedirects = (url: string, redirectCount = 0): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (redirectCount > 5) return reject(new Error('Çok fazla yönlendirme'));
        const options = {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        };
        https
          .get(url, options, (res: any) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              return downloadWithRedirects(res.headers.location, redirectCount + 1)
                .then(resolve)
                .catch(reject);
            }
            if (res.statusCode !== 200)
              return reject(new Error(`İndirme başarısız (HTTP ${res.statusCode})`));
            const fileStream = fs.createWriteStream(tempPath);
            res.pipe(fileStream);
            fileStream.on('finish', () => fileStream.close(() => resolve()));
            fileStream.on('error', (err: any) => {
              try {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
              } catch {}
              reject(err);
            });
          })
          .on('error', (err: any) => {
            try {
              if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            } catch {}
            reject(err);
          });
      });
    };

    try {
      await downloadWithRedirects(initialUrl);
      const stat = fs.statSync(tempPath);
      if (stat.size < 5000000) {
        try {
          fs.unlinkSync(tempPath);
        } catch {}
        throw new Error(
          `İndirilen dosya boyutu beklenenden küçük (${(stat.size / 1024).toFixed(1)} KB)`
        );
      }
      if (process.platform !== 'win32') fs.chmodSync(tempPath, 0o755);
      fs.renameSync(tempPath, targetBin);
      deps.setYtDlpPath(targetBin);
      return targetBin;
    } catch (err: any) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
      throw err;
    }
  });
}
