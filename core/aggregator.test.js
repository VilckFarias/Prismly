import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUsage } from './aggregator.js';

function makeRecord(overrides = {}) {
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
