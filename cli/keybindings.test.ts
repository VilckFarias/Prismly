import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TABS,
  HISTORICO_VIEWS,
  nextTab,
  nextHistoricoView,
  prevHistoricoView,
  tabLabel,
  historicoViewLabel,
} from './keybindings.ts';

test('nextTab avança e dá a volta no fim', () => {
  assert.equal(nextTab({ tabIndex: 0, historicoViewIndex: 0 }).tabIndex, 1);
  assert.equal(nextTab({ tabIndex: TABS.length - 1, historicoViewIndex: 0 }).tabIndex, 0);
});

test('nextHistoricoView avança e dá a volta no fim', () => {
  assert.equal(nextHistoricoView({ tabIndex: 0, historicoViewIndex: 0 }).historicoViewIndex, 1);
  assert.equal(
    nextHistoricoView({ tabIndex: 0, historicoViewIndex: HISTORICO_VIEWS.length - 1 }).historicoViewIndex,
    0,
  );
});

test('prevHistoricoView recua e dá a volta no início', () => {
  assert.equal(prevHistoricoView({ tabIndex: 0, historicoViewIndex: 1 }).historicoViewIndex, 0);
  assert.equal(
    prevHistoricoView({ tabIndex: 0, historicoViewIndex: 0 }).historicoViewIndex,
    HISTORICO_VIEWS.length - 1,
  );
});

test('tabLabel cobre todas as abas', () => {
  assert.equal(tabLabel('aoVivo'), 'Ao vivo');
  assert.equal(tabLabel('historico'), 'Histórico');
  assert.equal(tabLabel('baixarApp'), 'Baixar o app');
});

test('historicoViewLabel cobre todas as views', () => {
  assert.equal(historicoViewLabel('dia'), 'Dia');
  assert.equal(historicoViewLabel('semana'), 'Semana');
  assert.equal(historicoViewLabel('mes'), 'Mês');
  assert.equal(historicoViewLabel('modelo'), 'Modelo');
  assert.equal(historicoViewLabel('projeto'), 'Projeto');
});
