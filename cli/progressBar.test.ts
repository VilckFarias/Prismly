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
