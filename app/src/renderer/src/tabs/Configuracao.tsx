import type { CSSProperties, JSX } from 'react';
import type { SavedTheme, ThemeColors } from '../../../shared/types';
import { THEME_PRESETS } from '../themes';

function swatchButtonStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    border: active ? '2px solid #4f9eff' : '2px solid transparent',
    background: 'var(--theme-card-bg)',
    cursor: 'pointer',
    font: 'inherit',
  };
}

function Preview({ colors }: { colors: ThemeColors }): JSX.Element {
  return (
    <div
      style={{
        width: 48,
        height: 32,
        borderRadius: 4,
        background: colors.bg,
        display: 'flex',
        alignItems: 'flex-end',
        padding: 4,
      }}
    >
      <div style={{ width: '100%', height: 12, borderRadius: 2, background: colors.cardBg }} />
    </div>
  );
}

function colorRowStyle(): CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 12,
    color: '#999',
  };
}

export function Configuracao({
  currentTheme,
  onThemeChange,
}: {
  currentTheme: SavedTheme;
  onThemeChange: (theme: SavedTheme) => void;
}): JSX.Element {
  const isCustom = currentTheme.preset === 'personalizado';

  function updateCustomColor(key: keyof ThemeColors, value: string): void {
    onThemeChange({ preset: 'personalizado', colors: { ...currentTheme.colors, [key]: value } });
  }

  return (
    <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
      <h2 style={{ fontSize: 13, marginBottom: 10 }}>Tema</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {THEME_PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => onThemeChange({ preset: preset.name, colors: preset.colors })}
            style={swatchButtonStyle(currentTheme.preset === preset.name)}
          >
            <Preview colors={preset.colors} />
            <span style={{ fontSize: 11, color: '#ccc' }}>{preset.label}</span>
          </button>
        ))}
        <button
          onClick={() => onThemeChange({ preset: 'personalizado', colors: currentTheme.colors })}
          style={swatchButtonStyle(isCustom)}
        >
          <Preview colors={currentTheme.colors} />
          <span style={{ fontSize: 11, color: '#ccc' }}>Personalizado</span>
        </button>
      </div>

      {isCustom && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={colorRowStyle()}>
            Fundo da tela
            <input
              type="color"
              value={currentTheme.colors.bg}
              onChange={(e) => updateCustomColor('bg', e.target.value)}
            />
          </label>
          <label style={colorRowStyle()}>
            Texto
            <input
              type="color"
              value={currentTheme.colors.text}
              onChange={(e) => updateCustomColor('text', e.target.value)}
            />
          </label>
          <label style={colorRowStyle()}>
            Fundo dos cards
            <input
              type="color"
              value={currentTheme.colors.cardBg}
              onChange={(e) => updateCustomColor('cardBg', e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
