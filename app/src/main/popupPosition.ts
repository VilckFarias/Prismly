import { app, screen } from 'electron';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface SavedPosition {
  x: number;
  y: number;
}

function getPositionFilePath(): string {
  return join(app.getPath('userData'), 'popup-position.json');
}

export function savePosition(x: number, y: number): void {
  writeFileSync(getPositionFilePath(), JSON.stringify({ x, y }));
}

export function loadPosition(): SavedPosition | null {
  const filePath = getPositionFilePath();
  if (!existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as SavedPosition;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isPositionOnScreen(x: number, y: number): boolean {
  return screen.getAllDisplays().some((display) => {
    const { x: dx, y: dy, width, height } = display.bounds;
    return x >= dx && x < dx + width && y >= dy && y < dy + height;
  });
}

export function clearPosition(): void {
  const filePath = getPositionFilePath();
  if (existsSync(filePath)) unlinkSync(filePath);
}
