# Fase 1 — Correções Críticas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the silent exchange-rate-refresh freeze bug, make the "Hoje" day boundary use the user's local timezone instead of UTC, and add a tooltip explaining the hour-floor behavior of the 5h session block.

**Architecture:** Three independent-ish fixes, one per task. Task 1 extracts the currency refresh's stale/invalid check into a pure, testable function and fixes its `NaN` handling. Task 2 changes both `core/aggregator.ts`'s `byDay` key generation and `app/src/renderer/src/App.tsx`'s `todayKey` together, since they must stay consistent with each other (fixing one side alone breaks the day lookup). Task 3 adds a small UI tooltip with no logic changes elsewhere.

**Tech Stack:** TypeScript, Node's built-in `node:test` for `core/` and the newly-testable main-process function, React/TSX.

## Global Constraints

- Code identifiers in English; user-facing text (the tooltip) in Portuguese — per `CLAUDE.md`.
- `byWeek`/`byMonth` in `core/aggregator.ts` are NOT touched by this plan — only `byDay` changes to local-day keys. This is a deliberate scope boundary from the spec.
- The local-day computation must use the real instant (full timestamp, not a date-only substring) read back via local-timezone getters (`getFullYear`/`getMonth`/`getDate`), matching how the design spec describes `localDayKey`.
- No new runtime dependencies.

---

### Task 1: Fix the `fetchedAt` NaN freeze in `currencySettings.ts`

**Files:**
- Modify: `app/src/main/currencySettings.ts`
- Create: `app/src/main/currencySettings.test.ts`

