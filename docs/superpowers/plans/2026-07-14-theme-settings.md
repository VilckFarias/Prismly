# Configuração Tab — Theme Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first version of the "Configuração" tab — a theme picker with 7 presets plus a fully custom mode (background, text, and card-background colors), replacing the leftover electron-vite scaffold background and dead CSS.

**Architecture:** Theme preference is persisted as a JSON file via the main process (`app/src/main/themeSettings.ts`, mirroring the existing `popupGeometry.ts` pattern), exposed to the renderer through two new IPC channels. The renderer applies the active theme by setting 3 CSS custom properties (`--theme-bg`, `--theme-text`, `--theme-card-bg`) on the document root; existing CSS and the `Historico` card list read those variables instead of hardcoded hex. A new `Configuracao.tsx` tab renders the preset picker and, for the custom mode, three native `<input type="color">` pickers.

**Tech Stack:** TypeScript, Electron IPC (`ipcMain.handle`/`ipcRenderer.invoke` for request/response; `ipcMain.on`/`ipcRenderer.send` for fire-and-forget), React/TSX, CSS custom properties.

## Global Constraints

- Code identifiers in English; user-facing text (preset names, labels) in Portuguese — per `CLAUDE.md`.
- Customizable properties are exactly 3: page background, text color, card background. The accent blue (`#4f9eff`) and secondary gray text (`#999`, `#555`, etc.) stay fixed — never theme-controlled.
- All theme colors use solid 6-digit hex (`#rrggbb`) — never `rgba(...)` — because `<input type="color">` cannot represent alpha and would silently reset such a field to black.
- Theme persists via a JSON file through the main process (`theme.json` in `app.getPath('userData')`), not localStorage — matches the existing `popupGeometry.ts` convention.
- Theme changes apply live — no separate "Salvar" button; picking a preset or moving a color input applies and persists immediately.
- 7 fixed presets + "Personalizado" (custom), exact colors given in Task 2 below.
- No new runtime dependencies.

---

### Task 1: Main-process persistence, IPC, and shared types

**Files:**
- Modify: `app/src/shared/types.ts` (add `ThemeColors`/`SavedTheme`)
- Create: `app/src/main/themeSettings.ts`
- Modify: `app/src/main/index.ts` (add IPC handlers)
- Modify: `app/src/preload/index.ts` (expose `getTheme`/`setTheme`)
- Modify: `app/src/renderer/src/prismly.d.ts` (type the new `window.prismly` methods)

**Interfaces:**
- Produces (used by Tasks 2 and 3):
  - `interface ThemeColors { bg: string; text: string; cardBg: string }`
  - `interface SavedTheme { preset: string; colors: ThemeColors }`
  - `loadTheme(): SavedTheme` and `saveTheme(theme: SavedTheme): void`, exported from `app/src/main/themeSettings.ts`
  - `window.prismly.getTheme(): Promise<SavedTheme>` and `window.prismly.setTheme(theme: SavedTheme): void`, available in the renderer

- [ ] **Step 1: Add `ThemeColors`/`SavedTheme` to shared types**

`app/src/shared/types.ts` currently reads:

```ts
import type { AggregatedUsage, SessionBlock } from '../../../core/types';

export type { UsageBucket, AggregatedUsage, SessionBlock } from '../../../core/types';

export interface UsagePayload {
  aggregated: AggregatedUsage;
  blocks: SessionBlock[];
}
```

Add two new interfaces at the end:

```ts
import type { AggregatedUsage, SessionBlock } from '../../../core/types';

export type { UsageBucket, AggregatedUsage, SessionBlock } from '../../../core/types';

export interface UsagePayload {
  aggregated: AggregatedUsage;
  blocks: SessionBlock[];
}

export interface ThemeColors {
  bg: string;
  text: string;
  cardBg: string;
}

export interface SavedTheme {
  preset: string;
  colors: ThemeColors;
}
```

These live here (not in `core/`) because they're a pure Electron-app UI preference, unrelated to the usage/cost data layer.

- [ ] **Step 2: Create `app/src/main/themeSettings.ts`**

