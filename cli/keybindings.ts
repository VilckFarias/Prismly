export type TabName = 'aoVivo' | 'historico' | 'baixarApp';
export const TABS: TabName[] = ['aoVivo', 'historico', 'baixarApp'];

export type HistoricoView = 'dia' | 'semana' | 'mes' | 'modelo' | 'projeto';
export const HISTORICO_VIEWS: HistoricoView[] = ['dia', 'semana', 'mes', 'modelo', 'projeto'];

export interface NavState {
  tabIndex: number;
  historicoViewIndex: number;
}

export function nextTab(state: NavState): NavState {
  return { ...state, tabIndex: (state.tabIndex + 1) % TABS.length };
}

export function nextHistoricoView(state: NavState): NavState {
  return { ...state, historicoViewIndex: (state.historicoViewIndex + 1) % HISTORICO_VIEWS.length };
}

export function prevHistoricoView(state: NavState): NavState {
  const length = HISTORICO_VIEWS.length;
  return { ...state, historicoViewIndex: (state.historicoViewIndex - 1 + length) % length };
}

export function tabLabel(tab: TabName): string {
  if (tab === 'aoVivo') return 'Ao vivo';
  if (tab === 'historico') return 'Histórico';
  return 'Baixar o app';
}

export function historicoViewLabel(view: HistoricoView): string {
  if (view === 'dia') return 'Dia';
  if (view === 'semana') return 'Semana';
  if (view === 'mes') return 'Mês';
  if (view === 'modelo') return 'Modelo';
  return 'Projeto';
}
