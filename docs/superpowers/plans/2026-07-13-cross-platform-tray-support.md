# Cross-platform (Windows + Linux) Tray Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Prismly tray app resilient to Linux's unreliable tray-icon bounds, document the GNOME extension requirement, and trim Linux packaging to the one target (AppImage) buildable with confidence from Windows.

**Architecture:** Extract the popup-positioning math out of `app/src/main/tray.ts` into a new dependency-free module (`app/src/main/trayPositioning.ts`) so it's unit-testable with Node's built-in test runner without mocking Electron. `tray.ts` calls into it, feeding it the real `Tray`/`screen` data. Separately, add a Linux-only startup warning about the GNOME AppIndicator extension, document it in the README, and trim `electron-builder.yml`'s `linux.target` list to just `AppImage`.

**Tech Stack:** TypeScript (Node native type-stripping, no build step for logic files), Electron 39, Node's built-in `node:test` + `node:assert/strict` (same pattern already used in `core/*.test.ts`).

## Global Constraints

- Code identifiers in English; user-facing text (README section, console warning shown to the user) in Portuguese — per `CLAUDE.md`.
- `core/` stays untouched — this work is entirely inside `app/`.
- No new runtime dependencies. Tests use Node's built-in `node:test`, matching `core/`'s existing convention — do not introduce Jest/Vitest/etc.
- Fallback popup position is the bottom-right corner of the primary display's work area, with a 12px margin from the edge — not the screen center.
- Bounds are considered invalid when `width <= 0 || height <= 0` (this also naturally rejects `NaN`, since any comparison against `NaN` is `false` — no separate `NaN` check needed).
- Linux packaging targets only `AppImage` (`snap` and `deb` are out of scope — not reliably buildable from Windows).

---

### Task 1: Extract testable positioning math + fix bounds-invalid fallback

**Files:**
- Create: `app/src/main/trayPositioning.ts`
- Create: `app/src/main/trayPositioning.test.ts`
- Modify: `app/src/main/tray.ts:1-21` (imports + `anchorAboveTray`)
- Modify: `app/package.json:7-21` (add a `test` script)

