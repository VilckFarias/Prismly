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
