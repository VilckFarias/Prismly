# Fase 2 — Usabilidade e Comportamento da Janela Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reverse the Histórico sort order (most recent first), reorganize the Configuração tab into "Aparência"/"Comportamento" sub-tabs, and add an "always on top" toggle that fixes the popup falling behind other windows when it loses focus.

**Architecture:** Task 1 is a trivial, independent comparator flip. Task 2 adds main-process persistence + IPC for the new `WindowSettings` (mirroring the existing `themeSettings.ts`/`currencySettings.ts` pattern). Task 3 rebuilds `Configuracao.tsx`'s layout into sub-tabs and wires the new toggle end-to-end through `App.tsx` — kept as one task since `Configuracao` needs new required props that only `App.tsx` can supply, so a partial version would leave a broken build (same reasoning as the currency-conversion plan's Task 2).

**Tech Stack:** TypeScript, Electron IPC (`ipcMain.handle`/`ipcRenderer.invoke` for request/response, `ipcMain.on`/`ipcRenderer.send` for fire-and-forget), `BrowserWindow.setAlwaysOnTop()`, React/TSX.

## Global Constraints

- Code identifiers in English; user-facing text ("Sempre no topo", "Aparência", "Comportamento") in Portuguese — per `CLAUDE.md`.
- The always-on-top toggle defaults to `false` (off) — preserves today's tray-flyout behavior for anyone who doesn't opt in.
- Toggling applies live — no separate "Salvar" button, matching the theme/currency convention already established.
- Persistence via a JSON file through the main process (`window.json` in `app.getPath('userData')`), matching the existing `themeSettings.ts`/`currencySettings.ts` convention — not localStorage.
- "Por modelo"/"Por projeto" in Histórico are NOT touched — they already sort by cost, not date, and stay that way.
- No new runtime dependencies.

---

### Task 1: Reverse Histórico's sort order

**Files:**
- Modify: `app/src/renderer/src/tabs/Historico.tsx`

**Interfaces:**
- Consumes/produces: nothing shared with other tasks — fully independent, can be done in any order relative to Tasks 2/3.

- [ ] **Step 1: Flip the three sort comparators**

`app/src/renderer/src/tabs/Historico.tsx` currently reads (inside the `Historico` component):

```ts
  const byDayRows = Object.entries(aggregated.byDay).sort(([a], [b]) => a.localeCompare(b));
  const byWeekRows: [string, UsageBucket][] = Object.entries(aggregated.byWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => [formatWeekLabel(key), bucket]);
  const byMonthRows: [string, UsageBucket][] = Object.entries(aggregated.byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => [formatMonthLabel(key), bucket]);
  const byModelRows = Object.entries(aggregated.byModel).sort(([, a], [, b]) => b.cost - a.cost);
```

Change only the three date-based comparators (leave `byModelRows`/`byProjectRows` untouched):

```ts
  const byDayRows = Object.entries(aggregated.byDay).sort(([a], [b]) => b.localeCompare(a));
  const byWeekRows: [string, UsageBucket][] = Object.entries(aggregated.byWeek)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, bucket]) => [formatWeekLabel(key), bucket]);
  const byMonthRows: [string, UsageBucket][] = Object.entries(aggregated.byMonth)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, bucket]) => [formatMonthLabel(key), bucket]);
  const byModelRows = Object.entries(aggregated.byModel).sort(([, a], [, b]) => b.cost - a.cost);
```

Sorting still happens on the raw ISO key (unchanged), just with the two sides of `localeCompare` swapped — so the most recent day/week/month now sorts first, while the sort still stays correct chronologically (just descending instead of ascending).

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/src/tabs/Historico.tsx
git commit -m "feat: show most recent day/week/month first in Histórico"
```

---

### Task 2: Window-settings persistence and IPC

**Files:**
- Modify: `app/src/shared/types.ts` (add `WindowSettings`)
- Create: `app/src/main/windowSettings.ts`
- Modify: `app/src/main/popupWindow.ts` (apply saved `alwaysOnTop` at window creation)
- Modify: `app/src/main/index.ts` (add IPC handlers)
- Modify: `app/src/preload/index.ts` (expose `getWindowSettings`/`setAlwaysOnTop`)
- Modify: `app/src/renderer/src/prismly.d.ts` (type the two new `window.prismly` methods)

**Interfaces:**
- Produces (used by Task 3):
  - `interface WindowSettings { alwaysOnTop: boolean }`
  - `loadWindowSettings(): WindowSettings` and `saveWindowSettings(settings: WindowSettings): void`, exported from `app/src/main/windowSettings.ts`
  - `window.prismly.getWindowSettings(): Promise<WindowSettings>` and `window.prismly.setAlwaysOnTop(value: boolean): void`, available in the renderer

- [ ] **Step 1: Add `WindowSettings` to shared types**

`app/src/shared/types.ts` currently ends with:

```ts
export interface CurrencySettings {
  selected: 'usd' | 'brl';
  rate: number | null;
  fetchedAt: string | null;
}
```

Add a new interface after it:

```ts
export interface CurrencySettings {
  selected: 'usd' | 'brl';
  rate: number | null;
  fetchedAt: string | null;
}

