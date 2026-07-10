import test from 'node:test';
import assert from 'node:assert/strict';
import { findJsonlFiles } from './claude.js';

test('retorna array vazio quando o diretório não existe', () => {
  const result = findJsonlFiles('/caminho/que/nao/existe/prismly-test');
  assert.deepEqual(result, []);
});