**Interfaces:**
- Produces (used by Task-1's own `tray.ts` changes, no other task depends on this):
  - `interface Rect { x: number; y: number; width: number; height: number }`
  - `isValidTrayBounds(bounds: Rect): boolean`
  - `computeAboveTrayPosition(trayBounds: Rect, popupWidth: number, popupHeight: number): { x: number; y: number }`
  - `computeFallbackPosition(workArea: Rect, popupWidth: number, popupHeight: number, margin: number): { x: number; y: number }`

- [ ] **Step 1: Write the failing tests**

Create `app/src/main/trayPositioning.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidTrayBounds,
  computeAboveTrayPosition,
  computeFallbackPosition,
} from './trayPositioning.ts';

test('isValidTrayBounds retorna true para bounds normais', () => {
  assert.equal(isValidTrayBounds({ x: 100, y: 200, width: 24, height: 24 }), true);
});

test('isValidTrayBounds retorna false quando width e height são zero', () => {
  assert.equal(isValidTrayBounds({ x: 0, y: 0, width: 0, height: 0 }), false);
});

test('isValidTrayBounds retorna false quando width é negativo', () => {
  assert.equal(isValidTrayBounds({ x: 10, y: 10, width: -1, height: 24 }), false);
});

test('isValidTrayBounds retorna false quando height é NaN', () => {
  assert.equal(isValidTrayBounds({ x: 10, y: 10, width: 24, height: NaN }), false);
});

test('computeAboveTrayPosition centraliza o popup horizontalmente acima do ícone', () => {
  const result = computeAboveTrayPosition({ x: 1000, y: 40, width: 24, height: 24 }, 380, 500);
  assert.deepEqual(result, { x: 822, y: -460 });
});

test('computeFallbackPosition ancora no canto inferior direito com margem', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const result = computeFallbackPosition(workArea, 380, 500, 12);
  assert.deepEqual(result, { x: 1528, y: 568 });
});

test('computeFallbackPosition respeita o offset de work areas que não começam em (0,0)', () => {
  const workArea = { x: 100, y: 50, width: 1920, height: 1080 };
  const result = computeFallbackPosition(workArea, 380, 500, 12);
  assert.deepEqual(result, { x: 1628, y: 618 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && node --test src/main/trayPositioning.test.ts`
Expected: FAIL — `Cannot find module './trayPositioning.ts'` (file doesn't exist yet)

- [ ] **Step 3: Implement `trayPositioning.ts`**

Create `app/src/main/trayPositioning.ts`:

```ts
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
```

This file must not import from `electron` — that's what keeps it testable under plain Node without an Electron runtime.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && node --test src/main/trayPositioning.test.ts`
Expected: PASS — 7 passing tests, 0 failing

- [ ] **Step 5: Add a `test` script to `app/package.json`**

In `app/package.json`, the `scripts` block currently reads:

```json
  "scripts": {
    "format": "prettier --write .",
    "lint": "eslint --cache .",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json --composite false",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "start": "electron-vite preview",
    "dev": "electron-vite dev",
    "build": "npm run typecheck && electron-vite build",
    "postinstall": "electron-builder install-app-deps",
    "build:unpack": "npm run build && electron-builder --dir",
    "build:win": "npm run build && electron-builder --win",
    "build:mac": "electron-vite build && electron-builder --mac",
    "build:linux": "electron-vite build && electron-builder --linux"
  },
```

Add a `"test"` entry right after `"lint"`:

```json
  "scripts": {
    "format": "prettier --write .",
    "lint": "eslint --cache .",
    "test": "node --test src/main/**/*.test.ts",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json --composite false",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "start": "electron-vite preview",
    "dev": "electron-vite dev",
    "build": "npm run typecheck && electron-vite build",
    "postinstall": "electron-builder install-app-deps",
    "build:unpack": "npm run build && electron-builder --dir",
    "build:win": "npm run build && electron-builder --win",
    "build:mac": "electron-vite build && electron-builder --mac",
    "build:linux": "electron-vite build && electron-builder --linux"
  },
```

Run: `cd app && npm test`
Expected: PASS — same 7 tests found via the glob and passing

- [ ] **Step 6: Wire `tray.ts` to use the new pure functions**

Replace the full contents of `app/src/main/tray.ts` with:

```ts
import { app, BrowserWindow, Menu, screen, Tray } from 'electron';
import { join } from 'node:path';
import { POPUP_HEIGHT, POPUP_WIDTH } from './popupWindow';
import { clearGeometry, isPositionOnScreen, loadGeometry } from './popupGeometry';
import { computeAboveTrayPosition, computeFallbackPosition, isValidTrayBounds } from './trayPositioning';

const FALLBACK_EDGE_MARGIN = 12;

function anchorAboveTray(popupWindow: BrowserWindow, tray: Tray): void {
  const trayBounds = tray.getBounds();
  const { x, y } = isValidTrayBounds(trayBounds)
    ? computeAboveTrayPosition(trayBounds, POPUP_WIDTH, POPUP_HEIGHT)
    : computeFallbackPosition(
        screen.getPrimaryDisplay().workArea,
        POPUP_WIDTH,
        POPUP_HEIGHT,
        FALLBACK_EDGE_MARGIN,
      );
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
```

- [ ] **Step 7: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 8: Commit**

```bash
git add app/src/main/trayPositioning.ts app/src/main/trayPositioning.test.ts app/src/main/tray.ts app/package.json
git commit -m "fix: fall back to screen corner when tray bounds are invalid on Linux"
```

---

### Task 2: GNOME extension warning + README documentation

**Files:**
- Modify: `app/src/main/index.ts:31-45` (add startup warning)
- Modify: `app/README.md` (replace scaffold content with real docs + Linux section)

**Interfaces:**
- Consumes: nothing from Task 1 (independent change, touches different files).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the Linux-only console warning**

In `app/src/main/index.ts`, the `app.whenReady().then(...)` block currently starts:

```ts
app.whenReady().then(() => {
  popupWindow = createPopupWindow();
  popupWindow.webContents.on('did-finish-load', sendUpdate);
  tray = createTray(popupWindow);
  void tray;
  startWatcher(sendUpdate);
```

Change it to log the GNOME warning first:

```ts
app.whenReady().then(() => {
  if (process.platform === 'linux') {
    console.warn(
      'No GNOME, o ícone da bandeja só aparece com a extensão AppIndicator/KStatusNotifierItem instalada. Veja o README.',
    );
  }

  popupWindow = createPopupWindow();
  popupWindow.webContents.on('did-finish-load', sendUpdate);
  tray = createTray(popupWindow);
  void tray;
  startWatcher(sendUpdate);
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 3: Replace `app/README.md` scaffold content**

The current file is the unmodified `electron-vite` scaffold:

`````markdown
# app

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
`````

Replace the full file with:

`````markdown
# Prismly (app)

Aplicativo Electron do Prismly — ícone na bandeja do sistema com uso e custo de assistentes de IA de código.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Testes

```bash
$ npm test
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Linux

O pacote gerado para Linux é um `.AppImage`. Para rodar:

```bash
chmod +x prismly-*.AppImage
./prismly-*.AppImage
```

**GNOME:** por padrão, o GNOME não exibe nenhum ícone de bandeja do sistema. É preciso instalar a extensão [AppIndicator and KStatusNotifierItem Support](https://extensions.gnome.org/extension/615/appindicator-support/) pelo GNOME Extensions antes de abrir o Prismly, senão o ícone não vai aparecer em lugar nenhum (o app roda normalmente, só o ícone da bandeja fica invisível). Se você rodar o AppImage a partir de um terminal, o Prismly avisa isso no console.

**KDE/XFCE:** o suporte a bandeja é nativo, não precisa de nenhuma extensão.
`````

- [ ] **Step 4: Commit**

```bash
git add app/src/main/index.ts app/README.md
git commit -m "docs: document GNOME tray extension requirement, add startup warning"
```

---

### Task 3: Trim Linux packaging to AppImage only

**Files:**
- Modify: `app/electron-builder.yml:31-39`

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: nothing consumed by later tasks. This is the final task in the plan.

- [ ] **Step 1: Edit the `linux`/`appImage` blocks**

In `app/electron-builder.yml`, this block:

```yaml
linux:
  target:
    - AppImage
    - snap
    - deb
  maintainer: electronjs.org
  category: Utility
appImage:
  artifactName: ${name}-${version}.${ext}
```

Becomes:

```yaml
linux:
  target:
    - AppImage
  maintainer: Vilck Farias
  category: Utility
appImage:
  artifactName: ${name}-${version}.${ext}
```

- [ ] **Step 2: Build the AppImage to verify the config is valid**

Run: `cd app && npm run build:linux`
Expected: PASS — build completes without error, producing `app/dist/prismly-1.0.0.AppImage`

**Update (post-implementation):** this expectation turned out to be wrong. electron-builder cannot assemble an AppImage on Windows — the final packaging step calls `fs.symlink()` unconditionally, which Windows blocks without admin/Developer Mode, and this is a documented upstream limitation (no config/env workaround exists). In practice, `electron-vite build` and the Linux packaging stage (`app/dist/linux-unpacked/`) complete successfully and confirm the YAML config is valid; only the final `.AppImage` assembly fails with `EPERM`. Producing and testing the actual `.AppImage` artifact requires Linux, WSL2, Docker, or a CI runner (e.g. GitHub Actions `ubuntu-latest`) — accepted and deferred to the "Manual verification" section below.

- [ ] **Step 3: Commit**

```bash
git add app/electron-builder.yml
git commit -m "build: restrict Linux packaging target to AppImage"
```

---

## Manual verification (deferred — needs real Linux hardware)

Not part of any task above because it can't be executed in this Windows-only environment. Whoever has access to Linux hardware should, before considering this feature fully verified:

1. Run the AppImage from Task 3 on a GNOME desktop **without** the AppIndicator extension installed — confirm the tray icon does not appear, but the terminal shows the warning from Task 2 and the app otherwise runs normally.
2. Install the AppIndicator extension, restart the AppImage — confirm the tray icon now appears and behaves like on Windows (click toggles the popup).
3. Run the AppImage on a KDE (or XFCE) desktop — confirm the tray icon appears without any extra extension.
4. On both desktops, trigger a case where `tray.getBounds()` is likely to return invalid bounds (this may already be the default on some Linux/Electron combinations) and confirm the popup appears anchored to the bottom-right corner of the screen rather than off-screen or at (0,0).
