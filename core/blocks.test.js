import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBlocks } from './blocks.js';

function makeRecord(timestamp, overrides = {}) {
  return {
    timestamp,
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

test('retorna array vazio quando não há registros', () => {
  assert.deepEqual(computeBlocks([]), []);
});

test('agrupa registros dentro de 5h num único bloco', () => {
  const records = [
    makeRecord('2026-07-09T10:15:00.000Z'),
    makeRecord('2026-07-09T12:00:00.000Z'),
  ];

  const blocks = computeBlocks(records, { now: new Date('2026-07-09T13:00:00.000Z') });

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].start, '2026-07-09T10:00:00.000Z');
  assert.equal(blocks[0].count, 2);
  assert.equal(blocks[0].inputTokens, 200);
  assert.equal(blocks[0].isActive, true);
});

test('abre um novo bloco após um gap de inatividade >= 5h', () => {
  const records = [
    makeRecord('2026-07-09T10:00:00.000Z'),
    makeRecord('2026-07-09T16:00:00.000Z'),
  ];

  const blocks = computeBlocks(records, { now: new Date('2026-07-09T17:00:00.000Z') });

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].isActive, false);
  assert.equal(blocks[1].isActive, true);
});

test('fecha o bloco 5h após o início, mesmo sem gap grande', () => {
  const records = [
    makeRecord('2026-07-09T10:15:00.000Z'),
    makeRecord('2026-07-09T14:00:00.000Z'),
    makeRecord('2026-07-09T15:30:00.000Z'),
  ];

  const blocks = computeBlocks(records, { now: new Date('2026-07-09T16:00:00.000Z') });

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].count, 2);
  assert.equal(blocks[1].count, 1);
});

test('projeta o fim como início + 5h enquanto o bloco está ativo', () => {
  const records = [makeRecord('2026-07-09T10:00:00.000Z')];

  const blocks = computeBlocks(records, { now: new Date('2026-07-09T10:30:00.000Z') });

  assert.equal(blocks[0].end, '2026-07-09T15:00:00.000Z');
});

test('usa a última atividade como fim quando o bloco já fechou', () => {
  const records = [
    makeRecord('2026-07-09T10:00:00.000Z'),
    makeRecord('2026-07-09T20:00:00.000Z'),
  ];

  const blocks = computeBlocks(records, { now: new Date('2026-07-09T21:00:00.000Z') });

  assert.equal(blocks[0].isActive, false);
  assert.equal(blocks[0].end, '2026-07-09T10:00:00.000Z');
});
