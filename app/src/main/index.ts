import { app, BrowserWindow, Tray } from 'electron';
import { collectClaudeUsage } from '../../../core/adapters/claude';
import { calculateCost } from '../../../core/pricing';
import { aggregateUsage } from '../../../core/aggregator';
import { computeBlocks } from '../../../core/blocks';
import { startWatcher } from './watcher';
import { createPopupWindow } from './popupWindow';
import { createTray } from './tray';
import type { UsagePayload } from '../shared/types';

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
  popupWindow = createPopupWindow();
  popupWindow.webContents.on('did-finish-load', sendUpdate);
  tray = createTray(popupWindow);
  void tray;
  startWatcher(sendUpdate);
});
