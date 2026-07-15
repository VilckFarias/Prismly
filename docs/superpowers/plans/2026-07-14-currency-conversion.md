# USD/BRL Currency Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick Dólar or Real in the Configuração tab, converting every cost display in the app using an automatically-fetched USD→BRL exchange rate.

**Architecture:** The main process fetches the exchange rate from AwesomeAPI on startup (using Node's built-in `fetch`, no new dependency) and persists it — plus the user's chosen currency — to a JSON file (`currency.json`), mirroring the existing `themeSettings.ts`/`popupGeometry.ts` pattern. Two IPC channels expose this to the renderer. `formatCost`, today duplicated in `AoVivo.tsx` and `Historico.tsx`, moves into one shared module that converts and formats based on the current currency selection. `core/` is untouched — cost is still always computed in USD; conversion is a display-only concern in the Electron app.

**Tech Stack:** TypeScript, Electron IPC (`ipcMain.handle`/`ipcRenderer.invoke` for request/response, `ipcMain.on`/`ipcRenderer.send` for fire-and-forget), Node's built-in `fetch`, React/TSX.

## Global Constraints

- Code identifiers in English; user-facing text ("Dólar (US$)", "Real (R$)", the fallback warning) in Portuguese — per `CLAUDE.md`.
- Exchange rate source: `https://economia.awesomeapi.com.br/json/last/USD-BRL`, using the `bid` field from the `USDBRL` object in the response as the conversion rate.
- Fetch happens automatically on `app.whenReady()`. Fetch if `rate` is `null` OR the last successful fetch is more than 24h old; otherwise skip. Never blocks app startup (fire-and-forget, not awaited before other startup steps) and never throws — any fetch/parse error is caught and the previously-saved settings are kept as-is.
- Default currency: `'usd'`.
- Currency changes apply live — no separate "Salvar" button, matching the theme feature's existing convention.
- Fallback when `selected === 'brl'` but `rate === null`: show USD everywhere, silently — no repeated warning on every cost display. Show exactly one warning message, in the Configuração tab only, near the currency buttons.
- Persistence via a JSON file through the main process (`currency.json` in `app.getPath('userData')`), matching the existing `themeSettings.ts`/`popupGeometry.ts` convention — not localStorage.
- `core/` (the usage/cost data layer) is not modified by this plan — conversion is purely a renderer-side display concern.
- No new runtime dependencies — `fetch` is already globally available and typed via `@types/node`'s `web-globals/fetch.d.ts` (confirmed: no tsconfig changes needed).
- Each task must leave the codebase typechecking cleanly — no task may depend on a later task to fix a build break it introduced.

---

### Task 1: Currency persistence, exchange-rate fetch, and IPC

**Files:**
- Modify: `app/src/shared/types.ts` (add `CurrencySettings`)
- Create: `app/src/main/currencySettings.ts`
- Modify: `app/src/main/index.ts` (call the refresh on startup, add IPC handlers)
- Modify: `app/src/preload/index.ts` (expose `getCurrency`/`setCurrency`)
- Modify: `app/src/renderer/src/prismly.d.ts` (type the two new `window.prismly` methods)

**Interfaces:**
- Produces (used by Task 2):
  - `interface CurrencySettings { selected: 'usd' | 'brl'; rate: number | null; fetchedAt: string | null }`
  - `loadCurrencySettings(): CurrencySettings` and `saveCurrencySettings(settings: CurrencySettings): void`, exported from `app/src/main/currencySettings.ts`
  - `refreshExchangeRateIfNeeded(): Promise<void>`, exported from the same file (called once from `index.ts`, not consumed by the renderer)
  - `window.prismly.getCurrency(): Promise<CurrencySettings>` and `window.prismly.setCurrency(selected: CurrencySettings['selected']): void`, available in the renderer

- [ ] **Step 1: Add `CurrencySettings` to shared types**

`app/src/shared/types.ts` currently reads:

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

Add a new interface at the end:

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

export interface CurrencySettings {
  selected: 'usd' | 'brl';
  rate: number | null;
  fetchedAt: string | null;
}
```

- [ ] **Step 2: Create `app/src/main/currencySettings.ts`**

```ts
import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CurrencySettings } from '../shared/types';

