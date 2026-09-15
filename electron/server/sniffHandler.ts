import { type BrowserWindow } from 'electron';
import { type WebSocketServer, WebSocket } from 'ws';
import { shouldIgnoreSniffUrl, type SniffDeduper } from '../sniff.js';
import {
  normalizeToMasterPlaylist,
  isMasterPlaylistUrl,
  isStreamUrl,
  isPlayerOrEmbedUrl,
} from '../utils/playlist.js';
import {
  isGenericDownload as isGenericSniffDownload,
  buildInitialDialogData,
  pickAnalyzeTarget,
  mergeAnalyzedIntoDialog,
  withTimeout,
} from '../sniff-handler.js';
import log from '../log/logger.js';

export interface SniffHandlerDeps {
  getMainWindow: () => BrowserWindow | null;
  getWss: () => WebSocketServer | null;
  sniffDeduper: SniffDeduper;
  recentStreamsByPage: Map<string, string>;
  createDownloadDialogWindow: (data: any) => void;
  getDownloadDialogWindow: () => BrowserWindow | null;
  setLastDownloadDialogData: (data: any) => void;
  analyzeUrl: (url: string) => Promise<any>;
}

export function createSniffHandler(deps: SniffHandlerDeps) {
  async function handleIncomingSniff(data: any): Promise<void> {
    if (data && data.url) {
      data.url = normalizeToMasterPlaylist(data.url);
    }
    const sniffId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const sniffData = { ...data, sniffId, time: new Date().toLocaleTimeString() };

    // 1. Gerçek medya akışını hafızaya al
    deps.sniffDeduper.remember(sniffData.url, sniffData.pageUrl);
    if (sniffData.url && isStreamUrl(sniffData.url)) {
      const isMaster = isMasterPlaylistUrl(sniffData.url);
      const existingLatest = deps.recentStreamsByPage.get('latest');
      if (isMaster || !existingLatest || !isMasterPlaylistUrl(existingLatest)) {
        deps.recentStreamsByPage.set('latest', sniffData.url);
      }
      if (sniffData.pageUrl) {
        const existingPage = deps.recentStreamsByPage.get(sniffData.pageUrl);
        if (isMaster || !existingPage || !isMasterPlaylistUrl(existingPage)) {
          deps.recentStreamsByPage.set(sniffData.pageUrl, sniffData.url);
        }
        try {
          const u = new URL(sniffData.pageUrl);
          const cleanHost = u.hostname.replace(/^www\./i, '').toLowerCase();
          const existingHost = deps.recentStreamsByPage.get(cleanHost);
          if (isMaster || !existingHost || !isMasterPlaylistUrl(existingHost)) {
            deps.recentStreamsByPage.set(cleanHost, sniffData.url);
            deps.recentStreamsByPage.set(u.hostname, sniffData.url);
          }
        } catch {}
      }
      if (sniffData.url) {
        try {
          const u = new URL(sniffData.url);
          const cleanHost = u.hostname.replace(/^www\./i, '').toLowerCase();
          const existingHost = deps.recentStreamsByPage.get(cleanHost);
          if (isMaster || !existingHost || !isMasterPlaylistUrl(existingHost)) {
            deps.recentStreamsByPage.set(cleanHost, sniffData.url);
          }
        } catch {}
      }
    }

    // 2. Ana pencere ve açık olan WebSocket istemcilerine yayın yap
    const curWss = deps.getWss();
    if (curWss) {
      curWss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'sniffed-url', data: sniffData }));
        }
      });
    }
    const mainWindow = deps.getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sniffed-url', sniffData);
    }

    // 3. IDM Davranışı: Kullanıcı video butonuna bastıysa veya tarayıcıda indirme başladıysa dialog aç
    if (data.userInitiated || data.isGenericDownload) {
      let resolvedUrl = data.url;
      const isVideoPortal =
        /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(
          data.pageUrl || ''
        ) || /youtube\.com|youtu\.be|googlevideo\.com/i.test(resolvedUrl || '');
      if (
        isVideoPortal &&
        data.pageUrl &&
        /youtube\.com|youtu\.be|tiktok\.com|instagram\.com|twitter\.com|x\.com|facebook\.com|dailymotion\.com|vimeo\.com/i.test(
          data.pageUrl
        )
      ) {
        resolvedUrl = data.pageUrl;
        data.url = data.pageUrl;
      } else if (resolvedUrl && isPlayerOrEmbedUrl(resolvedUrl)) {
        const matched =
          deps.sniffDeduper.resolve(data.pageUrl, data.url) ||
          deps.recentStreamsByPage.get(data.pageUrl) ||
          deps.recentStreamsByPage.get(data.url) ||
          deps.recentStreamsByPage.get('latest');
        if (matched && isStreamUrl(matched)) {
          log.info('[VoltGet] mapped embed/player page to real stream:', { matched });
          resolvedUrl = matched;
          data.url = matched;
        }
      }

      // Web scripti veya stillerini indirme penceresinde açma
      if (shouldIgnoreSniffUrl(resolvedUrl, data.filename)) {
        log.info('[VoltGet] Ignored web script in sniff handler:', { resolvedUrl });
        return;
      }

      const isGen = isGenericSniffDownload(resolvedUrl, data.filename, {
        isGenericDownload: data.isGenericDownload,
        type: data.type,
      });

      const initialData = buildInitialDialogData(data, resolvedUrl, isGen);

      // Doğrudan indirme penceresini ekrana fırlat
      deps.createDownloadDialogWindow(initialData);

      // Arka planda kaliteleri analiz et ve pencereye ilet
      if (!isGen && !resolvedUrl.endsWith('.pdf')) {
        const { target, waitTime } = pickAnalyzeTarget(resolvedUrl, data.pageUrl);

        withTimeout(deps.analyzeUrl(target), waitTime)
          .then((res: any) => {
            const analyzed = mergeAnalyzedIntoDialog(initialData, res, data.asAudio);
            deps.setLastDownloadDialogData(analyzed);
            const dialogWin = deps.getDownloadDialogWindow();
            if (dialogWin && !dialogWin.isDestroyed()) {
              dialogWin.webContents.send('show-download-dialog', analyzed);
            }
          })
          .catch(err => {
            log.warn('[VoltGet] analyze warning/timeout, using default formats:', {
              error: err?.message || err,
            });
            const fallback = {
              ...initialData,
              loading: false,
              formats: initialData.formats,
            };
            deps.setLastDownloadDialogData(fallback);
            const dialogWin = deps.getDownloadDialogWindow();
            if (dialogWin && !dialogWin.isDestroyed()) {
              dialogWin.webContents.send('show-download-dialog', fallback);
            }
          });
      }
    }
  }

  return {
    handleIncomingSniff,
  };
}
