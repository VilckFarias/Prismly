# Terminal TUI (Ink) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static-table `index.ts` report with an interactive Ink/React terminal UI that mirrors the Electron app's Ao vivo / Histórico / Baixar o app tabs, with live updates via file watching.

**Architecture:** A new `cli/` folder holds Ink components written with `React.createElement` (no JSX — keeps `npm start` running as plain `node index.ts` with zero build step). `core/watcher.ts` (moved from `app/src/main/watcher.ts`) is shared between the Electron app and the CLI. `index.ts` becomes the sole entry point and fully replaces the old table-printing code — there is no flag to fall back to it.

**Tech Stack:** Ink 5 (React renderer for terminals), React 18, existing `core/` data layer (`collectClaudeUsage`, `calculateCost`, `aggregateUsage`, `computeBlocks`).

## Global Constraints

- No JSX anywhere in `cli/` — use `React.createElement` so `node index.ts` keeps working with zero build step (per `CLAUDE.md`: "sem build step, sem ts-node").
- `ink` and `react` are runtime `dependencies` in the root `package.json`, not devDependencies — this is a deliberate, already-approved break from `core/`'s zero-runtime-dependency rule (see spec).
- User-facing text stays in Portuguese; code/identifiers stay in English (existing project convention).
- No component-level tests for Ink UI (matches existing project posture — see `app/src/main/currencySettings.test.ts` / `trayPositioning.test.ts`: only logic gets unit tests, not UI). Pure logic extracted into `cli/format.ts`, `cli/progressBar.ts`, `cli/keybindings.ts` DOES get tests.
- Spec: `docs/superpowers/specs/2026-07-17-terminal-tui-design.md`

---

### Task 1: Setup — move watcher to `core/`, add Ink/React, wire tooling

**Files:**
- Create: `core/watcher.ts` (moved from `app/src/main/watcher.ts`, unchanged content)
- Delete: `app/src/main/watcher.ts`
- Modify: `app/src/main/index.ts:6` (import path)
- Modify: `package.json` (add dependencies, update `test` script)
- Modify: `tsconfig.json` (add `cli/**/*.ts` to `include`)

**Interfaces:**
- Produces: `core/watcher.ts` exports `startWatcher(onChange: () => void): void` (identical signature to the old `app/src/main/watcher.ts`) — every later task that wires live updates imports this from `../core/watcher.ts`.

- [ ] **Step 1: Move the watcher file**

```bash
mkdir -p core
git mv app/src/main/watcher.ts core/watcher.ts
```

- [ ] **Step 2: Update the Electron main process import**

In `app/src/main/index.ts`, change line 6 from:

```ts
import { startWatcher } from './watcher';
```

to:

```ts
import { startWatcher } from '../../../core/watcher';
```

- [ ] **Step 3: Verify the Electron app still typechecks**

```bash
cd app && npm run typecheck
cd ..
```

Expected: no errors mentioning `watcher`.

- [ ] **Step 4: Add `ink` and `react` as runtime dependencies**

Edit `package.json`. Replace the `"license": "MIT",` line and everything after it with:

```json
  "license": "MIT",
  "dependencies": {
    "ink": "^5.0.1",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/react": "^18.3.0",
    "esbuild": "^0.28.1",
    "typescript": "^5.7.0"
  }
```

Also update the `"test"` script (same object, near the top) from:

```json
    "test": "node --test core/**/*.test.ts",
```

to:

```json
    "test": "node --test core/**/*.test.ts cli/**/*.test.ts",
```

- [ ] **Step 5: Install the new dependencies**

```bash
npm install
```

Expected: installs `ink`, `react`, `@types/react` with no errors.

- [ ] **Step 6: Add `cli/` to the TypeScript project**

In `tsconfig.json`, change:

```json
  "include": ["core/**/*.ts", "index.ts"]
```

to:

```json
  "include": ["core/**/*.ts", "index.ts", "cli/**/*.ts"]
```

- [ ] **Step 7: Verify typecheck still passes with no `cli/` files yet**

```bash
npm run typecheck
```

Expected: passes (no errors) — `cli/**/*.ts` matching zero files is fine as long as `core/**/*.ts` and `index.ts` still resolve.

