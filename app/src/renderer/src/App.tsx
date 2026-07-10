import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { UsagePayload } from '../../shared/types';
import { Historico } from './tabs/Historico';
import { AoVivo } from './tabs/AoVivo';

type Tab = 'ao-vivo' | 'historico';

export function App(): JSX.Element {
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [tab, setTab] = useState<Tab>('ao-vivo');

  useEffect(() => {
    return window.prismly.onUsageUpdate(setPayload);
  }, []);

  if (!payload) {
    return <p>Carregando dados de uso...</p>;
  }

  if (payload.aggregated.totals.count === 0) {
    return <p>Nenhum uso encontrado ainda.</p>;
  }

  return (
    <div>
      <nav>
        <button onClick={() => setTab('ao-vivo')} disabled={tab === 'ao-vivo'}>
          Ao vivo
        </button>
        <button onClick={() => setTab('historico')} disabled={tab === 'historico'}>
          Histórico
        </button>
      </nav>
      {tab === 'ao-vivo' ? <AoVivo blocks={payload.blocks} /> : <Historico aggregated={payload.aggregated} />}
    </div>
  );
}
