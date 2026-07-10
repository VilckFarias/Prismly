import type { JSX } from 'react';
import type { AggregatedUsage, UsageBucket } from '../../../shared/types';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function Table({ title, rows }: { title: string; rows: [string, UsageBucket][] }): JSX.Element {
  return (
    <section>
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Chave</th>
            <th>Tokens entrada</th>
            <th>Tokens saída</th>
            <th>Cache escrita</th>
            <th>Cache leitura</th>
            <th>Custo (USD)</th>
            <th>Registros</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, bucket]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{formatNumber(bucket.inputTokens)}</td>
              <td>{formatNumber(bucket.outputTokens)}</td>
              <td>{formatNumber(bucket.cacheCreationTokens)}</td>
              <td>{formatNumber(bucket.cacheReadTokens)}</td>
              <td>{formatCost(bucket.cost)}</td>
              <td>{bucket.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Historico({ aggregated }: { aggregated: AggregatedUsage }): JSX.Element {
  const byDayRows = Object.entries(aggregated.byDay).sort(([a], [b]) => a.localeCompare(b));
  const byModelRows = Object.entries(aggregated.byModel).sort(([, a], [, b]) => b.cost - a.cost);
  const byProjectRows = Object.entries(aggregated.byProject).sort(([, a], [, b]) => b.cost - a.cost);

  return (
    <div>
      <Table title="Por dia" rows={byDayRows} />
      <Table title="Por modelo" rows={byModelRows} />
      <Table title="Por projeto" rows={byProjectRows} />
    </div>
  );
}
