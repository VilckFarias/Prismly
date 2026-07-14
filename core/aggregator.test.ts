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