export interface WindowSettings {
  alwaysOnTop: boolean;
}
```

- [ ] **Step 2: Create `app/src/main/windowSettings.ts`**

```ts
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
```

This mirrors `themeSettings.ts`'s exact shape (validated-JSON-with-fallback). No dedicated test file, matching the same precedent as `themeSettings.ts`/`popupGeometry.ts` (file I/O with side effects, not pure logic).

**Note for the implementer:** `app/src/main/currencySettings.ts` had to change its `import { app } from 'electron'` to `import electron from 'electron'` (with call sites using `electron.app.getPath(...)`) in an earlier plan, because a *named* import of `app` throws `SyntaxError: Named export 'app' not found` under plain `node --test` (outside Electron's own runtime, `require('electron')` resolves to a bare path string with no `app` property). This file (`windowSettings.ts`) has **no test file** in this task, so that failure mode doesn't apply here — keep the normal `import { app } from 'electron'` named import as shown above, matching `themeSettings.ts`'s and `popupGeometry.ts`'s existing style (both of which also have no test file and use the named import without issue).

- [ ] **Step 3: Apply the saved setting when creating the popup window**

`app/src/main/popupWindow.ts` currently reads:

```ts
import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { loadGeometry, saveGeometry } from './popupGeometry';

export const POPUP_WIDTH = 380;
export const POPUP_HEIGHT = 500;
export const POPUP_MIN_WIDTH = 320;
export const POPUP_MIN_HEIGHT = 400;

const SAVE_GEOMETRY_DEBOUNCE_MS = 300;

