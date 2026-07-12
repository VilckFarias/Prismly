import type { JSX } from 'react';
import type { AggregatedUsage, UsageBucket } from '../../../shared/types';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function CardList({ title, rows }: { title: string; rows: [string, UsageBucket][] }): JSX.Element {
  return (
    <section>
      <h2>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(([key, bucket]) => (
          <div key={key} style={{ background: '#242424', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{key}</strong>
              <span style={{ color: '#4f9eff', fontWeight: 'bold' }}>{formatCost(bucket.cost)}</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '2px 12px',
                marginTop: 6,
                fontSize: 12,
                color: '#999',
              }}
            >
              <span>Tokens entrada: {formatNumber(bucket.inputTokens)}</span>
              <span>Tokens saída: {formatNumber(bucket.outputTokens)}</span>
              <span>Cache escrita: {formatNumber(bucket.cacheCreationTokens)}</span>
              <span>Cache leitura: {formatNumber(bucket.cacheReadTokens)}</span>
              <span>Registros: {bucket.count}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Historico({ aggregated }: { aggregated: AggregatedUsage }): JSX.Element {
  const byDayRows = Object.entries(aggregated.byDay).sort(([a], [b]) => a.localeCompare(b));
  const byModelRows = Object.entries(aggregated.byModel).sort(([, a], [, b]) => b.cost - a.cost);
  const byProjectRows = Object.entries(aggregated.byProject).sort(([, a], [, b]) => b.cost - a.cost);

  return (
    <div>
      <CardList title="Por dia" rows={byDayRows} />
      <CardList title="Por modelo" rows={byModelRows} />
      <CardList title="Por projeto" rows={byProjectRows} />
    </div>
  );
}
