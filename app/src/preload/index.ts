import { contextBridge, ipcRenderer } from 'electron';
import type { CurrencySettings, SavedTheme, UsagePayload } from '../shared/types';

contextBridge.exposeInMainWorld('prismly', {
  onUsageUpdate(callback: (payload: UsagePayload) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: UsagePayload): void =>
      callback(payload);
    ipcRenderer.on('usage:update', listener);
    return () => ipcRenderer.removeListener('usage:update', listener);
  },
  hidePopup(): void {
    ipcRenderer.send('popup:hide');
  },
  refresh(): void {
    ipcRenderer.send('usage:refresh');
  },
  getTheme(): Promise<SavedTheme> {
    return ipcRenderer.invoke('theme:get');
  },
  setTheme(theme: SavedTheme): void {
    ipcRenderer.send('theme:set', theme);
  },
  getCurrency(): Promise<CurrencySettings> {
    return ipcRenderer.invoke('currency:get');
  },
  setCurrency(selected: CurrencySettings['selected']): void {
    ipcRenderer.send('currency:set', selected);
  },
});
