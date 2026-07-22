import React from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { collectClaudeUsage } from '../core/adapters/claude.ts';
import { calculateCost } from '../core/pricing.ts';
import { aggregateUsage } from '../core/aggregator.ts';
import { computeBlocks } from '../core/blocks.ts';
import { startWatcher } from '../core/watcher.ts';
import type { AggregatedUsage, SessionBlock } from '../core/types.ts';
import { LogoView } from './LogoView.ts';
import { TABS, tabLabel, nextTab, HISTORICO_VIEWS, nextHistoricoView, prevHistoricoView } from './keybindings.ts';
import type { NavState } from './keybindings.ts';
import { AoVivo } from './tabs/AoVivo.ts';
import { Historico } from './tabs/Historico.ts';
import { BaixarApp } from './tabs/BaixarApp.ts';

interface Payload {
  aggregated: AggregatedUsage;
  blocks: SessionBlock[];
}

function buildPayload(): Payload {
  const records = collectClaudeUsage().map((record) => ({ ...record, cost: calculateCost(record) }));
  return { aggregated: aggregateUsage(records), blocks: computeBlocks(records) };
}

function App(): React.ReactElement {
  const { exit } = useApp();
  const [payload, setPayload] = React.useState<Payload>(() => buildPayload());
  const [nav, setNav] = React.useState<NavState>({ tabIndex: 0, historicoViewIndex: 0 });

  React.useEffect(() => {
    startWatcher(() => setPayload(buildPayload()));
  }, []);

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }
    if (key.tab) {
      setNav((current) => nextTab(current));
      return;
    }
    if (nav.tabIndex === 1 && key.rightArrow) {
      setNav((current) => nextHistoricoView(current));
    }
    if (nav.tabIndex === 1 && key.leftArrow) {
      setNav((current) => prevHistoricoView(current));
    }
  });

  const activeTab = TABS[nav.tabIndex];
  const activeBlock = payload.blocks.find((block) => block.isActive) ?? null;

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(LogoView, null),
    React.createElement(Text, { dimColor: true }, 'Prismly — uso e custo do Claude Code'),
    React.createElement(
      Box,
      { flexDirection: 'row', marginY: 1 },
      ...TABS.map((tab, index) =>
        React.createElement(
          Text,
          { key: tab, color: index === nav.tabIndex ? 'magenta' : undefined, bold: index === nav.tabIndex },
          `  ${tabLabel(tab)}  `,
        ),
      ),
    ),
    activeTab === 'aoVivo' ? React.createElement(AoVivo, { block: activeBlock }) : null,
    activeTab === 'historico'
      ? React.createElement(Historico, { aggregated: payload.aggregated, view: HISTORICO_VIEWS[nav.historicoViewIndex] })
      : null,
    activeTab === 'baixarApp' ? React.createElement(BaixarApp, null) : null,
    React.createElement(Text, { dimColor: true }, '\nTab: trocar aba · setas: navegar Histórico · q: sair'),
  );
}

export function startApp(): void {
  render(React.createElement(App));
}
