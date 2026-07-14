import type { ThemeColors } from '../../shared/types';

export interface ThemePreset {
  name: string;
  label: string;
  colors: ThemeColors;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'escuro',
    label: 'Escuro',
    colors: { bg: '#1b1b1f', text: '#dfdfd7', cardBg: '#242424' },
  },
  {
    name: 'escuro-azulado',
    label: 'Escuro Azulado',
    colors: { bg: '#10131c', text: '#dce6f5', cardBg: '#1c2536' },
  },
  {
    name: 'escuro-verde',
    label: 'Escuro Verde',
    colors: { bg: '#0d1410', text: '#b9f6ca', cardBg: '#16241a' },
  },
  {
    name: 'meia-noite',
    label: 'Meia-noite',
    colors: { bg: '#14102a', text: '#e4defa', cardBg: '#221c3d' },
  },
  {
    name: 'claro',
    label: 'Claro',
    colors: { bg: '#f5f5f5', text: '#1b1b1f', cardBg: '#ffffff' },
  },
  {
    name: 'claro-quente',
    label: 'Claro Quente',
    colors: { bg: '#fdf6e3', text: '#3a3226', cardBg: '#fffaf0' },
  },
  {
    name: 'alto-contraste',
    label: 'Alto Contraste',
    colors: { bg: '#000000', text: '#ffffff', cardBg: '#1a1a1a' },
  },
];

export function applyTheme(colors: ThemeColors): void {
  document.documentElement.style.setProperty('--theme-bg', colors.bg);
  document.documentElement.style.setProperty('--theme-text', colors.text);
  document.documentElement.style.setProperty('--theme-card-bg', colors.cardBg);
}
