import { app, BrowserWindow, Menu, Tray } from 'electron';
import { join } from 'node:path';
import { POPUP_HEIGHT, POPUP_WIDTH } from './popupWindow';
import { clearGeometry, isPositionOnScreen, loadGeometry } from './popupGeometry';

function anchorAboveTray(popupWindow: BrowserWindow, tray: Tray): void {
  const trayBounds = tray.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - POPUP_WIDTH / 2);
  const y = Math.round(trayBounds.y - POPUP_HEIGHT);
  popupWindow.setPosition(x, y, false);
}

function positionPopup(popupWindow: BrowserWindow, tray: Tray): void {
  const saved = loadGeometry();
  if (saved && isPositionOnScreen(saved.x, saved.y)) {
    popupWindow.setPosition(saved.x, saved.y, false);
    return;
  }

  anchorAboveTray(popupWindow, tray);
}

function togglePopup(popupWindow: BrowserWindow, tray: Tray): void {
  if (popupWindow.isVisible()) {
    popupWindow.hide();
    return;
  }

  positionPopup(popupWindow, tray);
  popupWindow.show();
  popupWindow.focus();
}

function resetWindow(popupWindow: BrowserWindow, tray: Tray): void {
  clearGeometry();
  if (popupWindow.isVisible()) {
    popupWindow.setSize(POPUP_WIDTH, POPUP_HEIGHT);
    anchorAboveTray(popupWindow, tray);
  }
}

export function createTray(popupWindow: BrowserWindow): Tray {
  const tray = new Tray(join(__dirname, '../../resources/icon.png'));
  tray.setToolTip('Prismly');

  tray.on('click', () => togglePopup(popupWindow, tray));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Redefinir janela', click: () => resetWindow(popupWindow, tray) },
    { label: 'Sair', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);

  return tray;
}
