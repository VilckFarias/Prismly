import React from 'react';
import { Box, Text } from 'ink';
import type { SessionBlock } from '../../core/types.ts';
import { formatCost, formatNumber, formatDuration } from '../format.ts';
import { renderProgressBar } from '../progressBar.ts';

const BLOCK_DURATION_MS = 5 * 60 * 60 * 1000;

export function AoVivo({ block }: { block: SessionBlock | null }): React.ReactElement {
  if (!block) {
    return React.createElement(Text, null, 'Nenhum bloco de sessão ativo no momento.');
  }

  const endMs = new Date(block.end).getTime();
  const remainingMs = Math.max(0, endMs - Date.now());
  const elapsedFraction = 1 - remainingMs / BLOCK_DURATION_MS;

  return React.createElement(
    Box,
    { flexDirection: 'column' },
    React.createElement(Text, null, `Bloco ativo desde ${new Date(block.start).toLocaleTimeString('pt-BR')}`),
    React.createElement(Text, { color: 'magenta' }, renderProgressBar(elapsedFraction, 40)),
    React.createElement(Text, null, `Tempo restante: ${formatDuration(remainingMs)}`),
    React.createElement(Text, null, `Custo do bloco: ${formatCost(block.cost)}`),
    React.createElement(Text, null, `Tokens de entrada: ${formatNumber(block.inputTokens)}`),
    React.createElement(Text, null, `Tokens de saída: ${formatNumber(block.outputTokens)}`),
  );
}
