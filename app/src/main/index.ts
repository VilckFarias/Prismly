import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { collectClaudeUsage } from '../../../core/adapters/claude.js';
import { calculateCost } from '../../../core/pricing.js';
import { aggregateUsage } from '../../../core/aggregator.js';
import { computeBlocks } from '../../../core/blocks.js';
import { startWatcher } from './watcher';
import type { AggregatedUsage, SessionBlock, UsagePayload } from '../shared/types';

function buildPayload(): UsagePayload {
  const records = collectClaudeUsage().map((record) => ({
    ...record,
    cost: calculateCost(record),
  }));

  return {
    aggregated: aggregateUsage(records) as AggregatedUsage,
    // computeBlocks() always resolves `end` to a projected or real ISO string
    // before returning (core/blocks.test.js covers both cases) — TS just
    // can't see that through the untyped core/ boundary.
    blocks: computeBlocks(records) as unknown as SessionBlock[],
  };
}

let mainWindow: BrowserWindow | null = null;

function sendUpdate(): void {
  if (!mainWindow) return;
  mainWindow.webContents.send('usage:update', buildPayload());
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('did-finish-load', sendUpdate);
}

app.whenReady().then(() => {
  createWindow();
  startWatcher(sendUpdate);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
