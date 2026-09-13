import { ipcMain } from 'electron';

export function registerDialogIpc(deps: { getData: () => any; getDialogWindow: () => any }) {
  ipcMain.handle('get-download-dialog-data', () => deps.getData());
  ipcMain.handle('minimize-dialog', () => {
    const d = deps.getDialogWindow();
    if (d && !d.isDestroyed()) d.minimize();
  });
  ipcMain.handle('close-dialog', () => {
    const d = deps.getDialogWindow();
    if (d && !d.isDestroyed()) d.close();
  });
}
