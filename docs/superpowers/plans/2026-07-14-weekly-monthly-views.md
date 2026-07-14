# Weekly/Monthly Usage Views (Fase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add weekly and monthly usage aggregation to `core/` and wire the already-existing (but disabled) "Semana"/"Mensal" buttons in the Histórico tab to display them.

**Architecture:** Extend `aggregateUsage()` in `core/aggregator.ts` with two new groupings (`byWeek`, `byMonth`) using the same generic `groupBy` helper already used for `byDay`/`byModel`/`byProject` — just new key functions. The renderer (`Historico.tsx`) gets two new label-formatting functions (for display only; sorting always uses the underlying ISO key) and enables the two buttons that already exist in the UI.

**Tech Stack:** TypeScript (Node native type-stripping, no build step), Node's built-in `node:test` + `node:assert/strict` for `core/`, React/TSX for the renderer.

## Global Constraints

- Code identifiers in English; user-facing text in Portuguese — per `CLAUDE.md`.
- Week starts on Monday (ISO 8601 convention).
- Week label format: date range without year, e.g. `"07/07 - 13/07"`.
- Month label format: full Portuguese month name + year, e.g. `"Julho/2026"`.
- "Por modelo" and "Por projeto" stay global (unscoped by the day/week/month toggle) — no change to their existing behavior.
- Sorting always uses the underlying ISO key (`YYYY-MM-DD` for week, `YYYY-MM` for month), ascending (oldest first) — never the formatted display label.
- No timezone conversion via `toISOString()` when computing date keys — use local-time getters (`getFullYear`/`getMonth`/`getDate`) throughout, consistent with how `byDay`/`byMonth` already avoid timezone math (pure string slicing).
- No new runtime dependencies.

---

### Task 1: `byWeek`/`byMonth` aggregation in `core/`

**Files:**
- Modify: `core/aggregator.ts` (add `mondayKey` helper, wire `byWeek`/`byMonth` into `aggregateUsage`)
- Modify: `core/types.ts:35-40` (add `byWeek`/`byMonth` to `AggregatedUsage`)
- Modify: `core/aggregator.test.ts` (add test cases)

**Interfaces:**
- Consumes: nothing new — `groupBy(records, keyFn)` and `UsageRecord`/`UsageBucket` already exist in `core/aggregator.ts`/`core/types.ts`.
- Produces (used by Task 2): `AggregatedUsage.byWeek: Record<string, UsageBucket>` (keyed by the Monday date of that week, `YYYY-MM-DD`), `AggregatedUsage.byMonth: Record<string, UsageBucket>` (keyed by `YYYY-MM`).

- [ ] **Step 1: Write the failing tests**

Add to `core/aggregator.test.ts` (after the existing test, keeping the existing `makeRecord` helper and its default `timestamp: '2026-07-09T10:00:00.000Z'`):

```ts
test('agrupa registros da mesma semana no mesmo bucket, mesmo em meses diferentes', () => {
  const records = [
    makeRecord({ timestamp: '2026-06-29T10:00:00.000Z' }), // segunda-feira
    makeRecord({ timestamp: '2026-07-02T10:00:00.000Z', cost: 2 }), // quinta-feira, mesma semana
  ];

  const { byWeek, byMonth } = aggregateUsage(records);

  assert.deepEqual(Object.keys(byWeek), ['2026-06-29']);
  assert.equal(byWeek['2026-06-29'].count, 2);
  assert.equal(byWeek['2026-06-29'].cost, 3);
  assert.deepEqual(Object.keys(byMonth).sort(), ['2026-06', '2026-07']);
});

test('agrupa registros de semanas diferentes em buckets diferentes', () => {
  const records = [
    makeRecord({ timestamp: '2026-07-09T10:00:00.000Z' }), // quinta-feira, semana de 06/07
    makeRecord({ timestamp: '2026-07-16T10:00:00.000Z', cost: 2 }), // quinta-feira seguinte, semana de 13/07
  ];

  const { byWeek } = aggregateUsage(records);

  assert.deepEqual(Object.keys(byWeek).sort(), ['2026-07-06', '2026-07-13']);
});

test('agrupa registros do mesmo mês no mesmo bucket, meses diferentes em buckets diferentes', () => {
  const records = [
    makeRecord({ timestamp: '2026-07-01T10:00:00.000Z' }),
    makeRecord({ timestamp: '2026-07-31T10:00:00.000Z', cost: 2 }),
    makeRecord({ timestamp: '2026-08-01T10:00:00.000Z', cost: 4 }),
  ];

  const { byMonth } = aggregateUsage(records);

  assert.deepEqual(Object.keys(byMonth).sort(), ['2026-07', '2026-08']);
  assert.equal(byMonth['2026-07'].count, 2);
  assert.equal(byMonth['2026-07'].cost, 3);
  assert.equal(byMonth['2026-08'].cost, 4);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test core/aggregator.test.ts`
