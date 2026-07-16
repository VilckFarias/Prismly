import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WindowSettings } from '../shared/types';

const DEFAULT_WINDOW_SETTINGS: WindowSettings = {
  alwaysOnTop: false,
};

function getWindowSettingsFilePath(): string {
  return join(app.getPath('userData'), 'window.json');
}

export function saveWindowSettings(settings: WindowSettings): void {
  writeFileSync(getWindowSettingsFilePath(), JSON.stringify(settings));
}

export function loadWindowSettings(): WindowSettings {
  const filePath = getWindowSettingsFilePath();
  if (!existsSync(filePath)) return DEFAULT_WINDOW_SETTINGS;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as WindowSettings;
    if (typeof parsed.alwaysOnTop !== 'boolean') {
      return DEFAULT_WINDOW_SETTINGS;
    }
    return parsed;
  } catch {
    return DEFAULT_WINDOW_SETTINGS;
  }
}
