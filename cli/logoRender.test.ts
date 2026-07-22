import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLogo } from './logoRender.ts';

test('fonte toda vazia gera braille todo vazio', () => {
  const source = '        \n        \n        \n        '; // 8x4
  const out = renderLogo(source, 4);
  assert.equal(out, '⠀⠀⠀⠀');
});

test('fonte toda preenchida gera braille todo cheio', () => {
  const source = '++++++++\n++++++++\n++++++++\n++++++++'; // 8x4
  const out = renderLogo(source, 4);
  assert.equal(out, '⣿⣿⣿⣿');
});

test('largura e altura de saída batem com o pedido e a proporção da fonte', () => {
  const source = '++++++++\n++++++++\n++++++++\n++++++++'; // 8x4 (proporção 1:2 largura:altura em blocos)
  const out = renderLogo(source, 4);
  const lines = out.split('\n');
  assert.equal(lines.length, 1);
  assert.equal([...lines[0]].length, 4);
});

test('um único pixel aceso sobrevive à redução agressiva (preserva traço fino)', () => {
  const width = 40;
  const height = 20;
  const rows = Array.from({ length: height }, () => ' '.repeat(width).split(''));
  rows[10][20] = '+';
  const source = rows.map((r) => r.join('')).join('\n');

  const out = renderLogo(source, 4);
  const hasAnyDot = [...out].some((ch) => ch !== '⠀' && ch !== '\n');
  assert.equal(hasAnyDot, true);
});

test('largura ou altura zero na fonte retorna string vazia', () => {
  assert.equal(renderLogo('', 10), '');
});