- [ ] **Step 8: Commit**

```bash
git add core/watcher.ts app/src/main/index.ts package.json package-lock.json tsconfig.json
git commit -m "Move watcher to core/ and add Ink/React runtime dependencies"
```

---

### Task 2: `cli/format.ts` — number, cost, and duration formatting

**Files:**
- Create: `cli/format.ts`
- Test: `cli/format.test.ts`

**Interfaces:**
- Produces: `formatNumber(n: number): string`, `formatCost(n: number): string`, `formatDuration(ms: number): string` — used by `cli/tabs/AoVivo.ts` and `cli/tabs/Historico.ts` in Task 6.

- [ ] **Step 1: Write the failing tests**

Create `cli/format.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber, formatCost, formatDuration } from './format.ts';

test('formatNumber usa separador de milhar pt-BR', () => {
  assert.equal(formatNumber(1234567), (1234567).toLocaleString('pt-BR'));
});

test('formatCost formata em dólar com 2 casas', () => {
  assert.equal(formatCost(1), 'US$ 1.00');
  assert.equal(formatCost(12.345), 'US$ 12.35');
  assert.equal(formatCost(0), 'US$ 0.00');
});

test('formatDuration mostra horas e minutos quando >= 1h', () => {
  assert.equal(formatDuration(3 * 60 * 60 * 1000 + 42 * 60 * 1000), '3h 42min');
});

test('formatDuration mostra só minutos quando < 1h', () => {
  assert.equal(formatDuration(5 * 60 * 1000), '5min');
});

test('formatDuration arredonda pra baixo e nunca fica negativo', () => {
  assert.equal(formatDuration(0), '0min');
  assert.equal(formatDuration(-1000), '0min');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test cli/format.test.ts
```

Expected: FAIL — `Cannot find module './format.ts'`.

- [ ] **Step 3: Write the implementation**

Create `cli/format.ts`:

```ts
export function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

export function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  return `${hours}h ${minutes}min`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test cli/format.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/format.ts cli/format.test.ts
git commit -m "Add cli/format.ts with number, cost, and duration formatting"
```

---

### Task 3: `cli/progressBar.ts` — text progress bar

**Files:**
- Create: `cli/progressBar.ts`
- Test: `cli/progressBar.test.ts`

**Interfaces:**
- Produces: `renderProgressBar(fraction: number, width: number): string` — used by `cli/tabs/AoVivo.ts` in Task 6.

- [ ] **Step 1: Write the failing tests**

Create `cli/progressBar.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProgressBar } from './progressBar.ts';

test('fração 0 não preenche nada', () => {
  assert.equal(renderProgressBar(0, 10), '░'.repeat(10));
});

test('fração 1 preenche tudo', () => {
  assert.equal(renderProgressBar(1, 10), '█'.repeat(10));
});

test('fração 0.5 preenche metade', () => {
  assert.equal(renderProgressBar(0.5, 10), '█'.repeat(5) + '░'.repeat(5));
});

test('fração é limitada entre 0 e 1', () => {
  assert.equal(renderProgressBar(-0.5, 10), '░'.repeat(10));
  assert.equal(renderProgressBar(1.5, 10), '█'.repeat(10));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test cli/progressBar.test.ts
```

Expected: FAIL — `Cannot find module './progressBar.ts'`.

- [ ] **Step 3: Write the implementation**

Create `cli/progressBar.ts`:

```ts
export function renderProgressBar(fraction: number, width: number): string {
  const clamped = Math.min(1, Math.max(0, fraction));
  const filled = Math.round(clamped * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test cli/progressBar.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/progressBar.ts cli/progressBar.test.ts
git commit -m "Add cli/progressBar.ts for rendering text progress bars"
```

---

### Task 4: `cli/keybindings.ts` — navigation state and labels

**Files:**
- Create: `cli/keybindings.ts`
- Test: `cli/keybindings.test.ts`

