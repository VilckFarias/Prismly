import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { UsageBucket, UsagePayload } from '../../shared/types';
import { Historico } from './tabs/Historico';
import { AoVivo } from './tabs/AoVivo';

type View = 'ao-vivo' | 'historico' | 'configuracao';

const dragHandleStyle = {
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingLeft: 12,
  paddingRight: 6,
  fontSize: 12,
  color: '#999',
  WebkitAppRegion: 'drag',
  flexShrink: 0,
} as const;

const windowButtonStyle = {
  width: 18,
  height: 18,
  border: 'none',
  background: '#2a2a2a',
  color: '#ccc',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
  WebkitAppRegion: 'no-drag',
} as const;

function navButtonStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    flex: 1,
    textAlign: 'center',
    padding: '8px 0',
    fontSize: 12,
    fontWeight: active ? 'bold' : 'normal',
    color: disabled ? '#555' : active ? '#fff' : '#999',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #4f9eff' : '2px solid transparent',
    cursor: disabled ? 'default' : 'pointer',
  };
}

export function App(): JSX.Element {
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [view, setView] = useState<View>('ao-vivo');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    return window.prismly.onUsageUpdate((newPayload) => {
      setPayload(newPayload);
      setLastUpdated(new Date());
      setRefreshing(false);
    });
  }, []);

  const handleRefresh = (): void => {
    setRefreshing(true);
    window.prismly.refresh();
  };

  if (!payload) {
    return <p>Carregando dados de uso...</p>;
  }

  if (payload.aggregated.totals.count === 0) {
    return <p>Nenhum uso encontrado ainda.</p>;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const today: UsageBucket | undefined = payload.aggregated.byDay[todayKey];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={dragHandleStyle}>
        <span>Prismly</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={windowButtonStyle} onClick={() => window.prismly.hidePopup()}>
            —
          </button>
          <button style={windowButtonStyle} onClick={() => window.prismly.hidePopup()}>
            ×
          </button>
        </div>
      </div>
      <nav style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid #2a2a2a' }}>
        <button
          onClick={() => setView('ao-vivo')}
          disabled={view === 'ao-vivo'}
          style={navButtonStyle(view === 'ao-vivo', false)}
        >
          Ao vivo
        </button>
        <button
          onClick={() => setView('historico')}
          disabled={view === 'historico'}
          style={navButtonStyle(view === 'historico', false)}
        >
          Histórico
        </button>
        <button disabled style={navButtonStyle(false, true)}>
          Configuração
        </button>
      </nav>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {view === 'ao-vivo' && (
          <AoVivo
            blocks={payload.blocks}
            today={today}
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        )}
        {view === 'historico' && <Historico aggregated={payload.aggregated} />}
      </div>
    </div>
  );
}