export function createPopupWindow(): BrowserWindow {
  const saved = loadGeometry();

  const popupWindow = new BrowserWindow({
    width: saved?.width ?? POPUP_WIDTH,
    height: saved?.height ?? POPUP_HEIGHT,
    minWidth: POPUP_MIN_WIDTH,
    minHeight: POPUP_MIN_HEIGHT,
    show: false,
    frame: false,
    resizable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
```

Add the import and the `alwaysOnTop` option:

```ts
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
```

The rest of the file (the geometry-saving logic further down) is unchanged.

- [ ] **Step 4: Wire IPC handlers in `app/src/main/index.ts`**

The top of `app/src/main/index.ts` currently reads:

```ts
import { app, BrowserWindow, ipcMain, Tray } from 'electron';
import { collectClaudeUsage } from '../../../core/adapters/claude';
import { calculateCost } from '../../../core/pricing';
import { aggregateUsage } from '../../../core/aggregator';
import { computeBlocks } from '../../../core/blocks';
import { startWatcher } from './watcher';
import { createPopupWindow } from './popupWindow';
import { createTray } from './tray';
import { loadTheme, saveTheme } from './themeSettings';
import { loadCurrencySettings, refreshExchangeRateIfNeeded, saveCurrencySettings } from './currencySettings';
import type { CurrencySettings, SavedTheme, UsagePayload } from '../shared/types';
```

Add the window-settings import:

```ts
import { app, BrowserWindow, ipcMain, Tray } from 'electron';
import { collectClaudeUsage } from '../../../core/adapters/claude';
import { calculateCost } from '../../../core/pricing';
import { aggregateUsage } from '../../../core/aggregator';
import { computeBlocks } from '../../../core/blocks';
import { startWatcher } from './watcher';
import { createPopupWindow } from './popupWindow';
import { createTray } from './tray';
import { loadTheme, saveTheme } from './themeSettings';
import { loadCurrencySettings, refreshExchangeRateIfNeeded, saveCurrencySettings } from './currencySettings';
import { loadWindowSettings, saveWindowSettings } from './windowSettings';
import type { CurrencySettings, SavedTheme, UsagePayload } from '../shared/types';
```

The `app.whenReady().then(() => { ... })` block currently ends with:

```ts
  ipcMain.handle('currency:get', () => loadCurrencySettings());

  ipcMain.on('currency:set', (_event, selected: CurrencySettings['selected']) => {
    const current = loadCurrencySettings();
    saveCurrencySettings({ ...current, selected });
  });
});
```

Add two more handlers right after `currency:set`:

```ts
  ipcMain.handle('currency:get', () => loadCurrencySettings());

  ipcMain.on('currency:set', (_event, selected: CurrencySettings['selected']) => {
    const current = loadCurrencySettings();
    saveCurrencySettings({ ...current, selected });
  });

  ipcMain.handle('window:getSettings', () => loadWindowSettings());

  ipcMain.on('window:setAlwaysOnTop', (_event, alwaysOnTop: boolean) => {
    saveWindowSettings({ alwaysOnTop });
    popupWindow?.setAlwaysOnTop(alwaysOnTop);
  });
});
```

`popupWindow?.setAlwaysOnTop(alwaysOnTop)` applies the change to the already-open window immediately — `BrowserWindow.setAlwaysOnTop()` is a live-effect Electron API method, no window recreation needed.

- [ ] **Step 5: Expose `getWindowSettings`/`setAlwaysOnTop` in the preload script**

`app/src/preload/index.ts` currently reads:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { CurrencySettings, SavedTheme, UsagePayload } from '../shared/types';

contextBridge.exposeInMainWorld('prismly', {
  onUsageUpdate(callback: (payload: UsagePayload) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: UsagePayload): void =>
      callback(payload);
    ipcRenderer.on('usage:update', listener);
    return () => ipcRenderer.removeListener('usage:update', listener);
  },
  hidePopup(): void {
    ipcRenderer.send('popup:hide');
  },
  refresh(): void {
    ipcRenderer.send('usage:refresh');
  },
  getTheme(): Promise<SavedTheme> {
    return ipcRenderer.invoke('theme:get');
  },
  setTheme(theme: SavedTheme): void {
    ipcRenderer.send('theme:set', theme);
  },
  getCurrency(): Promise<CurrencySettings> {
    return ipcRenderer.invoke('currency:get');
  },
  setCurrency(selected: CurrencySettings['selected']): void {
    ipcRenderer.send('currency:set', selected);
  },
});
```

Replace it with:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { CurrencySettings, SavedTheme, UsagePayload, WindowSettings } from '../shared/types';

contextBridge.exposeInMainWorld('prismly', {
  onUsageUpdate(callback: (payload: UsagePayload) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: UsagePayload): void =>
      callback(payload);
    ipcRenderer.on('usage:update', listener);
    return () => ipcRenderer.removeListener('usage:update', listener);
  },
  hidePopup(): void {
    ipcRenderer.send('popup:hide');
  },
  refresh(): void {
    ipcRenderer.send('usage:refresh');
  },
  getTheme(): Promise<SavedTheme> {
    return ipcRenderer.invoke('theme:get');
  },
  setTheme(theme: SavedTheme): void {
    ipcRenderer.send('theme:set', theme);
  },
  getCurrency(): Promise<CurrencySettings> {
    return ipcRenderer.invoke('currency:get');
  },
  setCurrency(selected: CurrencySettings['selected']): void {
    ipcRenderer.send('currency:set', selected);
  },
  getWindowSettings(): Promise<WindowSettings> {
    return ipcRenderer.invoke('window:getSettings');
  },
  setAlwaysOnTop(value: boolean): void {
    ipcRenderer.send('window:setAlwaysOnTop', value);
  },
});
```

- [ ] **Step 6: Update the `window.prismly` type declaration**

`app/src/renderer/src/prismly.d.ts` currently reads:

```ts
import type { CurrencySettings, SavedTheme, UsagePayload } from '../../shared/types';

declare global {
  interface Window {
    prismly: {
      onUsageUpdate(callback: (payload: UsagePayload) => void): () => void;
      hidePopup(): void;
      refresh(): void;
      getTheme(): Promise<SavedTheme>;
      setTheme(theme: SavedTheme): void;
      getCurrency(): Promise<CurrencySettings>;
      setCurrency(selected: CurrencySettings['selected']): void;
    };
  }
}