**Interfaces:**
- Produces: `shouldFetchExchangeRate(current: CurrencySettings, now?: number): boolean`, exported from `app/src/main/currencySettings.ts` (new — extracted from inline logic in `refreshExchangeRateIfNeeded`, so it can be unit-tested without mocking `fetch`/Electron's `app` module).

- [ ] **Step 1: Write the failing tests**

Create `app/src/main/currencySettings.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldFetchExchangeRate } from './currencySettings.ts';
import type { CurrencySettings } from '../shared/types.ts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

test('busca quando rate é null', () => {
  const current: CurrencySettings = { selected: 'usd', rate: null, fetchedAt: null };
  assert.equal(shouldFetchExchangeRate(current), true);
});

test('busca quando fetchedAt é null', () => {
  const current: CurrencySettings = { selected: 'usd', rate: 5.2, fetchedAt: null };
  assert.equal(shouldFetchExchangeRate(current), true);
});

test('busca quando fetchedAt é uma string corrompida (não é data válida) -- bug original', () => {
  const current: CurrencySettings = { selected: 'usd', rate: 5.2, fetchedAt: 'not-a-date' };
  assert.equal(shouldFetchExchangeRate(current), true);
});

test('não busca quando a cotação tem menos de 24h', () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const current: CurrencySettings = { selected: 'usd', rate: 5.2, fetchedAt: twoHoursAgo };
  assert.equal(shouldFetchExchangeRate(current), false);
});

test('busca quando a cotação tem mais de 24h', () => {
  const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const current: CurrencySettings = { selected: 'usd', rate: 5.2, fetchedAt: twentyFiveHoursAgo };
  assert.equal(shouldFetchExchangeRate(current), true);
});

test('respeita o parâmetro now explícito para evitar flakiness', () => {
  const fetchedAt = new Date(0).toISOString();
  const current: CurrencySettings = { selected: 'usd', rate: 5.2, fetchedAt };
  assert.equal(shouldFetchExchangeRate(current, ONE_DAY_MS - 1), false);
  assert.equal(shouldFetchExchangeRate(current, ONE_DAY_MS + 1), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test app/src/main/currencySettings.test.ts`
Expected: FAIL — `shouldFetchExchangeRate is not a function` (or similar — the function doesn't exist yet)

- [ ] **Step 3: Extract and fix `shouldFetchExchangeRate`**

`app/src/main/currencySettings.ts` currently reads:

```ts
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

Replace it with:

```ts
export function shouldFetchExchangeRate(current: CurrencySettings, now: number = Date.now()): boolean {
  return (
    current.rate === null ||
    current.fetchedAt === null ||
    Number.isNaN(Date.parse(current.fetchedAt)) ||
    now - new Date(current.fetchedAt).getTime() > ONE_DAY_MS
  );
}

export async function refreshExchangeRateIfNeeded(): Promise<void> {
  const current = loadCurrencySettings();
  if (!shouldFetchExchangeRate(current)) return;

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

`Number.isNaN(Date.parse(current.fetchedAt))` is the fix: `Date.parse` returns `NaN` for any string that isn't a valid date, and this check now forces a fetch attempt in that case instead of silently freezing forever (the old code's `Date.now() - NaN > ONE_DAY_MS` always evaluated to `false`, since any comparison against `NaN` is `false` in JavaScript).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test app/src/main/currencySettings.test.ts`
Expected: PASS — 6/6 tests pass

- [ ] **Step 5: Add a `test` script entry and run the full app test suite + typecheck**

Check `app/package.json`'s existing `"test"` script (added in an earlier plan): `"test": "node --test src/main/**/*.test.ts"` — this glob already picks up the new `currencySettings.test.ts` alongside the existing `trayPositioning.test.ts`, no change needed to `package.json`.

Run: `cd app && npm test`
Expected: PASS — both `trayPositioning.test.ts` (7 tests) and `currencySettings.test.ts` (6 tests) pass, 13 total

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 6: Commit**

```bash
git add app/src/main/currencySettings.ts app/src/main/currencySettings.test.ts
git commit -m "fix: exchange-rate refresh no longer freezes on a corrupted fetchedAt"
```

---

### Task 2: "Hoje" uses the local calendar day, not UTC

**Files:**
- Modify: `core/aggregator.ts`
- Modify: `core/aggregator.test.ts`
- Modify: `app/src/renderer/src/App.tsx`

**Interfaces:**
- Produces: `localDayKey(timestamp: string): string`, a new (unexported — used only within `core/aggregator.ts`) helper that replaces `record.timestamp.slice(0, 10)` for `byDay` specifically. No other file imports this function; `App.tsx`'s fix is a parallel, independent inline computation using the same technique, not a shared import (there's no existing shared-utility file between `core/` and `app/` for this kind of formatting helper, and creating one for a single 4-line function would be over-engineering).

This task must ship both files together — changing only one side would make `App.tsx`'s `todayKey` stop matching `core/aggregator.ts`'s `byDay` keys, breaking the "Hoje" lookup instead of fixing it.

- [ ] **Step 1: Write the failing test for `localDayKey`'s local-timezone behavior**

`core/aggregator.test.ts` currently starts:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUsage } from './aggregator.ts';
import type { UsageRecord } from './types.ts';

function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    timestamp: '2026-07-09T10:00:00.000Z',
    model: 'claude-sonnet-5',
    project: 'demo-project',
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 1,
    ...overrides,
  };
}
```

Add a new test after the existing `'agrupa por dia, modelo e projeto, e soma os totais'` test (keep that test as-is — its assertions still hold, since `2026-07-09T10:00:00.000Z` is `07:00` in `America/Sao_Paulo`, the same calendar day either way):

```ts
test('byDay usa o dia civil local, não o dia UTC', () => {
  const originalTz = process.env.TZ;
  process.env.TZ = 'America/Sao_Paulo';

  try {
    // 23:30 UTC do dia 09 = 20:30 em São Paulo (UTC-3) -- ainda dia 09 local,
    // mas seria um risco de virar dia 10 se o código folheasse pra UTC.
    const sameLocalDay = [
      makeRecord({ timestamp: '2026-07-09T23:30:00.000Z' }),
      makeRecord({ timestamp: '2026-07-09T10:00:00.000Z', cost: 2 }),
    ];
    const { byDay: byDaySame } = aggregateUsage(sameLocalDay);
    assert.deepEqual(Object.keys(byDaySame), ['2026-07-09']);
    assert.equal(byDaySame['2026-07-09'].count, 2);

    // 02:00 UTC do dia 10 = 23:00 em São Paulo do dia 09 -- deve cair no
    // bucket local do dia 09, não do dia 10 (que é o que o UTC diria).
    const stillPreviousLocalDay = [makeRecord({ timestamp: '2026-07-10T02:00:00.000Z' })];
    const { byDay: byDayLate } = aggregateUsage(stillPreviousLocalDay);
    assert.deepEqual(Object.keys(byDayLate), ['2026-07-09']);
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test core/aggregator.test.ts`
Expected: FAIL — `byDayLate` has key `'2026-07-10'` instead of `'2026-07-09'` (current code buckets by UTC date, so `02:00 UTC` on the 10th stays on the 10th)

- [ ] **Step 3: Implement `localDayKey` in `core/aggregator.ts`**

`core/aggregator.ts` currently reads:

```ts
function mondayKey(timestamp: string): string {
  const date = new Date(timestamp.slice(0, 10) + 'T00:00:00');
  const day = date.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

export function aggregateUsage(records: UsageRecord[]): AggregatedUsage {
  const byDay = groupBy(records, (record) => record.timestamp.slice(0, 10));
  const byWeek = groupBy(records, (record) => mondayKey(record.timestamp));
  const byMonth = groupBy(records, (record) => record.timestamp.slice(0, 7));
  const byModel = groupBy(records, (record) => record.model);
  const byProject = groupBy(records, (record) => record.project);

  const totals = createEmptyBucket();
  for (const record of records) addRecord(totals, record);

  return { byDay, byWeek, byMonth, byModel, byProject, totals };
}
```

Add `localDayKey` right before `mondayKey`, and change only the `byDay` line in `aggregateUsage`:

```ts
function localDayKey(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mondayKey(timestamp: string): string {
  const date = new Date(timestamp.slice(0, 10) + 'T00:00:00');
  const day = date.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

export function aggregateUsage(records: UsageRecord[]): AggregatedUsage {
  const byDay = groupBy(records, (record) => localDayKey(record.timestamp));
  const byWeek = groupBy(records, (record) => mondayKey(record.timestamp));
  const byMonth = groupBy(records, (record) => record.timestamp.slice(0, 7));
  const byModel = groupBy(records, (record) => record.model);
  const byProject = groupBy(records, (record) => record.project);

  const totals = createEmptyBucket();
  for (const record of records) addRecord(totals, record);

  return { byDay, byWeek, byMonth, byModel, byProject, totals };
}
```

`byWeek` (`mondayKey`) and `byMonth` are unchanged — out of scope per the spec.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test core/aggregator.test.ts`
Expected: PASS — all tests, including the new local-timezone test, pass

- [ ] **Step 5: Update `todayKey` in `App.tsx`**

`app/src/renderer/src/App.tsx` currently reads (around line 105):

```tsx
  const todayKey = new Date().toISOString().slice(0, 10);
  const today: UsageBucket | undefined = payload.aggregated.byDay[todayKey];
```

Change it to:

```tsx
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const today: UsageBucket | undefined = payload.aggregated.byDay[todayKey];
```

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `npm test` (from repo root, runs `core/*.test.ts`)
Expected: PASS — all `core/` tests pass, including the two new assertions in `aggregator.test.ts`

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors (note: `App.tsx` already declares a local variable named `now` nowhere else in the function, so this doesn't collide with any existing identifier — confirmed by reading the current file, which has no other `now` binding)

- [ ] **Step 7: Commit**

```bash
git add core/aggregator.ts core/aggregator.test.ts app/src/renderer/src/App.tsx
git commit -m "fix: bucket byDay and Hoje by local calendar day instead of UTC"
```

---

### Task 3: Tooltip explaining the 5h block's hour-floor behavior

**Files:**
- Modify: `app/src/renderer/src/tabs/AoVivo.tsx`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (independent UI-only change).
- Produces: nothing consumed by other tasks — last task in the plan.

- [ ] **Step 1: Add the tooltip icon next to "Sessão atual"**

`app/src/renderer/src/tabs/AoVivo.tsx` currently has this block (inside the `activeBlock ? (...)` branch):

```tsx
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <strong style={{ fontSize: 14 }}>Sessão atual</strong>
            <span style={{ fontSize: 11, color: '#999' }}>reinicia em {formatRemaining(activeBlock.end)}</span>
          </div>
```

Replace it with:

```tsx
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <strong style={{ fontSize: 14 }}>Sessão atual</strong>
              <span
                title="O bloco de 5h começa a contar a partir do início da hora cheia em que você usou o Claude Code pela primeira vez, não do minuto exato — por isso a barra pode já nascer parcialmente preenchida."
                style={{ cursor: 'help', fontSize: 11, color: '#777' }}
              >
                ⓘ
              </span>
            </span>
            <span style={{ fontSize: 11, color: '#999' }}>reinicia em {formatRemaining(activeBlock.end)}</span>
          </div>
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/src/tabs/AoVivo.tsx
git commit -m "feat: explain the 5h block's hour-floor behavior via tooltip"
```

---

## Manual verification

After all three tasks: run `npm run dev` from `app/`.

1. **Task 1 regression check:** confirm the app still starts and the Configuração tab's currency toggle still works (this task only changed internal validation logic, no behavior change for the happy path).
2. **Task 2:** if reachable, check the "Hoje" card doesn't reset until local midnight rather than 21h (this is hard to verify in a short session — at minimum, confirm today's usage still shows correctly at the current time of day, and re-derive by hand that `todayKey`'s value matches the actual local calendar date).
3. **Task 3:** hover over the "ⓘ" icon next to "Sessão atual" in the Ao Vivo tab and confirm the tooltip text appears.
