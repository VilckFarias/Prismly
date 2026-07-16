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