export {};
```

Replace it with:

```ts
import type { CurrencySettings, SavedTheme, UsagePayload, WindowSettings } from '../../shared/types';

declare global {
  interface Window {
    prismly: {
      onUsageUpdate(callback: (payload: UsagePayload) => void): () => void;
      hidePopup(): void;
      refresh(): void;
      getTheme(): Promise<SavedTheme>;
      setTheme(theme: SavedTheme): void;
      getCurrency(): Promise<CurrencySettings>;
      setCurrency(selected: CurrencySettings['selected']): void;
      getWindowSettings(): Promise<WindowSettings>;
      setAlwaysOnTop(value: boolean): void;
    };
  }
}

export {};
```

- [ ] **Step 7: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 8: Commit**

```bash
git add app/src/shared/types.ts app/src/main/windowSettings.ts app/src/main/popupWindow.ts app/src/main/index.ts app/src/preload/index.ts app/src/renderer/src/prismly.d.ts
git commit -m "feat: add always-on-top window setting, persistence, and IPC"
```

---

### Task 3: Sub-tabs in Configuração + always-on-top toggle

**Files:**
- Modify: `app/src/renderer/src/tabs/Configuracao.tsx`
- Modify: `app/src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `WindowSettings` and `window.prismly.getWindowSettings`/`setAlwaysOnTop` (Task 2).
- Produces: nothing consumed by other tasks — this is the last task in the plan.

- [ ] **Step 1: Rebuild `Configuracao.tsx` with sub-tabs and the new toggle**

`app/src/renderer/src/tabs/Configuracao.tsx` currently reads in full:

```tsx
import type { CSSProperties, JSX } from 'react';
import type { CurrencySettings, SavedTheme, ThemeColors } from '../../../shared/types';
import { THEME_PRESETS } from '../themes';

function swatchButtonStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    border: active ? '2px solid #4f9eff' : '2px solid transparent',
    background: 'var(--theme-card-bg)',
    cursor: 'pointer',
    font: 'inherit',
  };
}

function Preview({ colors }: { colors: ThemeColors }): JSX.Element {
  return (
    <div
      style={{
        width: 48,
        height: 32,
        borderRadius: 4,
        background: colors.bg,
        display: 'flex',
        alignItems: 'flex-end',
        padding: 4,
      }}
    >
      <div style={{ width: '100%', height: 12, borderRadius: 2, background: colors.cardBg }} />
    </div>
  );
}

function colorRowStyle(): CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    color: '#999',
  };
}

function currencyButtonStyle(active: boolean): CSSProperties {
  return {
    fontSize: 12,
    padding: '6px 14px',
    borderRadius: 12,
    border: 'none',
    background: active ? '#4f9eff' : 'var(--theme-card-bg)',
    color: active ? '#fff' : '#999',
    cursor: 'pointer',
  };
}

export function Configuracao({
  currentTheme,
  onThemeChange,
  currency,
  onCurrencyChange,
}: {
  currentTheme: SavedTheme;
  onThemeChange: (theme: SavedTheme) => void;
  currency: CurrencySettings;
  onCurrencyChange: (selected: CurrencySettings['selected']) => void;
}): JSX.Element {
  const isCustom = currentTheme.preset === 'personalizado';
  const rateUnavailable = currency.selected === 'brl' && currency.rate === null;

  function updateCustomColor(key: keyof ThemeColors, value: string): void {
    onThemeChange({ preset: 'personalizado', colors: { ...currentTheme.colors, [key]: value } });
  }

  return (
    <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
      <h2 style={{ fontSize: 13, marginBottom: 10 }}>Tema</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {THEME_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => onThemeChange({ preset: preset.name, colors: preset.colors })}
            style={swatchButtonStyle(currentTheme.preset === preset.name)}
          >
            <Preview colors={preset.colors} />
            <span style={{ fontSize: 11, color: '#ccc' }}>{preset.label}</span>
          </button>
        ))}
        <button
          onClick={() => onThemeChange({ preset: 'personalizado', colors: currentTheme.colors })}
          style={swatchButtonStyle(isCustom)}
        >
          <Preview colors={currentTheme.colors} />
          <span style={{ fontSize: 11, color: '#ccc' }}>Personalizado</span>
        </button>
      </div>

      {isCustom && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={colorRowStyle()}>
            Fundo da tela
            <input
              type="color"
              value={currentTheme.colors.bg}
              onChange={(e) => updateCustomColor('bg', e.target.value)}
            />
          </label>
          <label style={colorRowStyle()}>
            Texto
            <input
              type="color"
              value={currentTheme.colors.text}
              onChange={(e) => updateCustomColor('text', e.target.value)}
            />
          </label>
          <label style={colorRowStyle()}>
            Fundo dos cards
            <input
              type="color"
              value={currentTheme.colors.cardBg}
              onChange={(e) => updateCustomColor('cardBg', e.target.value)}
            />
          </label>
        </div>
      )}

      <h2 style={{ fontSize: 13, marginTop: 20, marginBottom: 10 }}>Moeda</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onCurrencyChange('usd')}
          disabled={currency.selected === 'usd'}
          style={currencyButtonStyle(currency.selected === 'usd')}
        >
          Dólar (US$)
        </button>
        <button
          onClick={() => onCurrencyChange('brl')}
          disabled={currency.selected === 'brl'}
          style={currencyButtonStyle(currency.selected === 'brl')}
        >
          Real (R$)
        </button>
      </div>
      {rateUnavailable && (
        <p style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
          Cotação indisponível no momento — exibindo em US$ até conseguir buscar.
        </p>
      )}
    </div>
  );
}
```