Expected: FAIL — `byWeek`/`byMonth` are `undefined` on the object returned by `aggregateUsage` (destructuring `undefined` properties, or the `assert.deepEqual(Object.keys(undefined), ...)` calls throw)

- [ ] **Step 3: Add `byWeek`/`byMonth` to `AggregatedUsage`**

In `core/types.ts`, the `AggregatedUsage` interface currently reads (lines 35-40):

```ts
export interface AggregatedUsage {
  byDay: Record<string, UsageBucket>;
  byModel: Record<string, UsageBucket>;
  byProject: Record<string, UsageBucket>;
  totals: UsageBucket;
}
```

Change it to:

```ts
export interface AggregatedUsage {
  byDay: Record<string, UsageBucket>;
  byWeek: Record<string, UsageBucket>;
  byMonth: Record<string, UsageBucket>;
  byModel: Record<string, UsageBucket>;
  byProject: Record<string, UsageBucket>;
  totals: UsageBucket;
}
```

- [ ] **Step 4: Implement `mondayKey` and wire it into `aggregateUsage`**

In `core/aggregator.ts`, the full file currently reads:

```ts
import type { UsageRecord, UsageBucket, AggregatedUsage } from './types.ts';

function createEmptyBucket(): UsageBucket {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 0,
    count: 0,
  };
}

function addRecord(bucket: UsageBucket, record: UsageRecord): void {
  bucket.inputTokens += record.inputTokens;
  bucket.outputTokens += record.outputTokens;
  bucket.cacheCreationTokens += record.cacheCreationTokens;
  bucket.cacheReadTokens += record.cacheReadTokens;
  bucket.cost += record.cost;
  bucket.count += 1;
}

function groupBy(
  records: UsageRecord[],
  keyFn: (record: UsageRecord) => string,
): Record<string, UsageBucket> {
  const groups: Record<string, UsageBucket> = {};
  for (const record of records) {
    const key = keyFn(record);
    if (!groups[key]) groups[key] = createEmptyBucket();
    addRecord(groups[key], record);
  }
  return groups;
}

export function aggregateUsage(records: UsageRecord[]): AggregatedUsage {
  const byDay = groupBy(records, (record) => record.timestamp.slice(0, 10));
  const byModel = groupBy(records, (record) => record.model);
  const byProject = groupBy(records, (record) => record.project);

  const totals = createEmptyBucket();
  for (const record of records) addRecord(totals, record);

  return { byDay, byModel, byProject, totals };
}
```

Replace the `aggregateUsage` function and add `mondayKey` right before it:

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

