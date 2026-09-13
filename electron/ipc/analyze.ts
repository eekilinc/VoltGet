import { ipcMain } from 'electron';

export function registerAnalyzeIpc(deps: {
  normalizeToMasterPlaylist: (u: string) => string;
  analyzeUrl: (u: string) => Promise<any>;
}) {
  ipcMain.handle('analyze-url', async (_e, rawUrl: string) => {
    const url = deps.normalizeToMasterPlaylist(rawUrl);
    return deps.analyzeUrl(url);
  });
}