**Interfaces:**
- Produces: `TabName` type, `TABS: TabName[]`, `HistoricoView` type, `HISTORICO_VIEWS: HistoricoView[]`, `NavState` interface (`{ tabIndex: number; historicoViewIndex: number }`), `nextTab(state: NavState): NavState`, `nextHistoricoView(state: NavState): NavState`, `prevHistoricoView(state: NavState): NavState`, `tabLabel(tab: TabName): string`, `historicoViewLabel(view: HistoricoView): string` — used by `cli/App.ts` and `cli/tabs/Historico.ts` in Tasks 6–7.

- [ ] **Step 1: Write the failing tests**

Create `cli/keybindings.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TABS,
  HISTORICO_VIEWS,
  nextTab,
  nextHistoricoView,
  prevHistoricoView,
  tabLabel,
  historicoViewLabel,
} from './keybindings.ts';

test('nextTab avança e dá a volta no fim', () => {
  assert.equal(nextTab({ tabIndex: 0, historicoViewIndex: 0 }).tabIndex, 1);
  assert.equal(nextTab({ tabIndex: TABS.length - 1, historicoViewIndex: 0 }).tabIndex, 0);
});

test('nextHistoricoView avança e dá a volta no fim', () => {
  assert.equal(nextHistoricoView({ tabIndex: 0, historicoViewIndex: 0 }).historicoViewIndex, 1);
  assert.equal(
    nextHistoricoView({ tabIndex: 0, historicoViewIndex: HISTORICO_VIEWS.length - 1 }).historicoViewIndex,
    0,
  );
});

test('prevHistoricoView recua e dá a volta no início', () => {
  assert.equal(prevHistoricoView({ tabIndex: 0, historicoViewIndex: 1 }).historicoViewIndex, 0);
  assert.equal(
    prevHistoricoView({ tabIndex: 0, historicoViewIndex: 0 }).historicoViewIndex,
    HISTORICO_VIEWS.length - 1,
  );
});

test('tabLabel cobre todas as abas', () => {
  assert.equal(tabLabel('aoVivo'), 'Ao vivo');
  assert.equal(tabLabel('historico'), 'Histórico');
  assert.equal(tabLabel('baixarApp'), 'Baixar o app');
});

test('historicoViewLabel cobre todas as views', () => {
  assert.equal(historicoViewLabel('dia'), 'Dia');
  assert.equal(historicoViewLabel('semana'), 'Semana');
  assert.equal(historicoViewLabel('mes'), 'Mês');
  assert.equal(historicoViewLabel('modelo'), 'Modelo');
  assert.equal(historicoViewLabel('projeto'), 'Projeto');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
node --test cli/keybindings.test.ts
```

Expected: FAIL — `Cannot find module './keybindings.ts'`.

- [ ] **Step 3: Write the implementation**

Create `cli/keybindings.ts`:

```ts
export type TabName = 'aoVivo' | 'historico' | 'baixarApp';
export const TABS: TabName[] = ['aoVivo', 'historico', 'baixarApp'];

export type HistoricoView = 'dia' | 'semana' | 'mes' | 'modelo' | 'projeto';
export const HISTORICO_VIEWS: HistoricoView[] = ['dia', 'semana', 'mes', 'modelo', 'projeto'];

export interface NavState {
  tabIndex: number;
  historicoViewIndex: number;
}

export function nextTab(state: NavState): NavState {
  return { ...state, tabIndex: (state.tabIndex + 1) % TABS.length };
}

export function nextHistoricoView(state: NavState): NavState {
  return { ...state, historicoViewIndex: (state.historicoViewIndex + 1) % HISTORICO_VIEWS.length };
}

export function prevHistoricoView(state: NavState): NavState {
  const length = HISTORICO_VIEWS.length;
  return { ...state, historicoViewIndex: (state.historicoViewIndex - 1 + length) % length };
}

export function tabLabel(tab: TabName): string {
  if (tab === 'aoVivo') return 'Ao vivo';
  if (tab === 'historico') return 'Histórico';
  return 'Baixar o app';
}

export function historicoViewLabel(view: HistoricoView): string {
  if (view === 'dia') return 'Dia';
  if (view === 'semana') return 'Semana';
  if (view === 'mes') return 'Mês';
  if (view === 'modelo') return 'Modelo';
  return 'Projeto';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
node --test cli/keybindings.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/keybindings.ts cli/keybindings.test.ts
git commit -m "Add cli/keybindings.ts for tab/view navigation state"
```

