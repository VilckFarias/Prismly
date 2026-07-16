import { app, BrowserWindow, ipcMain, Tray } from 'electron';
import { collectClaudeUsage } from '../../../core/adapters/claude';
import { calculateCost } from '../../../core/pricing';
import { aggregateUsage } from '../../../core/aggregator';
import { computeBlocks } from '../../../core/blocks';
import { startWatcher } from './watcher';
import { createPopupWindow } from './popupWindow';
import { createTray } from './tray';
import { loadTheme, saveTheme } from './themeSettings';
import { loadCurrencySettings, refreshExchangeRateIfNeeded, saveCurrencySettings } from './currencySettings';
import { loadWindowSettings, saveWindowSettings } from './windowSettings';
import type { CurrencySettings, SavedTheme, UsagePayload } from '../shared/types';

function buildPayload(): UsagePayload {
  const records = collectClaudeUsage().map((record) => ({
    ...record,
    cost: calculateCost(record),
  }));

  return {
    aggregated: aggregateUsage(records),
    blocks: computeBlocks(records),
  };
}

let popupWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function sendUpdate(): void {
  if (!popupWindow) return;
  popupWindow.webContents.send('usage:update', buildPayload());
}

app.whenReady().then(() => {
  if (process.platform === 'linux') {
    console.warn(
      'No GNOME, o ícone da bandeja só aparece com a extensão AppIndicator/KStatusNotifierItem instalada. Veja o README.',
    );
  }

  popupWindow = createPopupWindow();
  popupWindow.webContents.on('did-finish-load', sendUpdate);
  tray = createTray(popupWindow);
  void tray;
  startWatcher(sendUpdate);

  ipcMain.on('popup:hide', () => {
    popupWindow?.hide();
  });

  ipcMain.on('usage:refresh', () => {
    sendUpdate();
  });

  ipcMain.handle('theme:get', () => loadTheme());

  ipcMain.on('theme:set', (_event, theme: SavedTheme) => {
    saveTheme(theme);
  });

  void refreshExchangeRateIfNeeded();

  ipcMain.handle('currency:get', () => loadCurrencySettings());

  ipcMain.on('currency:set', (_event, selected: CurrencySettings['selected']) => {
    const current = loadCurrencySettings();
    saveCurrencySettings({ ...current, selected });
  });

  ipcMain.handle('window:getSettings', () => loadWindowSettings());

  ipcMain.on('window:setAlwaysOnTop', (_event, alwaysOnTop: boolean) => {
    saveWindowSettings({ alwaysOnTop });
    popupWindow?.setAlwaysOnTop(alwaysOnTop);
  });
});
