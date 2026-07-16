#!/usr/bin/env node
import { collectClaudeUsage } from './core/adapters/claude.ts';
import { calculateCost } from './core/pricing.ts';
import { aggregateUsage } from './core/aggregator.ts';
import type { UsageBucket } from './core/types.ts';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function toRows(
  groups: Record<string, UsageBucket>,
  keyLabel: string,
  sortBy?: 'key' | 'cost',
): { headers: string[]; rows: string[][] } {
  const entries = Object.entries(groups);

  if (sortBy === 'key') {
    entries.sort(([a], [b]) => a.localeCompare(b));
  } else {
    entries.sort(([, a], [, b]) => b.cost - a.cost);
  }

  return {
    headers: [keyLabel, 'Tokens entrada', 'Tokens saída', 'Cache escrita', 'Cache leitura', 'Custo (USD)', 'Registros'],
    rows: entries.map(([key, bucket]) => [
      key,
      formatNumber(bucket.inputTokens),
      formatNumber(bucket.outputTokens),
      formatNumber(bucket.cacheCreationTokens),
      formatNumber(bucket.cacheReadTokens),
      formatCost(bucket.cost),
      String(bucket.count),
    ]),
  };
}

// Desenha uma tabela em texto puro, sem depender de nenhuma biblioteca externa
// (mantém o core/ com zero dependências em runtime). Convenção: a primeira
// coluna (rótulo da linha) fica alinhada à esquerda, o resto à direita --
// bate com o formato de todas as tabelas deste relatório (rótulo + números).
function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, col) =>
    Math.max(header.length, ...rows.map((row) => row[col].length)),
  );

  function formatRow(cells: string[]): string {
    const padded = cells.map((cell, col) => (col === 0 ? cell.padEnd(widths[col]) : cell.padStart(widths[col])));
    return `│ ${padded.join(' │ ')} │`;
  }

  function border(left: string, mid: string, right: string): string {
    return left + widths.map((w) => '─'.repeat(w + 2)).join(mid) + right;
  }

  return [
    border('┌', '┬', '┐'),
    formatRow(headers),
    border('├', '┼', '┤'),
    ...rows.map(formatRow),
    border('└', '┴', '┘'),
  ].join('\n');
}

function run(): void {
  const records = collectClaudeUsage().map((record) => ({
    ...record,
    cost: calculateCost(record),
  }));

  const { byDay, byModel, byProject, totals } = aggregateUsage(records);
  const days = Object.keys(byDay).sort();

  console.log('=== Prismly — Relatório de Uso do Claude Code ===\n');
  console.log(`Registros processados: ${formatNumber(totals.count)}`);
  console.log(`Período: ${days[0]} a ${days.at(-1)}`);
  console.log(`Custo total: ${formatCost(totals.cost)}`);
  console.log(`Tokens de entrada: ${formatNumber(totals.inputTokens)}`);
  console.log(`Tokens de saída: ${formatNumber(totals.outputTokens)}`);
  console.log(`Tokens de cache (escrita): ${formatNumber(totals.cacheCreationTokens)}`);
  console.log(`Tokens de cache (leitura): ${formatNumber(totals.cacheReadTokens)}`);

  const byModelTable = toRows(byModel, 'Modelo');
  console.log('\n--- Por modelo ---');
  console.log(renderTable(byModelTable.headers, byModelTable.rows));

  const byProjectTable = toRows(byProject, 'Projeto');
  console.log('\n--- Por projeto ---');
  console.log(renderTable(byProjectTable.headers, byProjectTable.rows));

  const byDayTable = toRows(byDay, 'Dia', 'key');
  console.log('\n--- Por dia ---');
  console.log(renderTable(byDayTable.headers, byDayTable.rows));
}

run();