---

### Task 5: `cli/logo.ts` — embed the header logo

**Files:**
- Create: `cli/logo.ts` (generated from `docs/assets/prismly-logo.txt`, not hand-typed)

**Interfaces:**
- Produces: `LOGO: string` — used by `cli/App.ts` in Task 7.

**Why generated, not hand-typed:** the logo is 55 lines of Unicode Braille characters. Retyping it manually risks the exact UTF-8/Latin-1 mojibake corruption that happened earlier in this project's history. Generate the file with a script that reads the already-verified-correct source and JSON-escapes it — no manual transcription of the glyphs.

- [ ] **Step 1: Generate `cli/logo.ts` from the source asset**

```bash
node -e "
const fs = require('fs');
const logo = fs.readFileSync('docs/assets/prismly-logo.txt', 'utf8').replace(/\r\n/g, '\n').trimEnd();
const content = 'export const LOGO: string = ' + JSON.stringify(logo) + ';\n';
fs.writeFileSync('cli/logo.ts', content);
"
```

- [ ] **Step 2: Verify the generated file round-trips correctly**

```bash
node --input-type=module -e "
import { LOGO } from './cli/logo.ts';
console.log('lines:', LOGO.split('\n').length);
console.log('first line length:', LOGO.split('\n')[0].length);
"
```

Expected: `lines: 55` and a `first line length` matching the width of `docs/assets/prismly-logo.txt`'s first line (81 characters). If either number looks wrong (e.g. way larger/smaller, or garbled characters print), stop and re-check `docs/assets/prismly-logo.txt` — do not proceed with a corrupted logo.

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add cli/logo.ts
git commit -m "Add cli/logo.ts generated from the Prismly Braille logo asset"
```

---

### Task 6: Tab components — `AoVivo`, `Historico`, `BaixarApp`

**Files:**
- Create: `cli/tabs/AoVivo.ts`
- Create: `cli/tabs/Historico.ts`
- Create: `cli/tabs/BaixarApp.ts`

**Interfaces:**
- Consumes: `SessionBlock` from `../../core/types.ts`; `AggregatedUsage`, `UsageBucket` from `../../core/types.ts`; `formatCost`, `formatNumber`, `formatDuration` from `../format.ts`; `renderProgressBar` from `../progressBar.ts`; `HistoricoView`, `HISTORICO_VIEWS`, `historicoViewLabel` from `../keybindings.ts`.
- Produces: `AoVivo({ block }: { block: SessionBlock | null })`, `Historico({ aggregated, view }: { aggregated: AggregatedUsage; view: HistoricoView })`, `BaixarApp()` — React components (no props type exported beyond what's shown), used by `cli/App.ts` in Task 7.

No automated tests for this task (Ink UI composition, out of scope per spec). Verification is manual, folded into Task 7's final smoke test.

- [ ] **Step 1: Create `cli/tabs/AoVivo.ts`**

```ts
import React from 'react';
import { Box, Text } from 'ink';
import type { SessionBlock } from '../../core/types.ts';
import { formatCost, formatNumber, formatDuration } from '../format.ts';
import { renderProgressBar } from '../progressBar.ts';

const BLOCK_DURATION_MS = 5 * 60 * 60 * 1000;

export function AoVivo({ block }: { block: SessionBlock | null }): React.ReactElement {
  if (!block) {
    return React.createElement(Text, null, 'Nenhum bloco de sessão ativo no momento.');
  }

  const endMs = new Date(block.end).getTime();
  const remainingMs = Math.max(0, endMs - Date.now());
  const elapsedFraction = 1 - remainingMs / BLOCK_DURATION_MS;

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, null, `Bloco ativo desde ${new Date(block.start).toLocaleTimeString('pt-BR')}`),
    React.createElement(Text, { color: 'magenta' }, renderProgressBar(elapsedFraction, 40)),
    React.createElement(Text, null, `Tempo restante: ${formatDuration(remainingMs)}`),
    React.createElement(Text, null, `Custo do bloco: ${formatCost(block.cost)}`),
    React.createElement(Text, null, `Tokens de entrada: ${formatNumber(block.inputTokens)}`),
    React.createElement(Text, null, `Tokens de saída: ${formatNumber(block.outputTokens)}`),
  );
}
```

- [ ] **Step 2: Create `cli/tabs/Historico.ts`**

```ts
import React from 'react';
import { Box, Text } from 'ink';
import type { AggregatedUsage, UsageBucket } from '../../core/types.ts';
import { formatCost, formatNumber } from '../format.ts';
import { historicoViewLabel, type HistoricoView } from '../keybindings.ts';

