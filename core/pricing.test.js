import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCost } from './pricing.js';

test('calcula o custo somando cada faixa de preço do modelo', () => {
  const record = {
    model: 'claude-sonnet-5',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheCreation5mTokens: 1_000_000,
    cacheCreation1hTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
  };

  const cost = calculateCost(record);

  assert.equal(cost, 2 + 10 + 2.5 + 4 + 0.2);
});

test('retorna 0 para modelo desconhecido', () => {
  const cost = calculateCost({
    model: 'unknown-model',
    inputTokens: 1000,
    outputTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
    cacheReadTokens: 0,
  });

  assert.equal(cost, 0);
});
