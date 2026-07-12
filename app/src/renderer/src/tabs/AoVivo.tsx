import type { JSX } from 'react';
import type { SessionBlock } from '../../../shared/types';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function AoVivo({ blocks }: { blocks: SessionBlock[] }): JSX.Element {
  const activeBlock = blocks.find((block) => block.isActive) ?? null;

  if (!activeBlock) {
    return <p>Nenhum bloco de sessão ativo no momento.</p>;
  }

  return (
    <section>
      <h2>Bloco atual</h2>
      <p>Início: {formatTime(activeBlock.start)}</p>
      <p>Termina às: {formatTime(activeBlock.end)}</p>
      <p>Tokens de entrada: {formatNumber(activeBlock.inputTokens)}</p>
      <p>Tokens de saída: {formatNumber(activeBlock.outputTokens)}</p>
      <p>Custo acumulado no bloco: {formatCost(activeBlock.cost)}</p>
    </section>
  );
}
