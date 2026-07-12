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
): Record<string, string | number>[] {
  const entries = Object.entries(groups);

  if (sortBy === 'key') {
    entries.sort(([a], [b]) => a.localeCompare(b));
  } else {
    entries.sort(([, a], [, b]) => b.cost - a.cost);
  }

  return entries.map(([key, bucket]) => ({
    [keyLabel]: key,
    'Tokens entrada': formatNumber(bucket.inputTokens),
    'Tokens saída': formatNumber(bucket.outputTokens),
    'Cache escrita': formatNumber(bucket.cacheCreationTokens),
    'Cache leitura': formatNumber(bucket.cacheReadTokens),
    'Custo (USD)': formatCost(bucket.cost),
    Registros: bucket.count,
  }));
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

  console.log('\n--- Por modelo ---');
  console.table(toRows(byModel, 'Modelo'));

  console.log('\n--- Por projeto ---');
  console.table(toRows(byProject, 'Projeto'));

  console.log('\n--- Por dia ---');
  console.table(toRows(byDay, 'Dia', 'key'));
}

run();
