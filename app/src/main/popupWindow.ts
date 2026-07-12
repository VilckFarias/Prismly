import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { savePosition } from './popupPosition';

export const POPUP_WIDTH = 380;
export const POPUP_HEIGHT = 500;

const SAVE_POSITION_DEBOUNCE_MS = 300;

export function createPopupWindow(): BrowserWindow {
  const popupWindow = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    popupWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    popupWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  popupWindow.on('blur', () => {
    popupWindow.hide();
  });

  let saveTimeout: NodeJS.Timeout | null = null;
  popupWindow.on('moved', () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const [x, y] = popupWindow.getPosition();
      savePosition(x, y);
    }, SAVE_POSITION_DEBOUNCE_MS);
  });

  return popupWindow;
}