function bucketsFor(aggregated: AggregatedUsage, view: HistoricoView): Record<string, UsageBucket> {
  if (view === 'dia') return aggregated.byDay;
  if (view === 'semana') return aggregated.byWeek;
  if (view === 'mes') return aggregated.byMonth;
  if (view === 'modelo') return aggregated.byModel;
  return aggregated.byProject;
}

export function Historico({
  aggregated,
  view,
}: {
  aggregated: AggregatedUsage;
  view: HistoricoView;
}): React.ReactElement {
  const buckets = bucketsFor(aggregated, view);
  const entries = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return React.createElement(Text, null, 'Sem dados ainda.');
  }

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, { bold: true }, `< ${historicoViewLabel(view)} > (setas pra trocar)`),
    ...entries.map(([key, bucket]) =>
      React.createElement(
        Text,
        { key },
        `${key}: ${formatCost(bucket.cost)}  (${formatNumber(bucket.count)} registros)`,
      ),
    ),
  );
}
```

- [ ] **Step 3: Create `cli/tabs/BaixarApp.ts`**

```ts
import React from 'react';
import { Box, Text } from 'ink';

export function BaixarApp(): React.ReactElement {
  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, null, 'Prefere uma interface gráfica?'),
    React.createElement(Text, { color: 'cyan' }, 'https://github.com/VilckFarias/Prismly/releases'),
  );
}
```

- [ ] **Step 4: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add cli/tabs/
git commit -m "Add Ao vivo, Histórico, and Baixar o app tab components"
```

---

### Task 7: `cli/App.ts` and the new `index.ts` entry point

**Files:**
- Create: `cli/App.ts`
- Modify: `index.ts` (full replacement — deletes the old table-report code)

**Interfaces:**
- Consumes: everything produced in Tasks 1–6 (`startWatcher` from `../core/watcher.ts`; `collectClaudeUsage`, `calculateCost`, `aggregateUsage`, `computeBlocks` from `../core/*`; `LOGO` from `./logo.ts`; `TABS`, `tabLabel`, `nextTab`, `HISTORICO_VIEWS`, `nextHistoricoView`, `prevHistoricoView`, `NavState` from `./keybindings.ts`; `AoVivo`, `Historico`, `BaixarApp` from `./tabs/*`).
- Produces: `App(): React.ReactElement`, rendered by `index.ts`.

No automated tests (Ink root composition). Verification is the manual smoke test in Step 3.

- [ ] **Step 1: Create `cli/App.ts`**