Replace the full file with:

```tsx
import { useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { CurrencySettings, SavedTheme, ThemeColors, WindowSettings } from '../../../shared/types';
import { THEME_PRESETS } from '../themes';

function swatchButtonStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    border: active ? '2px solid #4f9eff' : '2px solid transparent',
    background: 'var(--theme-card-bg)',
    cursor: 'pointer',
    font: 'inherit',
  };
}

function Preview({ colors }: { colors: ThemeColors }): JSX.Element {
  return (
    <div
      style={{
        width: 48,
        height: 32,
        borderRadius: 4,
        background: colors.bg,
        display: 'flex',
        alignItems: 'flex-end',
        padding: 4,
      }}
    >
      <div style={{ width: '100%', height: 12, borderRadius: 2, background: colors.cardBg }} />
    </div>
  );
}

function colorRowStyle(): CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    color: '#999',
  };
}

function currencyButtonStyle(active: boolean): CSSProperties {
  return {
    fontSize: 12,
    padding: '6px 14px',
    borderRadius: 12,
    border: 'none',
    background: active ? '#4f9eff' : 'var(--theme-card-bg)',
    color: active ? '#fff' : '#999',
    cursor: 'pointer',
  };
}

type SubView = 'aparencia' | 'comportamento';

function subNavButtonStyle(active: boolean): CSSProperties {
  return {
    fontSize: 12,
    padding: '5px 12px',
    borderRadius: 12,
    border: 'none',
    background: active ? '#4f9eff' : 'var(--theme-card-bg)',
    color: active ? '#fff' : '#999',
    cursor: 'pointer',
  };
}

function toggleRowStyle(): CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    color: '#ccc',
  };
}

export function Configuracao({
  currentTheme,
  onThemeChange,
  currency,
  onCurrencyChange,
  windowSettings,
  onAlwaysOnTopChange,
}: {
  currentTheme: SavedTheme;
  onThemeChange: (theme: SavedTheme) => void;
  currency: CurrencySettings;
  onCurrencyChange: (selected: CurrencySettings['selected']) => void;
  windowSettings: WindowSettings;
  onAlwaysOnTopChange: (value: boolean) => void;
}): JSX.Element {
  const [subView, setSubView] = useState<SubView>('aparencia');
  const isCustom = currentTheme.preset === 'personalizado';
  const rateUnavailable = currency.selected === 'brl' && currency.rate === null;

  function updateCustomColor(key: keyof ThemeColors, value: string): void {
    onThemeChange({ preset: 'personalizado', colors: { ...currentTheme.colors, [key]: value } });
  }

  return (
    <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setSubView('aparencia')} style={subNavButtonStyle(subView === 'aparencia')}>
          Aparência
        </button>
        <button onClick={() => setSubView('comportamento')} style={subNavButtonStyle(subView === 'comportamento')}>
          Comportamento
        </button>
      </div>

      {subView === 'aparencia' && (
        <>
          <h2 style={{ fontSize: 13, marginBottom: 10 }}>Tema</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => onThemeChange({ preset: preset.name, colors: preset.colors })}
                style={swatchButtonStyle(currentTheme.preset === preset.name)}
              >
                <Preview colors={preset.colors} />
                <span style={{ fontSize: 11, color: '#ccc' }}>{preset.label}</span>
              </button>
            ))}
            <button
              onClick={() => onThemeChange({ preset: 'personalizado', colors: currentTheme.colors })}
              style={swatchButtonStyle(isCustom)}
            >
              <Preview colors={currentTheme.colors} />
              <span style={{ fontSize: 11, color: '#ccc' }}>Personalizado</span>
            </button>
          </div>

          {isCustom && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={colorRowStyle()}>
                Fundo da tela
                <input
                  type="color"
                  value={currentTheme.colors.bg}
                  onChange={(e) => updateCustomColor('bg', e.target.value)}
                />
              </label>
              <label style={colorRowStyle()}>
                Texto
                <input
                  type="color"
                  value={currentTheme.colors.text}
                  onChange={(e) => updateCustomColor('text', e.target.value)}
                />
              </label>
              <label style={colorRowStyle()}>
                Fundo dos cards
                <input
                  type="color"
                  value={currentTheme.colors.cardBg}
                  onChange={(e) => updateCustomColor('cardBg', e.target.value)}
                />
              </label>
            </div>
          )}

          <h2 style={{ fontSize: 13, marginTop: 20, marginBottom: 10 }}>Moeda</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onCurrencyChange('usd')}
              disabled={currency.selected === 'usd'}
              style={currencyButtonStyle(currency.selected === 'usd')}
            >
              Dólar (US$)
            </button>
            <button
              onClick={() => onCurrencyChange('brl')}
              disabled={currency.selected === 'brl'}
              style={currencyButtonStyle(currency.selected === 'brl')}
            >
              Real (R$)
            </button>
          </div>
          {rateUnavailable && (
            <p style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
              Cotação indisponível no momento — exibindo em US$ até conseguir buscar.
            </p>
          )}
        </>
      )}

      {subView === 'comportamento' && (
        <>
          <h2 style={{ fontSize: 13, marginBottom: 10 }}>Janela</h2>
          <label style={toggleRowStyle()}>
            Sempre no topo
            <input
              type="checkbox"
              checked={windowSettings.alwaysOnTop}
              onChange={(e) => onAlwaysOnTopChange(e.target.checked)}
            />
          </label>
        </>
      )}
    </div>
  );
}
```