```ts
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
```

This mirrors `app/src/main/popupGeometry.ts`'s exact shape (file path under `userData`, validated JSON parse with a safe fallback) — no dedicated test file, consistent with `popupGeometry.ts` also having none (it's file I/O with side effects, not pure logic like `trayPositioning.ts`).

- [ ] **Step 3: Wire IPC handlers in `app/src/main/index.ts`**

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
import type { UsagePayload } from '../shared/types';
```

Add the theme import:

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
import type { SavedTheme, UsagePayload } from '../shared/types';
```

The `app.whenReady().then(() => { ... })` block currently ends with:

```ts
  ipcMain.on('popup:hide', () => {
    popupWindow?.hide();
  });

  ipcMain.on('usage:refresh', () => {
    sendUpdate();
  });
});
```

Add two more handlers right after `usage:refresh`:

```ts
  ipcMain.on('popup:hide', () => {
    popupWindow?.hide();
  });

  ipcMain.on('usage:refresh', () => {
    sendUpdate();
  });

  ipcMain.handle('theme:get', () => loadTheme());

  ipcMain.on('theme:set', (_event, theme: SavedTheme) => {
    saveTheme(theme);
  });
});
```

- [ ] **Step 4: Expose `getTheme`/`setTheme` in the preload script**

`app/src/preload/index.ts` currently reads:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { UsagePayload } from '../shared/types';

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
});
```

Replace it with:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { SavedTheme, UsagePayload } from '../shared/types';

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
});
```

- [ ] **Step 5: Update the `window.prismly` type declaration**

`app/src/renderer/src/prismly.d.ts` currently reads:

```ts
import type { UsagePayload } from '../../shared/types';

declare global {
  interface Window {
    prismly: {
      onUsageUpdate(callback: (payload: UsagePayload) => void): () => void;
      hidePopup(): void;
      refresh(): void;
    };
  }
}

export {};
```

Replace it with:

```ts
import type { SavedTheme, UsagePayload } from '../../shared/types';

declare global {
  interface Window {
    prismly: {
      onUsageUpdate(callback: (payload: UsagePayload) => void): () => void;
      hidePopup(): void;
      refresh(): void;
      getTheme(): Promise<SavedTheme>;
      setTheme(theme: SavedTheme): void;
    };
  }
}

export {};
```

- [ ] **Step 6: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 7: Commit**

```bash
git add app/src/shared/types.ts app/src/main/themeSettings.ts app/src/main/index.ts app/src/preload/index.ts app/src/renderer/src/prismly.d.ts
git commit -m "feat: add theme persistence and IPC plumbing"
```

---

### Task 2: Theme presets, CSS variables, and scaffold cleanup

