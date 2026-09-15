import { spawn, type ChildProcess } from 'child_process';
import { Notification, type BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  buildFfmpegDonePayload,
  buildYtDlpDonePayload,
  findNewestDownload,
  shouldRunFfmpegFallback,
} from '../downloader/completion.js';
import { parseFfmpegProgressLine, parseYtDlpProgressLine } from '../downloader/progress.js';
import { getRetryPolicyFrom, resetRetryAttempts, scheduleRetry } from '../downloader/retry.js';
import log from '../log/logger.js';
import type { SniffDeduper } from '../sniff.js';
import { shouldIgnoreSniffUrl } from '../sniff.js';
import { isPlayerOrEmbedUrl, isStreamUrl, normalizeToMasterPlaylist } from '../utils/playlist.js';
import { killProcessTree } from '../utils/process.js';
import { maybeVirusScan } from '../virusscan.js';
import { buildFfmpegFallbackArgs, buildYtDlpArgs } from './args.js';
import type { HttpDownloadController } from './http.js';
import { fallbackTitle, isGenericFileUrl, isHlsUrl } from './url-resolver.js';
import {
  appendFormatArgs,
  buildOutputTemplate,
  extractDestinationFromOutput,
  spawnYtDlp,
} from './ytdlp.js';

export interface OrchestratorDeps {
  getAppConfig: () => any;
  getMainWindow: () => BrowserWindow | null;
  activeDownloads: Map<string, HttpDownloadController>;
  activeOpts: Map<string, any>;
  pendingQueue: Array<{ id: string; opts: any }>;
  pausedDownloads: Map<string, any>;
  pausingIds: Set<string>;
  cancelledIds: Set<string>;
  sniffDeduper: SniffDeduper;
  recentStreamsByPage: Map<string, string>;
  resolveConflictPath: (outPath: string) => Promise<{ proceed: boolean; finalPath: string }>;
  getDefaultDir: () => string;
  getSiteFolder: (base: string, url: string, filename?: string) => string;
  ensureDir: (dir: string) => void;
  updatePowerSaveBlocker: () => void;
  processPending: () => void;
  addDownloadToHistory: (item: any) => void;
  runMultiPartHttpDownload: (
    id: string,
    opts: any,
    outDir: string,
    outPath: string,
    filename: string
  ) => Promise<void>;
  findYtDlp: () => string;
  getFfmpegPath: () => string;
  isFfmpegOk: () => boolean;
  isTemporaryOrPartialFile: (name: string) => boolean;
}