`subView` is local component state (`useState`), not lifted to `App.tsx` — it's a pure presentation detail of which sub-tab is showing, with no other component needing to know about it. The existing Tema/Moeda JSX is unchanged except for being wrapped inside the `subView === 'aparencia'` branch — no logic changes to those two sections.

- [ ] **Step 2: Wire `windowSettings` loading and props into `App.tsx`**

`App.tsx` currently reads:

```tsx
import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { CurrencySettings, SavedTheme, UsageBucket, UsagePayload } from '../../shared/types';
import { Historico } from './tabs/Historico';
import { AoVivo } from './tabs/AoVivo';
import { Configuracao } from './tabs/Configuracao';
import { applyTheme } from './themes';
```

Change the imports to:

```tsx
import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { CurrencySettings, SavedTheme, UsageBucket, UsagePayload, WindowSettings } from '../../shared/types';
import { Historico } from './tabs/Historico';
import { AoVivo } from './tabs/AoVivo';
import { Configuracao } from './tabs/Configuracao';
import { applyTheme } from './themes';
```

The state/effects block currently reads:

```tsx
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [view, setView] = useState<View>('ao-vivo');
  const [refreshing, setRefreshing] = useState(false);
  const [theme, setThemeState] = useState<SavedTheme | null>(null);
  const [currency, setCurrencyState] = useState<CurrencySettings | null>(null);

  useEffect(() => {
    return window.prismly.onUsageUpdate((newPayload) => {
      setPayload(newPayload);
      setLastUpdated(new Date());
      setRefreshing(false);
    });
  }, []);

  useEffect(() => {
    window.prismly.getTheme().then((savedTheme) => {
      applyTheme(savedTheme.colors);
      setThemeState(savedTheme);
    });
  }, []);

  useEffect(() => {
    window.prismly.getCurrency().then((savedCurrency) => {
      setCurrencyState(savedCurrency);
    });
  }, []);

  const handleRefresh = (): void => {
    setRefreshing(true);
    window.prismly.refresh();
  };

  const handleThemeChange = (newTheme: SavedTheme): void => {
    applyTheme(newTheme.colors);
    window.prismly.setTheme(newTheme);
    setThemeState(newTheme);
  };

  const handleCurrencyChange = (selected: CurrencySettings['selected']): void => {
    if (!currency) return;
    window.prismly.setCurrency(selected);
    setCurrencyState({ ...currency, selected });
  };
```

