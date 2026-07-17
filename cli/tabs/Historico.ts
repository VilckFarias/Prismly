import React from 'react';
import { Box, Text } from 'ink';
import type { AggregatedUsage, UsageBucket } from '../../core/types.ts';
import { formatCost, formatNumber } from '../format.ts';
import { historicoViewLabel, type HistoricoView } from '../keybindings.ts';

function bucketsFor(aggregated: AggregatedUsage, view: HistoricoView): Record<string, UsageBucket> {
  if (view === 'dia') return aggregated.byDay;
  if (view === 'semana') return aggregated.byWeek;
  if (view === 'mes') return aggregated.byMonth;
  if (view === 'modelo') return aggregated.byModel;
  return aggregated.byProject;
}

export function Historico({
  aggregated,
  view,
}: {
  aggregated: AggregatedUsage;
  view: HistoricoView;
}): React.ReactElement {
  const buckets = bucketsFor(aggregated, view);
  const entries = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) {
    return React.createElement(Text, null, 'Sem dados ainda.');
  }

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, { bold: true }, `< ${historicoViewLabel(view)} > (setas pra trocar)`),
    ...entries.map(([key, bucket]) =>
      React.createElement(
        Text,
        { key },
        `${key}: ${formatCost(bucket.cost)}  (${formatNumber(bucket.count)} registros)`,
      ),
    ),
  );
}