```ts
import React from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { collectClaudeUsage } from '../core/adapters/claude.ts';
import { calculateCost } from '../core/pricing.ts';
import { aggregateUsage } from '../core/aggregator.ts';
import { computeBlocks } from '../core/blocks.ts';
import { startWatcher } from '../core/watcher.ts';
import type { AggregatedUsage, SessionBlock } from '../core/types.ts';
import { LOGO } from './logo.ts';
import { TABS, tabLabel, nextTab, HISTORICO_VIEWS, nextHistoricoView, prevHistoricoView } from './keybindings.ts';
import type { NavState } from './keybindings.ts';
import { AoVivo } from './tabs/AoVivo.ts';
import { Historico } from './tabs/Historico.ts';
import { BaixarApp } from './tabs/BaixarApp.ts';

interface Payload {
  aggregated: AggregatedUsage;
  blocks: SessionBlock[];
}

function buildPayload(): Payload {
  const records = collectClaudeUsage().map((record) => ({ ...record, cost: calculateCost(record) }));
  return { aggregated: aggregateUsage(records), blocks: computeBlocks(records) };
}

function App(): React.ReactElement {
  const { exit } = useApp();
  const [payload, setPayload] = React.useState<Payload>(() => buildPayload());
  const [nav, setNav] = React.useState<NavState>({ tabIndex: 0, historicoViewIndex: 0 });

  React.useEffect(() => {
    startWatcher(() => setPayload(buildPayload()));
  }, []);

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }
    if (key.tab) {
      setNav((current) => nextTab(current));
      return;
    }
    if (nav.tabIndex === 1 && key.rightArrow) {
      setNav((current) => nextHistoricoView(current));
    }
    if (nav.tabIndex === 1 && key.leftArrow) {
      setNav((current) => prevHistoricoView(current));
    }
  });

  const activeTab = TABS[nav.tabIndex];
  const activeBlock = payload.blocks.find((block) => block.isActive) ?? null;

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, null, LOGO),
    React.createElement(Text, { dimColor: true }, 'Prismly — uso e custo do Claude Code'),
    React.createElement(
      Box,
      { flexDirection: 'row', marginY: 1 },
      ...TABS.map((tab, index) =>
        React.createElement(
          Text,
          { key: tab, color: index === nav.tabIndex ? 'magenta' : undefined, bold: index === nav.tabIndex },
          `  ${tabLabel(tab)}  `,
        ),
      ),
    ),
    activeTab === 'aoVivo' ? React.createElement(AoVivo, { block: activeBlock }) : null,
    activeTab === 'historico'
      ? React.createElement(Historico, { aggregated: payload.aggregated, view: HISTORICO_VIEWS[nav.historicoViewIndex] })
      : null,
    activeTab === 'baixarApp' ? React.createElement(BaixarApp, null) : null,
    React.createElement(Text, { dimColor: true }, '\nTab: trocar aba · setas: navegar Histórico · q: sair'),
  );
}

export function startApp(): void {
  render(React.createElement(App));
}
```

- [ ] **Step 2: Replace `index.ts`**

Replace the entire contents of `index.ts` with:

```ts
#!/usr/bin/env node
import { startApp } from './cli/App.ts';

startApp();
```

- [ ] **Step 3: Manual smoke test**

```bash
npm start
```

Expected: the terminal clears and shows the Prismly logo, a dim subtitle, a tab bar with "Ao vivo" highlighted, and either live session-block data or "Nenhum bloco de sessão ativo no momento." below it. Press `Tab` — the highlighted tab should move to "Histórico" and show aggregated rows (or "Sem dados ainda."). Press the right/left arrows — the `< View >` header should cycle through Dia/Semana/Mês/Modelo/Projeto. Press `Tab` again to reach "Baixar o app" and see the GitHub releases link. Press `q` — the program should exit cleanly back to the shell prompt.

If anything throws instead of rendering, fix it before moving on — this is the primary deliverable the user asked to see.

- [ ] **Step 4: Verify typecheck and existing tests still pass**

```bash
npm run typecheck
npm test
```

Expected: both pass with no errors.

- [ ] **Step 5: Commit**

```bash
git add cli/App.ts index.ts
git commit -m "Replace static report with interactive Ink TUI as the CLI entry point"
```

---

### Task 8: Final packaging verification

**Files:** none (verification only).

- [ ] **Step 1: Build the publishable bundle**

```bash
npm run build
```

Expected: `dist/index.js` is written with no esbuild errors.

- [ ] **Step 2: Run the built bundle directly**

```bash
node dist/index.js
```

Expected: same interactive TUI as the `npm start` smoke test in Task 7. Press `q` to exit.

- [ ] **Step 3: Run the full test suite one more time**

```bash
npm test
```

Expected: all tests across `core/**/*.test.ts` and `cli/**/*.test.ts` pass.

- [ ] **Step 4: Commit if anything changed during verification**

```bash
git status
```

If `dist/` is untracked and not gitignored, check `.gitignore` before deciding whether to commit it — publishable build output is typically not committed. If nothing changed, skip the commit.
