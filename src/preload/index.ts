import { contextBridge, ipcRenderer } from 'electron';

const api = {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data: unknown) => ipcRenderer.invoke('settings:save', data),
  loadHistory: () => ipcRenderer.invoke('history:load'),
  appendHistory: (entry: unknown) => ipcRenderer.invoke('history:append', entry),
};

contextBridge.exposeInMainWorld('pokerCoach', api);

export type PokerCoachAPI = typeof api;
