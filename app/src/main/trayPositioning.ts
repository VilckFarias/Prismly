export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isValidTrayBounds(bounds: Rect): boolean {
  return bounds.width > 0 && bounds.height > 0;
}

export function computeAboveTrayPosition(
  trayBounds: Rect,
  popupWidth: number,
  popupHeight: number,
): { x: number; y: number } {
  return {
    x: Math.round(trayBounds.x + trayBounds.width / 2 - popupWidth / 2),
    y: Math.round(trayBounds.y - popupHeight),
  };
}

export function computeFallbackPosition(
  workArea: Rect,
  popupWidth: number,
  popupHeight: number,
  margin: number,
): { x: number; y: number } {
  return {
    x: workArea.x + workArea.width - popupWidth - margin,
    y: workArea.y + workArea.height - popupHeight - margin,
  };
}