`mondayKey` uses local-time getters end-to-end (`getFullYear`/`getMonth`/`getDate`), never `toISOString()` — this avoids a UTC round-trip that could shift the computed date by a day depending on the machine's timezone, keeping it consistent with how `byDay`/`byMonth` already do zero timezone conversion (pure string slicing on the raw timestamp).

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test core/aggregator.test.ts`
Expected: PASS — all tests in the file (the pre-existing one plus the 3 new ones) pass

- [ ] **Step 6: Run the full core/CLI test suite and typecheck**

Run: `npm test` (from repo root) and `npm run typecheck` (from repo root)
Expected: PASS — all tests across `core/*.test.ts` pass, no type errors

- [ ] **Step 7: Commit**

```bash
git add core/aggregator.ts core/types.ts core/aggregator.test.ts
git commit -m "feat: add weekly and monthly usage aggregation to core"
```

---

### Task 2: Enable Semana/Mensal in the Histórico tab

**Files:**
- Modify: `app/src/renderer/src/tabs/Historico.tsx`

**Interfaces:**
- Consumes: `AggregatedUsage.byWeek`/`AggregatedUsage.byMonth` from Task 1 (both `Record<string, UsageBucket>`, same shape as the existing `byDay`).
- Produces: nothing consumed by other tasks — this is the last task in the plan.

- [ ] **Step 1: Add label-formatting helpers**

In `app/src/renderer/src/tabs/Historico.tsx`, the top of the file currently has `formatNumber`/`formatCost` (lines 5-11). Add two new functions right after `formatCost`:

```ts
function formatWeekLabel(mondayKey: string): string {
  const monday = new Date(mondayKey + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date): string =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(monday)} - ${fmt(sunday)}`;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return `${MONTH_NAMES[Number(month) - 1]}/${year}`;
}
```

- [ ] **Step 2: Compute `byWeekRows`/`byMonthRows` with formatted labels**

The `Historico` component currently computes (lines 64-66):

```ts
const byDayRows = Object.entries(aggregated.byDay).sort(([a], [b]) => a.localeCompare(b));
const byModelRows = Object.entries(aggregated.byModel).sort(([, a], [, b]) => b.cost - a.cost);
const byProjectRows = Object.entries(aggregated.byProject).sort(([, a], [, b]) => b.cost - a.cost);
```

Add two more lines right after `byDayRows`:

```ts
const byDayRows = Object.entries(aggregated.byDay).sort(([a], [b]) => a.localeCompare(b));
const byWeekRows: [string, UsageBucket][] = Object.entries(aggregated.byWeek)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, bucket]) => [formatWeekLabel(key), bucket]);
const byMonthRows: [string, UsageBucket][] = Object.entries(aggregated.byMonth)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, bucket]) => [formatMonthLabel(key), bucket]);
const byModelRows = Object.entries(aggregated.byModel).sort(([, a], [, b]) => b.cost - a.cost);
const byProjectRows = Object.entries(aggregated.byProject).sort(([, a], [, b]) => b.cost - a.cost);
```

Sorting happens on the raw ISO key (`a`/`b`, before formatting) — the `.map()` that converts to the display label runs last, after sorting, so ordering is never affected by the formatted text.

- [ ] **Step 3: Enable the Semana/Mensal buttons and update the conditional rendering**

The sub-nav currently reads (lines 70-84):

```tsx
<div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
  <button
    onClick={() => setGranularity('dia')}
    disabled={granularity === 'dia'}
    style={pillStyle(granularity === 'dia', false)}
  >
    Dia
  </button>
  <button disabled style={pillStyle(false, true)}>
    Semana
  </button>
  <button disabled style={pillStyle(false, true)}>
    Mensal
  </button>
</div>
```

Replace it with:

```tsx
<div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
  <button
    onClick={() => setGranularity('dia')}
    disabled={granularity === 'dia'}
    style={pillStyle(granularity === 'dia', false)}
  >
    Dia
  </button>
  <button
    onClick={() => setGranularity('semana')}
    disabled={granularity === 'semana'}
    style={pillStyle(granularity === 'semana', false)}
  >
    Semana
  </button>
  <button
    onClick={() => setGranularity('mensal')}
    disabled={granularity === 'mensal'}
    style={pillStyle(granularity === 'mensal', false)}
  >
    Mensal
  </button>
</div>
```

The body currently reads (lines 85-93):

```tsx
<div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
  {granularity === 'dia' && (
    <>
      <CardList title="Por dia" rows={byDayRows} />
      <CardList title="Por modelo" rows={byModelRows} />
      <CardList title="Por projeto" rows={byProjectRows} />
    </>
  )}
</div>
```

Replace it with:

```tsx
<div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
  {granularity === 'dia' && <CardList title="Por dia" rows={byDayRows} />}
  {granularity === 'semana' && <CardList title="Por semana" rows={byWeekRows} />}
  {granularity === 'mensal' && <CardList title="Por mês" rows={byMonthRows} />}
  <CardList title="Por modelo" rows={byModelRows} />
  <CardList title="Por projeto" rows={byProjectRows} />
</div>
```

"Por modelo"/"Por projeto" move outside the conditional so they always render regardless of which granularity is selected, exactly matching their current (unscoped) behavior — this is a rendering-order change only, not a behavior change: today they only appear when `granularity === 'dia'` because that was the only granularity that existed; now that there are three, they need to be outside the per-granularity branch to keep appearing in all three, unchanged.

- [ ] **Step 4: Typecheck**

Run: `cd app && npm run typecheck`
Expected: PASS — no type errors (in particular, confirms `UsageBucket` is already imported at the top of `Historico.tsx`, which it is — see line 3 of the current file)

- [ ] **Step 5: Commit**

```bash
git add app/src/renderer/src/tabs/Historico.tsx
git commit -m "feat: enable Semana/Mensal views in Histórico tab"
```

---

## Manual verification

After both tasks: run `npm run dev` from `app/`, open the Histórico tab, and confirm:
1. Clicking "Semana" shows a list titled "Por semana" with labels like `"07/07 - 13/07"`, and clicking "Mensal" shows "Por mês" with labels like `"Julho/2026"`.
2. The total cost/tokens summed across all rows in each of Dia/Semana/Mensal match each other (same underlying data, different grouping).
3. "Por modelo" and "Por projeto" stay visible and identical across all three granularities.
