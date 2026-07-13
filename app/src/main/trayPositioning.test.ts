import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidTrayBounds,
  computeAboveTrayPosition,
  computeFallbackPosition,
} from './trayPositioning.ts';

test('isValidTrayBounds retorna true para bounds normais', () => {
  assert.equal(isValidTrayBounds({ x: 100, y: 200, width: 24, height: 24 }), true);
});

test('isValidTrayBounds retorna false quando width e height são zero', () => {
  assert.equal(isValidTrayBounds({ x: 0, y: 0, width: 0, height: 0 }), false);
});

test('isValidTrayBounds retorna false quando width é negativo', () => {
  assert.equal(isValidTrayBounds({ x: 10, y: 10, width: -1, height: 24 }), false);
});

test('isValidTrayBounds retorna false quando height é NaN', () => {
  assert.equal(isValidTrayBounds({ x: 10, y: 10, width: 24, height: NaN }), false);
});

test('computeAboveTrayPosition centraliza o popup horizontalmente acima do ícone', () => {
  const result = computeAboveTrayPosition({ x: 1000, y: 40, width: 24, height: 24 }, 380, 500);
  assert.deepEqual(result, { x: 822, y: -460 });
});

test('computeFallbackPosition ancora no canto inferior direito com margem', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
  const result = computeFallbackPosition(workArea, 380, 500, 12);
  assert.deepEqual(result, { x: 1528, y: 568 });
});

test('computeFallbackPosition respeita o offset de work areas que não começam em (0,0)', () => {
  const workArea = { x: 100, y: 50, width: 1920, height: 1080 };
  const result = computeFallbackPosition(workArea, 380, 500, 12);
  assert.deepEqual(result, { x: 1628, y: 618 });
});