Add window-settings state, a load-on-mount effect, and a change handler:

```tsx
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [view, setView] = useState<View>('ao-vivo');
  const [refreshing, setRefreshing] = useState(false);
  const [theme, setThemeState] = useState<SavedTheme | null>(null);
  const [currency, setCurrencyState] = useState<CurrencySettings | null>(null);
  const [windowSettings, setWindowSettingsState] = useState<WindowSettings | null>(null);

  useEffect(() => {
    return window.prismly.onUsageUpdate((newPayload) => {
      setPayload(newPayload);
      setLastUpdated(new Date());
      setRefreshing(false);
    });
  }, []);

  useEffect(() => {
    window.prismly.getTheme().then((savedTheme) => {
      applyTheme(savedTheme.colors);
      setThemeState(savedTheme);
    });
  }, []);

  useEffect(() => {
    window.prismly.getCurrency().then((savedCurrency) => {
      setCurrencyState(savedCurrency);
    });
  }, []);

  useEffect(() => {
    window.prismly.getWindowSettings().then((savedWindowSettings) => {
      setWindowSettingsState(savedWindowSettings);
    });
  }, []);

  const handleRefresh = (): void => {
    setRefreshing(true);
    window.prismly.refresh();
  };

  const handleThemeChange = (newTheme: SavedTheme): void => {
    applyTheme(newTheme.colors);
    window.prismly.setTheme(newTheme);
    setThemeState(newTheme);
  };

  const handleCurrencyChange = (selected: CurrencySettings['selected']): void => {
    if (!currency) return;
    window.prismly.setCurrency(selected);
    setCurrencyState({ ...currency, selected });
  };

  const handleAlwaysOnTopChange = (value: boolean): void => {
    window.prismly.setAlwaysOnTop(value);
    setWindowSettingsState({ alwaysOnTop: value });
  };
```

The render block currently reads:

```tsx
        {view === 'configuracao' && theme && currency && (
          <Configuracao
            currentTheme={theme}
            onThemeChange={handleThemeChange}
            currency={currency}
            onCurrencyChange={handleCurrencyChange}
          />
        )}
```

Add the `windowSettings` guard and props:

```tsx
        {view === 'configuracao' && theme && currency && windowSettings && (
          <Configuracao
            currentTheme={theme}
            onThemeChange={handleThemeChange}
            currency={currency}
            onCurrencyChange={handleCurrencyChange}
            windowSettings={windowSettings}
            onAlwaysOnTopChange={handleAlwaysOnTopChange}
          />
        )}
```

The `ao-vivo` and `historico` branches are unchanged — they don't need `windowSettings`.

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 4: Commit**

```bash
git add app/src/renderer/src/tabs/Configuracao.tsx app/src/renderer/src/App.tsx
git commit -m "feat: reorganize Configuração into sub-tabs, add always-on-top toggle"
```

---

## Manual verification

After all three tasks: run `npm run dev` from `app/`.

1. **Task 1:** open Histórico, confirm Dia/Semana/Mês all show the most recent entry at the top.
2. **Task 2/3 combined:** open Configuração, confirm the "Aparência"/"Comportamento" sub-tabs appear, with Tema/Moeda intact under "Aparência" (behaving exactly as before). Switch to "Comportamento", confirm the "Sempre no topo" checkbox appears, unchecked by default.
3. Check the checkbox, then click into another app (e.g. VS Code) — confirm the Prismly popup stays visible on top instead of falling behind.
4. Uncheck it, click into another app again — confirm the popup now falls behind as before (back to the pre-existing behavior).
5. Close and reopen the app (or use "Redefinir janela" from the tray menu) and confirm the always-on-top choice persists.
