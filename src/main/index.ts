import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { loadSettings, saveSettings, loadHandHistory, appendHandHistory } from './persistence';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#0c2a1d',
    title: 'Poker Coach',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('settings:load', () => loadSettings());
  ipcMain.handle('settings:save', (_e, data) => saveSettings(data));
  ipcMain.handle('history:load', () => loadHandHistory());
  ipcMain.handle('history:append', (_e, entry) => appendHandHistory(entry));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