**Files:**
- Create: `app/src/renderer/src/themes.ts`
- Modify: `app/src/renderer/src/assets/base.css`
- Modify: `app/src/renderer/src/assets/main.css`
- Modify: `app/src/renderer/src/tabs/Historico.tsx:38` (card background — NOT the `#242424` on line 72, which is the Dia/Semana/Mensal pill toggle's inactive background, out of scope for this task)

**Interfaces:**
- Consumes: `ThemeColors` from `app/src/shared/types.ts` (Task 1).
- Produces (used by Task 3): `THEME_PRESETS: ThemePreset[]` and `applyTheme(colors: ThemeColors): void`, exported from `app/src/renderer/src/themes.ts`, where `interface ThemePreset { name: string; label: string; colors: ThemeColors }`.

- [ ] **Step 1: Create `app/src/renderer/src/themes.ts`**

```ts
import type { ThemeColors } from '../../shared/types';

export interface ThemePreset {
  name: string;
  label: string;
  colors: ThemeColors;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'escuro',
    label: 'Escuro',
    colors: { bg: '#1b1b1f', text: '#dfdfd7', cardBg: '#242424' },
  },
  {
    name: 'escuro-azulado',
    label: 'Escuro Azulado',
    colors: { bg: '#10131c', text: '#dce6f5', cardBg: '#1c2536' },
  },
  {
    name: 'escuro-verde',
    label: 'Escuro Verde',
    colors: { bg: '#0d1410', text: '#b9f6ca', cardBg: '#16241a' },
  },
  {
    name: 'meia-noite',
    label: 'Meia-noite',
    colors: { bg: '#14102a', text: '#e4defa', cardBg: '#221c3d' },
  },
  {
    name: 'claro',
    label: 'Claro',
    colors: { bg: '#f5f5f5', text: '#1b1b1f', cardBg: '#ffffff' },
  },
  {
    name: 'claro-quente',
    label: 'Claro Quente',
    colors: { bg: '#fdf6e3', text: '#3a3226', cardBg: '#fffaf0' },
  },
  {
    name: 'alto-contraste',
    label: 'Alto Contraste',
    colors: { bg: '#000000', text: '#ffffff', cardBg: '#1a1a1a' },
  },
];

export function applyTheme(colors: ThemeColors): void {
  document.documentElement.style.setProperty('--theme-bg', colors.bg);
  document.documentElement.style.setProperty('--theme-text', colors.text);
  document.documentElement.style.setProperty('--theme-card-bg', colors.cardBg);
}
```

`'personalizado'` (custom) is deliberately not in this list — it has no fixed colors, and Task 3's UI handles it separately.

- [ ] **Step 2: Add theme CSS variables to `base.css`**

`app/src/renderer/src/assets/base.css` currently has this second `:root` block:

```css
:root {
  --color-background: var(--ev-c-black);
  --color-background-soft: var(--ev-c-black-soft);
  --color-background-mute: var(--ev-c-black-mute);

  --color-text: var(--ev-c-text-1);
}
```

Replace it with:

```css
:root {
  --theme-bg: #1b1b1f;
  --theme-text: #dfdfd7;
  --theme-card-bg: #242424;

  --color-background: var(--theme-bg);
  --color-background-soft: var(--ev-c-black-soft);
  --color-background-mute: var(--ev-c-black-mute);

  --color-text: var(--theme-text);
}
```

The defaults here match the "Escuro" preset, so the app looks correct even for the instant before `applyTheme()` runs on mount. `body`'s existing `background: var(--color-background); color: var(--color-text);` (further down in the same file, unchanged) now transitively follows whatever `--theme-bg`/`--theme-text` are set to — `applyTheme()` sets those two properties directly on `<html>` (`document.documentElement.style`), which as an inline style overrides the `:root` stylesheet default.

- [ ] **Step 3: Remove the scaffold background image and dead CSS from `main.css`**

`app/src/renderer/src/assets/main.css` currently reads in full:

```css
@import './base.css';

body {
  overflow: hidden;
  background-image: url('./wavy-lines.svg');
  background-size: cover;
  user-select: none;
  height: 100vh;
  margin: 0;
}

code {
  font-weight: 600;
  padding: 3px 5px;
  border-radius: 2px;
  background-color: var(--color-background-mute);
  font-family:
    ui-monospace,
    SFMono-Regular,
    SF Mono,
    Menlo,
    Consolas,
    Liberation Mono,
    monospace;
  font-size: 85%;
}

#root {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.logo {
  margin-bottom: 20px;
  -webkit-user-drag: none;
  height: 128px;
  width: 128px;
  will-change: filter;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 1.2em #6988e6aa);
}

.creator {
  font-size: 14px;
  line-height: 16px;
  color: var(--ev-c-text-2);
  font-weight: 600;
  margin-bottom: 10px;
}

.text {
  font-size: 28px;
  color: var(--ev-c-text-1);
  font-weight: 700;
  line-height: 32px;
  text-align: center;
  margin: 0 10px;
  padding: 16px 0;
}

.tip {
  font-size: 16px;
  line-height: 24px;
  color: var(--ev-c-text-2);
  font-weight: 600;
}

.react {
  background: -webkit-linear-gradient(315deg, #087ea4 55%, #7c93ee);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: 700;
}

.ts {
  background: -webkit-linear-gradient(315deg, #3178c6 45%, #f0dc4e);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: 700;
}

.actions {
  display: flex;
  padding-top: 32px;
  margin: -6px;
  flex-wrap: wrap;
  justify-content: flex-start;
}

.action {
  flex-shrink: 0;
  padding: 6px;
}

.action a {
  cursor: pointer;
  text-decoration: none;
  display: inline-block;
  border: 1px solid transparent;
  text-align: center;
  font-weight: 600;
  white-space: nowrap;
  border-radius: 20px;
  padding: 0 20px;
  line-height: 38px;
  font-size: 14px;
  border-color: var(--ev-button-alt-border);
  color: var(--ev-button-alt-text);
  background-color: var(--ev-button-alt-bg);
}

.action a:hover {
  border-color: var(--ev-button-alt-hover-border);
  color: var(--ev-button-alt-hover-text);
  background-color: var(--ev-button-alt-hover-bg);
}

.versions {
  position: absolute;
  bottom: 30px;
  margin: 0 auto;
  padding: 15px 0;
  font-family: 'Menlo', 'Lucida Console', monospace;
  display: inline-flex;
  overflow: hidden;
  align-items: center;
  border-radius: 22px;
  background-color: #202127;
  backdrop-filter: blur(24px);
}

.versions li {
  display: block;
  float: left;
  border-right: 1px solid var(--ev-c-gray-1);
  padding: 0 20px;
  font-size: 14px;
  line-height: 14px;
  opacity: 0.8;
  &:last-child {
    border: none;
  }
}

@media (max-width: 720px) {
  .text {
    font-size: 20px;
  }
}

@media (max-width: 620px) {
  .versions {
    display: none;
  }
}

@media (max-width: 350px) {
  .tip,
  .actions {
    display: none;
  }
}
```

Replace the full file with:

```css
@import './base.css';

body {
  overflow: hidden;
  user-select: none;
  height: 100vh;
  margin: 0;
}

code {
  font-weight: 600;
  padding: 3px 5px;
  border-radius: 2px;
  background-color: var(--color-background-mute);
  font-family:
    ui-monospace,
    SFMono-Regular,
    SF Mono,
    Menlo,
    Consolas,
    Liberation Mono,
    monospace;
  font-size: 85%;
}

#root {
  height: 100%;
  display: flex;
  flex-direction: column;
}
```

This removes the `wavy-lines.svg` background image and every scaffold class not referenced by any current component (`.logo`, `.creator`, `.text`, `.tip`, `.react`, `.ts`, `.actions`, `.action`, `.action a`, `.action a:hover`, `.versions`, `.versions li`) along with their now-orphaned media queries. `code`/`#root` are kept as-is (still structurally relevant, unrelated to this cleanup).

- [ ] **Step 4: Point the Histórico card background at the theme variable**

`app/src/renderer/src/tabs/Historico.tsx` line 38, inside `CardList`, currently reads:

```tsx
          <div key={key} style={{ background: '#242424', borderRadius: 8, padding: '10px 12px' }}>
```

Change it to:

```tsx
          <div key={key} style={{ background: 'var(--theme-card-bg)', borderRadius: 8, padding: '10px 12px' }}>
```

Do **not** touch the other `#242424` occurrence in this file (inside `pillStyle`, around line 72 — the inactive-state background for the Dia/Semana/Mensal toggle buttons). That's a different UI element, not part of this feature's 3 customizable properties (page background, text, card background) — it stays fixed.

- [ ] **Step 5: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 6: Commit**

```bash
git add app/src/renderer/src/themes.ts app/src/renderer/src/assets/base.css app/src/renderer/src/assets/main.css app/src/renderer/src/tabs/Historico.tsx
git commit -m "feat: add theme presets, CSS variables, remove scaffold background/dead CSS"
```

---

### Task 3: Configuração tab and App wiring

**Files:**
- Create: `app/src/renderer/src/tabs/Configuracao.tsx`
- Modify: `app/src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `SavedTheme`/`ThemeColors` (Task 1, from `app/src/shared/types.ts`), `THEME_PRESETS`/`applyTheme` (Task 2, from `app/src/renderer/src/themes.ts`), `window.prismly.getTheme`/`window.prismly.setTheme` (Task 1).
- Produces: nothing consumed by other tasks — this is the last task in the plan.

- [ ] **Step 1: Create `Configuracao.tsx`**

```tsx
import type { CSSProperties, JSX } from 'react';
import type { SavedTheme, ThemeColors } from '../../../shared/types';
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

export function Configuracao({
  currentTheme,
  onThemeChange,
}: {
  currentTheme: SavedTheme;
  onThemeChange: (theme: SavedTheme) => void;
}): JSX.Element {
  const isCustom = currentTheme.preset === 'personalizado';

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
    </div>
  );
}
```

- [ ] **Step 2: Wire theme loading and the Configuração tab into `App.tsx`**

`App.tsx` currently reads:

```tsx
import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { UsageBucket, UsagePayload } from '../../shared/types';
import { Historico } from './tabs/Historico';
import { AoVivo } from './tabs/AoVivo';
```

Change the imports to:

```tsx
import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { SavedTheme, UsageBucket, UsagePayload } from '../../shared/types';
import { Historico } from './tabs/Historico';
import { AoVivo } from './tabs/AoVivo';
import { Configuracao } from './tabs/Configuracao';
import { applyTheme } from './themes';
```

Inside the `App` function, the state declarations currently read:

```tsx
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [view, setView] = useState<View>('ao-vivo');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    return window.prismly.onUsageUpdate((newPayload) => {
      setPayload(newPayload);
      setLastUpdated(new Date());
      setRefreshing(false);
    });
  }, []);

  const handleRefresh = (): void => {
    setRefreshing(true);
    window.prismly.refresh();
  };
