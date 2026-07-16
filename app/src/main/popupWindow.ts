import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { loadGeometry, saveGeometry } from './popupGeometry';
import { loadWindowSettings } from './windowSettings';

export const POPUP_WIDTH = 380;
export const POPUP_HEIGHT = 500;
export const POPUP_MIN_WIDTH = 320;
export const POPUP_MIN_HEIGHT = 400;

const SAVE_GEOMETRY_DEBOUNCE_MS = 300;

export function createPopupWindow(): BrowserWindow {
  const saved = loadGeometry();
  const windowSettings = loadWindowSettings();

  const popupWindow = new BrowserWindow({
    width: saved?.width ?? POPUP_WIDTH,
    height: saved?.height ?? POPUP_HEIGHT,
    minWidth: POPUP_MIN_WIDTH,
    minHeight: POPUP_MIN_HEIGHT,
    show: false,
    frame: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: windowSettings.alwaysOnTop,
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

  let saveTimeout: NodeJS.Timeout | null = null;
  const scheduleSaveGeometry = (): void => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const bounds = popupWindow.getBounds();
      saveGeometry(bounds.x, bounds.y, bounds.width, bounds.height);
    }, SAVE_GEOMETRY_DEBOUNCE_MS);
  };

  popupWindow.on('moved', scheduleSaveGeometry);
  popupWindow.on('resized', scheduleSaveGeometry);

  return popupWindow;
}
