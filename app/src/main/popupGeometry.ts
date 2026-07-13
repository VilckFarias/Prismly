import { app, screen } from 'electron';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface SavedGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getGeometryFilePath(): string {
  return join(app.getPath('userData'), 'popup-geometry.json');
}

export function saveGeometry(x: number, y: number, width: number, height: number): void {
  writeFileSync(getGeometryFilePath(), JSON.stringify({ x, y, width, height }));
}

export function loadGeometry(): SavedGeometry | null {
  const filePath = getGeometryFilePath();
  if (!existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as SavedGeometry;
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number'
    ) {
      return null;
    }
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

export function clearGeometry(): void {
  const filePath = getGeometryFilePath();
  if (existsSync(filePath)) unlinkSync(filePath);
}
