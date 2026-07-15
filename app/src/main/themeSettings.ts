import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SavedTheme } from '../shared/types';

const DEFAULT_THEME: SavedTheme = {
  preset: 'escuro',
  colors: { bg: '#1b1b1f', text: '#dfdfd7', cardBg: '#242424' },
};

function getThemeFilePath(): string {
  return join(app.getPath('userData'), 'theme.json');
}

export function saveTheme(theme: SavedTheme): void {
  writeFileSync(getThemeFilePath(), JSON.stringify(theme));
}

export function loadTheme(): SavedTheme {
  const filePath = getThemeFilePath();
  if (!existsSync(filePath)) return DEFAULT_THEME;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as SavedTheme;
    if (
      typeof parsed.preset !== 'string' ||
      typeof parsed.colors?.bg !== 'string' ||
      typeof parsed.colors?.text !== 'string' ||
      typeof parsed.colors?.cardBg !== 'string'
    ) {
      return DEFAULT_THEME;
    }
    return parsed;
  } catch {
    return DEFAULT_THEME;
  }
}
