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

test('agrupa por dia, modelo e projeto, e soma os totais', () => {
  const records = [
    makeRecord(),
    makeRecord({
      timestamp: '2026-07-10T10:00:00.000Z',
      model: 'claude-opus-4-8',
      project: 'other-project',
      cost: 2,
    }),
  ];

  const { byDay, byModel, byProject, totals } = aggregateUsage(records);

  assert.deepEqual(Object.keys(byDay).sort(), ['2026-07-09', '2026-07-10']);
  assert.equal(byModel['claude-sonnet-5'].count, 1);
  assert.equal(byProject['other-project'].cost, 2);
  assert.equal(totals.count, 2);
  assert.equal(totals.cost, 3);
});

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
