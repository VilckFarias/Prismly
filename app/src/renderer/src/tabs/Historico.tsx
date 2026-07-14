import { useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { AggregatedUsage, UsageBucket } from '../../../shared/types';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function formatWeekLabel(mondayKey: string): string {
  const monday = new Date(mondayKey + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date): string =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(monday)} - ${fmt(sunday)}`;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return `${MONTH_NAMES[Number(month) - 1]}/${year}`;
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

function pillStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    fontSize: 11,
    padding: '3px 10px',
    borderRadius: 12,
    border: 'none',
    background: active ? '#4f9eff' : '#242424',
    color: disabled ? '#555' : active ? '#fff' : '#999',
    cursor: disabled ? 'default' : 'pointer',
  };
}

type Granularity = 'dia' | 'semana' | 'mensal';

export function Historico({ aggregated }: { aggregated: AggregatedUsage }): JSX.Element {
  const [granularity, setGranularity] = useState<Granularity>('dia');

  const byDayRows = Object.entries(aggregated.byDay).sort(([a], [b]) => a.localeCompare(b));
  const byWeekRows: [string, UsageBucket][] = Object.entries(aggregated.byWeek)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => [formatWeekLabel(key), bucket]);
  const byMonthRows: [string, UsageBucket][] = Object.entries(aggregated.byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => [formatMonthLabel(key), bucket]);
  const byModelRows = Object.entries(aggregated.byModel).sort(([, a], [, b]) => b.cost - a.cost);
  const byProjectRows = Object.entries(aggregated.byProject).sort(([, a], [, b]) => b.cost - a.cost);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        <button
          onClick={() => setGranularity('dia')}
          disabled={granularity === 'dia'}
          style={pillStyle(granularity === 'dia', false)}
        >
          Dia
        </button>
        <button
          onClick={() => setGranularity('semana')}
          disabled={granularity === 'semana'}
          style={pillStyle(granularity === 'semana', false)}
        >
          Semana
        </button>
        <button
          onClick={() => setGranularity('mensal')}
          disabled={granularity === 'mensal'}
          style={pillStyle(granularity === 'mensal', false)}
        >
          Mensal
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {granularity === 'dia' && <CardList title="Por dia" rows={byDayRows} />}
        {granularity === 'semana' && <CardList title="Por semana" rows={byWeekRows} />}
        {granularity === 'mensal' && <CardList title="Por mês" rows={byMonthRows} />}
        <CardList title="Por modelo" rows={byModelRows} />
        <CardList title="Por projeto" rows={byProjectRows} />
      </div>
    </div>
  );
}