export function createDownloadOrchestrator(deps: OrchestratorDeps) {
  async function doStartDownload(id: string, opts: any): Promise<void> {
    const appConfig = deps.getAppConfig();
    const mainWindow = deps.getMainWindow();

    let finalUrl = normalizeToMasterPlaylist(opts.url || '');
    opts.url = finalUrl;

    const isYouTube =
      /youtube\.com|youtu\.be|googlevideo\.com/i.test(finalUrl) ||
      (opts.pageUrl && /youtube\.com|youtu\.be/i.test(opts.pageUrl));

    if (isYouTube) {
      if (opts.pageUrl && /youtube\.com|youtu\.be/i.test(opts.pageUrl)) {
        finalUrl = opts.pageUrl;
        opts.url = opts.pageUrl;
      } else if (finalUrl.includes('googlevideo.com')) {
        for (const [key] of deps.sniffDeduper.entries()) {
          if (/youtube\.com\/watch|youtu\.be\//i.test(key)) {
            finalUrl = key;
            opts.url = key;
            break;
          }
        }
        if (finalUrl.includes('googlevideo.com')) {
          for (const [key] of deps.recentStreamsByPage.entries()) {
            if (/youtube\.com\/watch|youtu\.be\//i.test(key)) {
              finalUrl = key;
              opts.url = key;
              break;
            }
          }
        }
      }
    }

    // 1. Embed veya oynatıcı sayfası geldiyse hafızadaki gerçek akış URL'si ile eşle
    if (!isYouTube && isPlayerOrEmbedUrl(finalUrl)) {
      const matched =
        deps.sniffDeduper.resolve(opts.pageUrl, opts.url) ||
        deps.recentStreamsByPage.get(opts.pageUrl) ||
        deps.recentStreamsByPage.get(opts.url) ||
        deps.recentStreamsByPage.get('latest');
      if (matched && isStreamUrl(matched)) {
        log.info('[VoltGet] doStartDownload resolved embed URL to real stream:', { matched });
        finalUrl = matched;
        opts.url = matched;
      }
    }

    const titled = fallbackTitle(opts.title, opts.pageUrl);
    if (titled) opts.title = titled;

    // 2. Web scripti (.js) veya stil indirme girişimlerini engelle
    if (shouldIgnoreSniffUrl(finalUrl, opts.filename)) {
      log.info('[VoltGet] Rejected script download attempt:', { finalUrl });
      return;
    }

    const isGeneric = opts.isHttp || isGenericFileUrl(finalUrl, opts.filename, opts.isHttp);
    if (isGeneric) {
      const filename =
        opts.filename || finalUrl.split('/').pop()?.split('?')[0] || `file_${Date.now()}`;
      const baseOut = opts.outDir || deps.getDefaultDir();
      const outDir = deps.getSiteFolder(baseOut, finalUrl, filename);
      deps.ensureDir(outDir);
      const outPath = path.join(outDir, filename);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-started', {
          id,
          opts: { ...opts, title: filename },
          outDir,
        });
        mainWindow.webContents.send('switch-to-download-tab');
      }
      await deps.runMultiPartHttpDownload(id, opts, outDir, outPath, filename);
      return;
    }

    // 4. Medya / Video indirmesi
    const baseOut = opts.outDir || deps.getDefaultDir();
    const outDir = deps.getSiteFolder(baseOut, finalUrl, opts.filename || opts.title);
    deps.ensureDir(outDir);
    const ytdlp = deps.findYtDlp();
    const isHls = isHlsUrl(finalUrl);

    const siteLogin = (() => {
      try {
        const host = new URL(finalUrl).hostname.replace(/^www\./i, '').toLowerCase();
        return (appConfig.siteLogins || []).find(
          (l: any) =>
            l.host && (host === l.host.toLowerCase() || host.endsWith('.' + l.host.toLowerCase()))
        );
      } catch {
        return undefined;
      }
    })();

    const built = buildYtDlpArgs({
      finalUrl,
      pageUrl: opts.pageUrl,
      cookie: opts.cookie,
      speedLimitKB: opts.speedLimitKB ?? appConfig.speedLimitKB,
      isYouTube,
      username: siteLogin?.username || undefined,
      password: siteLogin?.password || undefined,
      cookiesFromBrowser: appConfig.cookiesFromBrowser || 'none',
      fragments: appConfig.ytDlpFragments || 16,
    });
    const args: string[] = built.args;
    const embedId = built.embedId;

    appendFormatArgs(args, {
      asAudio: opts.asAudio,
      formatId: opts.formatId,
      isAudioOnly: opts.isAudioOnly,
    });

    const builtTpl = buildOutputTemplate(
      { filename: opts.filename, title: opts.title },
      appConfig.filenameTemplate
    );
    let filename = builtTpl.filename;
    let tmpl = builtTpl.tmpl;

    // Dosya adı biliniyorsa çakışma politikasını uygula
    if (filename && !filename.includes('%(')) {
      try {
        const r = await deps.resolveConflictPath(path.join(outDir, filename));
        if (!r.proceed) {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-canceled', { id });
          }
          deps.updatePowerSaveBlocker();
          deps.processPending();
          return;
        }
        if (r.finalPath !== path.join(outDir, filename)) {
          filename = path.basename(r.finalPath);
          tmpl = filename;
          opts = { ...opts, filename };
        }
      } catch {}
    }

    const tempDir = path.join(outDir, '.voltget_tmp');
    deps.ensureDir(tempDir);
    args.push('-P', `temp:${tempDir}`, '-P', `home:${outDir}`);
    args.push('-o', tmpl, '--no-playlist', '--newline', '--progress', '--continue');

    const ffmpegPath = deps.getFfmpegPath();
    if (ffmpegPath) {
      const loc =
        ffmpegPath !== 'ffmpeg' && fs.existsSync(ffmpegPath)
          ? path.dirname(ffmpegPath)
          : ffmpegPath;
      args.push('--ffmpeg-location', loc);
    }
    args.push(finalUrl);

    log.info('[VoltGet] starting download process', { id, ytdlp });
    const proc: ChildProcess = spawnYtDlp(ytdlp, args);

    proc.on('error', (procErr: any) => {
      log.error('[VoltGet] download process emitted error', { error: procErr });
      if (deps.cancelledIds.has(id)) {
        deps.cancelledIds.delete(id);
        deps.activeDownloads.delete(id);
        deps.activeOpts.delete(id);
        deps.updatePowerSaveBlocker();
        deps.processPending();
        return;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-error', {
          id,
          error: `İndirme başlatılamadı: ${procErr.message}`,
        });
      }
    });

    deps.activeDownloads.set(id, {
      pause: () => {
        try {
          killProcessTree(proc);
        } catch {}
      },
      kill: () => {
        try {
          killProcessTree(proc);
        } catch {}
      },
      resume: async () => {},
    });
    deps.activeOpts.set(id, { ...opts, url: finalUrl });
    deps.updatePowerSaveBlocker();

    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('download-started', {
        id,
        opts: { ...opts, url: finalUrl },
        outDir,
      });
      mainWindow.webContents.send('switch-to-download-tab');
    }

    let downloadedFilePath = '';

    proc.stdout?.on('data', (d: Buffer) => {
      const text = d.toString();
      const dest = extractDestinationFromOutput(text, outDir);
      if (dest) downloadedFilePath = dest;

      const prog = parseYtDlpProgressLine(
        text.split('\n').find(l => l.includes('[download]')) || text
      );
      if (prog && prog.percent > 0 && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-progress', {
          id,
          percent: prog.percent,
          total: prog.total,
          speed: prog.speed,
          eta: prog.eta,
          raw: prog.raw,
          title: deps.activeOpts.get(id)?.title || opts?.title,
        });
      } else if (
        mainWindow &&
        !mainWindow.isDestroyed() &&
        (text.includes('[download]') ||
          text.includes('[ExtractAudio]') ||
          text.includes('[Merger]'))
      ) {
        mainWindow.webContents.send('download-log', { id, text: text.trim().slice(0, 300) });
      }
    });

    proc.stderr?.on('data', (d: Buffer) => {
      const errText = d.toString();
      log.error('[yt-dlp error output]', { output: errText.slice(0, 300) });
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send('download-log', { id, text: errText.trim().slice(0, 400) });
    });

    proc.on('close', code => {
      if (deps.cancelledIds.has(id)) {
        log.info('[VoltGet] download process closed after cancel', { id });
        deps.cancelledIds.delete(id);
        deps.activeDownloads.delete(id);
        deps.activeOpts.delete(id);
        deps.updatePowerSaveBlocker();
        deps.processPending();
        try {
          if (fs.existsSync(tempDir)) {
            const remaining = fs.readdirSync(tempDir);
            if (remaining.length === 0) fs.rmdirSync(tempDir);
          }
        } catch {}
        return;
      }
      if (deps.pausingIds.has(id)) {
        deps.pausingIds.delete(id);
        deps.activeDownloads.delete(id);
        deps.activeOpts.delete(id);
        deps.updatePowerSaveBlocker();
        deps.processPending();
        return;
      }
      const failed = (code ?? 1) !== 0;
      if (failed && !shouldRunFfmpegFallback(code, isHls)) {
        const scheduled = scheduleRetry(
          id,
          getRetryPolicyFrom(appConfig),
          () => {
            if (deps.cancelledIds.has(id)) return;
            deps.activeOpts.set(id, { ...opts, url: finalUrl });
            void doStartDownload(id, opts).catch(e =>
              log.error('[VoltGet] retry failed', { error: String(e) })
            );
          },
          (attempt, max, delayMs) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('download-log', {
                id,
                text: `🔄 Otomatik yeniden deneme ${attempt}/${max}: ${Math.round(delayMs / 1000)} sn sonra...`,
              });
            }
          }
        );
        if (scheduled) {
          deps.updatePowerSaveBlocker();
          return;
        }
      }
      deps.activeDownloads.delete(id);
      deps.activeOpts.delete(id);

      // Geçici voltget klasörünü temizle
      try {
        if (fs.existsSync(tempDir)) {
          const remaining = fs.readdirSync(tempDir);
          if (remaining.length === 0) fs.rmdirSync(tempDir);
        }
      } catch {}

      // Eğer yt-dlp hata verdiyse ve HLS / doğrudan akış ise otomatik FFmpeg fallback çalıştır!
      if (shouldRunFfmpegFallback(code, isHls)) {
        if (deps.cancelledIds.has(id)) return;
        if (!deps.isFfmpegOk()) {
          log.error(
            '[VoltGet] ffmpeg missing, cannot run HLS fallback. Install: winget install Gyan.FFmpeg'
          );
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-error', {
              id,
              error:
                'FFmpeg bulunamadı. HLS akışı birleştirilemiyor. Lütfen kurun: winget install Gyan.FFmpeg ve VoltGet uygulamasını yeniden başlatın.',
            });
          }
          deps.updatePowerSaveBlocker();
          deps.processPending();
          return;
        }
        log.info('[VoltGet] yt-dlp exited with code', {
          code,
          action: 'triggering ffmpeg fallback for HLS',
          finalUrl,
        });
        const rawFileName =
          opts.filename ||
          (opts.title
            ? `${opts.title.replace(/[\\/:*?"<>|]/g, '_')}.mp4`
            : `video_${Date.now()}.mp4`);
        const actualOut = path.join(outDir, rawFileName);
        const tempOut = path.join(tempDir, `ff_${id}_${rawFileName}`);
        const ffArgs = buildFfmpegFallbackArgs(
          finalUrl,
          { pageUrl: opts.pageUrl, cookie: opts.cookie, embedId },
          tempOut
        );

        log.info('[VoltGet ffmpeg fallback]', { id });
        const ffProc = spawn(ffmpegPath, ffArgs);
        deps.activeDownloads.set(id, {
          pause: () => {
            try {
              killProcessTree(ffProc);
            } catch {}
          },
          kill: () => {
            try {
              killProcessTree(ffProc);
            } catch {}
            try {
              if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
            } catch {}
          },
          resume: async () => {},
        });

        ffProc.stderr.on('data', (d: Buffer) => {
          const t = d.toString();
          const parsed = parseFfmpegProgressLine(t);
          if (parsed && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-progress', {
              id,
              percent: 50,
              total: 'HLS Akışı',
              speed: parsed.speed || '',
              eta: parsed.time || '',
              raw: `FFmpeg indiriyor: ${parsed.time} (${parsed.speed})`,
            });
          } else if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-log', {
              id,
              text: '[ffmpeg] ' + t.trim().slice(0, 400),
            });
          }
        });

        ffProc.on('close', ffCode => {
          if (deps.cancelledIds.has(id)) {
            log.info('[VoltGet] ffmpeg fallback process closed after cancel', { id });
            deps.cancelledIds.delete(id);
            deps.activeDownloads.delete(id);
            deps.activeOpts.delete(id);
            try {
              if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
            } catch {}
            deps.updatePowerSaveBlocker();
            deps.processPending();
            return;
          }
          if (deps.pausingIds.has(id)) {
            deps.pausingIds.delete(id);
            deps.activeDownloads.delete(id);
            deps.activeOpts.delete(id);
            deps.updatePowerSaveBlocker();
            deps.processPending();
            return;
          }
          if ((ffCode ?? 1) !== 0) {
            const scheduled = scheduleRetry(
              id,
              getRetryPolicyFrom(appConfig),
              () => {
                if (deps.cancelledIds.has(id)) return;
                deps.activeOpts.set(id, { ...opts, url: finalUrl });
                void doStartDownload(id, opts).catch(e =>
                  log.error('[VoltGet] retry failed', { error: String(e) })
                );
              },
              (attempt, max, delayMs) => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('download-log', {
                    id,
                    text: `🔄 Otomatik yeniden deneme ${attempt}/${max}: ${Math.round(delayMs / 1000)} sn sonra...`,
                  });
                }
              }
            );
            if (scheduled) {
              deps.updatePowerSaveBlocker();
              return;
            }
          } else {
            resetRetryAttempts(id);
          }
          deps.activeDownloads.delete(id);
          deps.updatePowerSaveBlocker();
          if (ffCode === 0 && fs.existsSync(tempOut)) {
            try {
              fs.renameSync(tempOut, actualOut);
            } catch {
              try {
                fs.copyFileSync(tempOut, actualOut);
                fs.unlinkSync(tempOut);
              } catch {}
            }
          } else {
            try {
              fs.unlinkSync(tempOut);
            } catch {}
          }

          let statSize = 0;
          if (ffCode === 0 && fs.existsSync(actualOut)) {
            try {
              statSize = fs.statSync(actualOut).size;
            } catch {}
            deps.addDownloadToHistory({
              id,
              url: finalUrl,
              title: opts.title || path.basename(actualOut),
              fileName: path.basename(actualOut),
              filePath: actualOut,
              fileSize: statSize,
              date: Date.now(),
            });
          }

          if (mainWindow && !mainWindow.isDestroyed()) {
            const { payload } = buildFfmpegDonePayload(
              id,
              ffCode ?? 1,
              outDir,
              actualOut,
              statSize
            );
            mainWindow.webContents.send('download-done', payload);
          }
          try {
            if (ffCode === 0)
              new Notification({
                title: 'İndirme tamamlandı (VoltGet)',
                body: (opts.title || finalUrl).slice(0, 60),
              }).show();
            else
              new Notification({
                title: 'İndirme hatası',
                body: `FFmpeg Hata Kodu ${ffCode}`,
              }).show();
          } catch {}
          deps.processPending();
        });

        ffProc.on('error', (e: any) => {
          if (deps.cancelledIds.has(id)) {
            deps.cancelledIds.delete(id);
            deps.activeDownloads.delete(id);
            deps.activeOpts.delete(id);
            deps.updatePowerSaveBlocker();
            try {
              if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
            } catch {}
            deps.processPending();
            return;
          }
          deps.activeDownloads.delete(id);
          deps.updatePowerSaveBlocker();
          try {
            if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
          } catch {}
          if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send('download-error', { id, error: String(e) });
          deps.processPending();
        });
        return;
      }

      if (code === 0) {
        resetRetryAttempts(id);
        if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
          maybeVirusScan(downloadedFilePath, !!appConfig.virusScanEnabled, text => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('download-log', { id, text });
            }
          });
        }
        if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
          const newest = findNewestDownload(outDir, 45000, deps.isTemporaryOrPartialFile);
          if (newest) downloadedFilePath = newest;
        }

        let statSize = 0;
        if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
          try {
            statSize = fs.statSync(downloadedFilePath).size;
          } catch {}
          deps.addDownloadToHistory({
            id,
            url: finalUrl,
            title: opts.title || path.basename(downloadedFilePath),
            fileName: path.basename(downloadedFilePath),
            filePath: downloadedFilePath,
            fileSize: statSize,
            date: Date.now(),
          });
        }
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        const { payload } = buildYtDlpDonePayload(id, code ?? 1, outDir, downloadedFilePath);
        mainWindow.webContents.send('download-done', payload);
      }
      try {
        if (code === 0)
          new Notification({
            title: 'İndirme tamamlandı (VoltGet)',
            body: (opts.title || finalUrl).slice(0, 60),
          }).show();
        else
          new Notification({
            title: 'İndirme hatası',
            body: `Kod ${code} • ${finalUrl.slice(0, 40)}`,
          }).show();
      } catch {}
      deps.updatePowerSaveBlocker();
      deps.processPending();
    });

    proc.on('error', (e: any) => {
      if (deps.cancelledIds.has(id)) {
        deps.cancelledIds.delete(id);
        deps.activeDownloads.delete(id);
        deps.activeOpts.delete(id);
        deps.updatePowerSaveBlocker();
        deps.processPending();
        return;
      }
      deps.activeDownloads.delete(id);
      deps.activeOpts.delete(id);
      deps.updatePowerSaveBlocker();
      if (mainWindow) mainWindow.webContents.send('download-error', { id, error: String(e) });
      deps.processPending();
    });
  }

  return {
    doStartDownload,
  };
}