const DEFAULT_CURRENCY: CurrencySettings = {
  selected: 'usd',
  rate: null,
  fetchedAt: null,
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function getCurrencyFilePath(): string {
  return join(app.getPath('userData'), 'currency.json');
}

export function saveCurrencySettings(settings: CurrencySettings): void {
  writeFileSync(getCurrencyFilePath(), JSON.stringify(settings));
}

export function loadCurrencySettings(): CurrencySettings {
  const filePath = getCurrencyFilePath();
  if (!existsSync(filePath)) return DEFAULT_CURRENCY;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as CurrencySettings;
    if (
      (parsed.selected !== 'usd' && parsed.selected !== 'brl') ||
      (typeof parsed.rate !== 'number' && parsed.rate !== null) ||
      (typeof parsed.fetchedAt !== 'string' && parsed.fetchedAt !== null)
    ) {
      return DEFAULT_CURRENCY;
    }
    return parsed;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

export async function refreshExchangeRateIfNeeded(): Promise<void> {
  const current = loadCurrencySettings();
  const shouldFetch =
    current.rate === null ||
    current.fetchedAt === null ||
    Date.now() - new Date(current.fetchedAt).getTime() > ONE_DAY_MS;
  if (!shouldFetch) return;

  try {
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    const data = (await response.json()) as { USDBRL: { bid: string } };
    const rate = Number(data.USDBRL.bid);
    if (!Number.isFinite(rate)) return;
    saveCurrencySettings({ ...current, rate, fetchedAt: new Date().toISOString() });
  } catch {
    // Sem internet ou API fora do ar -- mantém o que já tinha salvo, nunca trava o app.
  }
}
```

This mirrors `themeSettings.ts`'s validated-JSON-with-fallback shape, plus the fetch logic described in the spec. No dedicated test file, matching the same precedent as `themeSettings.ts`/`popupGeometry.ts` (file I/O + network side effects, not pure logic).

- [ ] **Step 3: Call the refresh and wire IPC handlers in `app/src/main/index.ts`**

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
import type { SavedTheme, UsagePayload } from '../shared/types';
```

Add the currency import:

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

The `app.whenReady().then(() => { ... })` block currently ends with:

```ts
  ipcMain.handle('theme:get', () => loadTheme());

  ipcMain.on('theme:set', (_event, theme: SavedTheme) => {
    saveTheme(theme);
  });
});
```

Add the currency refresh call and two more handlers right after:

```ts
  ipcMain.handle('theme:get', () => loadTheme());

  ipcMain.on('theme:set', (_event, theme: SavedTheme) => {
    saveTheme(theme);
  });

  void refreshExchangeRateIfNeeded();

  ipcMain.handle('currency:get', () => loadCurrencySettings());

  ipcMain.on('currency:set', (_event, selected: CurrencySettings['selected']) => {
    const current = loadCurrencySettings();
    saveCurrencySettings({ ...current, selected });
  });
});
```

`void refreshExchangeRateIfNeeded();` fires without awaiting — startup (window creation, tray setup) proceeds immediately regardless of network latency, per the "never blocks the app" constraint.

- [ ] **Step 4: Expose `getCurrency`/`setCurrency` in the preload script**

`app/src/preload/index.ts` currently reads:

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

Replace it with:

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

- [ ] **Step 5: Update the `window.prismly` type declaration**

`app/src/renderer/src/prismly.d.ts` currently reads:

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

Replace it with:

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

- [ ] **Step 6: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 7: Commit**

```bash
git add app/src/shared/types.ts app/src/main/currencySettings.ts app/src/main/index.ts app/src/preload/index.ts app/src/renderer/src/prismly.d.ts
git commit -m "feat: add currency persistence, exchange-rate fetch, and IPC"
```

---

### Task 2: Currency picker end-to-end in the renderer

This task covers the entire renderer side in one pass — centralizing `formatCost`, wiring the new required `currency` prop through every consumer, adding the picker UI, and wiring `App.tsx` — so the codebase typechecks cleanly at every commit. Splitting this into smaller tasks isn't practical here: `AoVivo`/`Historico`/`CardList` all need `currency` as a *required* prop, and nothing can render them with it until `App.tsx` supplies it, so partial completion would leave a broken build.

**Files:**
- Create: `app/src/renderer/src/currency.ts`
- Modify: `app/src/renderer/src/tabs/AoVivo.tsx`
- Modify: `app/src/renderer/src/tabs/Historico.tsx`
- Modify: `app/src/renderer/src/tabs/Configuracao.tsx`
- Modify: `app/src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `CurrencySettings` and `window.prismly.getCurrency`/`setCurrency` (Task 1).
- Produces: nothing consumed by other tasks — this is the last task in the plan. `formatCost(usdAmount: number, currency: CurrencySettings): string` is exported from `app/src/renderer/src/currency.ts` for reference, but nothing outside this task calls it.

- [ ] **Step 1: Create `app/src/renderer/src/currency.ts`**

```ts
import type { CurrencySettings } from '../../shared/types';

export function formatCost(usdAmount: number, currency: CurrencySettings): string {
  if (currency.selected === 'brl' && currency.rate !== null) {
    return `R$ ${(usdAmount * currency.rate).toFixed(2)}`;
  }
  return `US$ ${usdAmount.toFixed(2)}`;
}
```

- [ ] **Step 2: Wire `AoVivo.tsx`**

`app/src/renderer/src/tabs/AoVivo.tsx` currently reads:

```tsx
import type { JSX } from 'react';
import type { SessionBlock, UsageBucket } from '../../../shared/types';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function formatTime(date: Date): string {
```

Replace the top of the file (imports through `formatCost`) with:

```tsx
import type { JSX } from 'react';
import type { CurrencySettings, SessionBlock, UsageBucket } from '../../../shared/types';
import { formatCost } from '../currency';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatTime(date: Date): string {
```

The `AoVivoProps` interface currently reads:

```ts
interface AoVivoProps {
  blocks: SessionBlock[];
  today: UsageBucket | undefined;
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}
```

Add `currency`:

```ts
interface AoVivoProps {
  blocks: SessionBlock[];
  today: UsageBucket | undefined;
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
  currency: CurrencySettings;
}
```

The component signature and its two `formatCost(...)` call sites currently read:

```tsx
export function AoVivo({ blocks, today, lastUpdated, refreshing, onRefresh }: AoVivoProps): JSX.Element {
```

...

```tsx
            {formatCost(activeBlock.cost)} · {formatNumber(activeBlock.inputTokens + activeBlock.outputTokens)} tokens
```

...

```tsx
          Hoje: {formatCost(today.cost)} · {today.count} registros
```

Change the destructuring and both call sites:

```tsx
export function AoVivo({ blocks, today, lastUpdated, refreshing, onRefresh, currency }: AoVivoProps): JSX.Element {
```

...

```tsx
            {formatCost(activeBlock.cost, currency)} · {formatNumber(activeBlock.inputTokens + activeBlock.outputTokens)} tokens
```

...

```tsx
          Hoje: {formatCost(today.cost, currency)} · {today.count} registros
```

- [ ] **Step 3: Wire `Historico.tsx`**

`app/src/renderer/src/tabs/Historico.tsx` currently starts:

```tsx
import { useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { AggregatedUsage, UsageBucket } from '../../../shared/types';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function formatWeekLabel(mondayKey: string): string {
```

Replace the top of the file (imports through `formatCost`) with:

```tsx
import { useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { AggregatedUsage, CurrencySettings, UsageBucket } from '../../../shared/types';
import { formatCost } from '../currency';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatWeekLabel(mondayKey: string): string {
```

`CardList` currently reads:

```tsx
function CardList({ title, rows }: { title: string; rows: [string, UsageBucket][] }): JSX.Element {
  return (
    <section>
      <h2>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(([key, bucket]) => (
          <div key={key} style={{ background: 'var(--theme-card-bg)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{key}</strong>
              <span style={{ color: '#4f9eff', fontWeight: 'bold' }}>{formatCost(bucket.cost)}</span>
            </div>
```

`CardList` is a module-level component separate from `Historico` — it needs `currency` as its own prop too, not inherited automatically. Replace with:

```tsx
function CardList({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: [string, UsageBucket][];
  currency: CurrencySettings;
}): JSX.Element {
  return (
    <section>
      <h2>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(([key, bucket]) => (
          <div key={key} style={{ background: 'var(--theme-card-bg)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{key}</strong>
              <span style={{ color: '#4f9eff', fontWeight: 'bold' }}>{formatCost(bucket.cost, currency)}</span>
            </div>
```

The `Historico` component signature and its render block currently read:

```tsx
export function Historico({ aggregated }: { aggregated: AggregatedUsage }): JSX.Element {
```

...

```tsx
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {granularity === 'dia' && <CardList title="Por dia" rows={byDayRows} />}
        {granularity === 'semana' && <CardList title="Por semana" rows={byWeekRows} />}
        {granularity === 'mensal' && <CardList title="Por mês" rows={byMonthRows} />}
        <CardList title="Por modelo" rows={byModelRows} />
        <CardList title="Por projeto" rows={byProjectRows} />
      </div>
```

Change both:

```tsx
export function Historico({
  aggregated,
  currency,
}: {
  aggregated: AggregatedUsage;
  currency: CurrencySettings;
}): JSX.Element {
```

...

```tsx
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {granularity === 'dia' && <CardList title="Por dia" rows={byDayRows} currency={currency} />}
        {granularity === 'semana' && <CardList title="Por semana" rows={byWeekRows} currency={currency} />}
        {granularity === 'mensal' && <CardList title="Por mês" rows={byMonthRows} currency={currency} />}
        <CardList title="Por modelo" rows={byModelRows} currency={currency} />
        <CardList title="Por projeto" rows={byProjectRows} currency={currency} />
      </div>
```

- [ ] **Step 4: Add a "Moeda" section to `Configuracao.tsx`**

`app/src/renderer/src/tabs/Configuracao.tsx` currently reads in full:

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

Replace the full file with:

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

- [ ] **Step 5: Wire currency loading and props into `App.tsx`**

`App.tsx` currently reads:

```tsx
import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { SavedTheme, UsageBucket, UsagePayload } from '../../shared/types';
import { Historico } from './tabs/Historico';
import { AoVivo } from './tabs/AoVivo';
import { Configuracao } from './tabs/Configuracao';
import { applyTheme } from './themes';
```

Change the imports to:

```tsx
import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { CurrencySettings, SavedTheme, UsageBucket, UsagePayload } from '../../shared/types';
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

Add currency state, a load-on-mount effect, and a change handler:

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

`handleCurrencyChange` updates only the `selected` field locally (mirroring what the main process does), rather than re-fetching `getCurrency()` — the `rate`/`fetchedAt` fields don't change when the user just switches which currency to view.

The render block currently reads:

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

Guard every branch on `currency` also being loaded, and pass it down:

```tsx
        {view === 'ao-vivo' && currency && (
          <AoVivo
            blocks={payload.blocks}
            today={today}
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            currency={currency}
          />
        )}
        {view === 'historico' && currency && (
          <Historico aggregated={payload.aggregated} currency={currency} />
        )}
        {view === 'configuracao' && theme && currency && (
          <Configuracao
            currentTheme={theme}
            onThemeChange={handleThemeChange}
            currency={currency}
            onCurrencyChange={handleCurrencyChange}
          />
        )}
```

- [ ] **Step 6: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 7: Commit**

```bash
git add app/src/renderer/src/currency.ts app/src/renderer/src/tabs/AoVivo.tsx app/src/renderer/src/tabs/Historico.tsx app/src/renderer/src/tabs/Configuracao.tsx app/src/renderer/src/App.tsx
git commit -m "feat: add currency picker, thread conversion through the renderer"
```

---

## Manual verification

After both tasks: run `npm run dev` from `app/`, open Configuração, and confirm:
1. A "Moeda" section appears below "Tema" with "Dólar (US$)" and "Real (R$)" buttons, defaulting to Dólar selected.
2. Clicking "Real" converts every cost display (Ao vivo's session/today cost, every card in Histórico) to `R$`, using the fetched rate — spot-check the math against the actual current USD/BRL rate.
3. Clicking back to "Dólar" reverts every display to `US$`.
4. Close and reopen the app and confirm the chosen currency persists.
5. If reachable, simulate no cached rate (delete `currency.json` from `app.getPath('userData')` while offline) and confirm selecting "Real" shows the fallback warning in Configuração and displays `US$` everywhere else, without erroring.
