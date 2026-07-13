import type { JSX } from 'react';
import type { SessionBlock, UsageBucket } from '../../../shared/types';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatRemaining(endIso: string): string {
  const remainingMs = new Date(endIso).getTime() - Date.now();
  if (remainingMs <= 0) return '0min';
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
}

function percentElapsed(block: SessionBlock): number {
  const start = new Date(block.start).getTime();
  const end = new Date(block.end).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  const percent = ((now - start) / (end - start)) * 100;
  return Math.min(100, Math.max(0, percent));
}

interface AoVivoProps {
  blocks: SessionBlock[];
  today: UsageBucket | undefined;
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}

export function AoVivo({ blocks, today, lastUpdated, refreshing, onRefresh }: AoVivoProps): JSX.Element {
  const activeBlock = blocks.find((block) => block.isActive) ?? null;

  return (
    <section style={{ padding: 14 }}>
      {activeBlock ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <strong style={{ fontSize: 14 }}>Sessão atual</strong>
            <span style={{ fontSize: 11, color: '#999' }}>reinicia em {formatRemaining(activeBlock.end)}</span>
          </div>
          <div style={{ background: '#333', borderRadius: 5, height: 8, marginBottom: 8 }}>
            <div
              style={{
                background: 'linear-gradient(90deg, #4f9eff, #7ab8ff)',
                width: `${percentElapsed(activeBlock)}%`,
                height: 8,
                borderRadius: 5,
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#bbb' }}>
            {formatCost(activeBlock.cost)} · {formatNumber(activeBlock.inputTokens + activeBlock.outputTokens)} tokens
            · {activeBlock.count} registros
          </div>
        </>
      ) : (
        <p>Nenhum bloco de sessão ativo no momento.</p>
      )}

      {today && (
        <div style={{ marginTop: 14, fontSize: 12, color: '#999' }}>
          Hoje: {formatCost(today.cost)} · {today.count} registros
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <span style={{ fontSize: 11, color: '#777' }}>
          Atualizado às {lastUpdated ? formatTime(lastUpdated) : '—'}
        </span>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            background: 'none',
            border: 'none',
            color: refreshing ? '#666' : '#4f9eff',
            fontSize: 12,
            cursor: refreshing ? 'default' : 'pointer',
          }}
        >
          {refreshing ? '↻ Atualizando...' : '↻ Atualizar'}
        </button>
      </div>
    </section>
  );
}