```

Add theme state and a load-on-mount effect, plus the change handler:

```tsx
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [view, setView] = useState<View>('ao-vivo');
  const [refreshing, setRefreshing] = useState(false);
  const [theme, setThemeState] = useState<SavedTheme | null>(null);

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

  const handleRefresh = (): void => {
    setRefreshing(true);
    window.prismly.refresh();
  };

  const handleThemeChange = (newTheme: SavedTheme): void => {
    applyTheme(newTheme.colors);
    window.prismly.setTheme(newTheme);
    setThemeState(newTheme);
  };
```

The nav currently has a disabled "Configuração" button:

```tsx
        <button disabled style={navButtonStyle(false, true)}>
          Configuração
        </button>
```

Enable it, matching the pattern of the other two buttons:

```tsx
        <button
          onClick={() => setView('configuracao')}
          disabled={view === 'configuracao'}
          style={navButtonStyle(view === 'configuracao', false)}
        >
          Configuração
        </button>
```

The view-rendering block currently reads:

```tsx
        {view === 'ao-vivo' && (
          <AoVivo
            blocks={payload.blocks}
            today={today}
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        )}
        {view === 'historico' && <Historico aggregated={payload.aggregated} />}
```

Add the Configuração branch, guarding on `theme` being loaded (it's `null` until the `getTheme()` promise resolves):

```tsx
        {view === 'ao-vivo' && (
          <AoVivo
            blocks={payload.blocks}
            today={today}
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        )}
        {view === 'historico' && <Historico aggregated={payload.aggregated} />}
        {view === 'configuracao' && theme && (
          <Configuracao currentTheme={theme} onThemeChange={handleThemeChange} />
        )}
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 4: Commit**

```bash
git add app/src/renderer/src/tabs/Configuracao.tsx app/src/renderer/src/App.tsx
git commit -m "feat: add Configuração tab with theme picker"
```

---

## Manual verification

After all three tasks: run `npm run dev` from `app/`, open the Configuração tab, and confirm:
1. Clicking each of the 7 presets changes the background, text, and card colors immediately, visible across Ao vivo, Histórico, and Configuração itself.
2. Clicking "Personalizado" reveals 3 color pickers pre-filled with the current theme's colors; moving any of them updates the colors live.
3. Close and reopen the app (or use "Redefinir janela" from the tray menu) and confirm the previously chosen theme is still applied.
4. Confirm the blue accent color (active nav underline, cost highlight in Histórico) never changes regardless of theme.
