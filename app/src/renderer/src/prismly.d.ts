import type { CurrencySettings, SavedTheme, UsagePayload, WindowSettings } from '../../shared/types';

declare global {
  interface Window {
    prismly: {
      onUsageUpdate(callback: (payload: UsagePayload) => void): () => void;
      hidePopup(): void;
      refresh(): void;
      getTheme(): Promise<SavedTheme>;
      setTheme(theme: SavedTheme): void;
      getCurrency(): Promise<CurrencySettings>;
      setCurrency(selected: CurrencySettings['selected']): void;
      getWindowSettings(): Promise<WindowSettings>;
      setAlwaysOnTop(value: boolean): void;
    };
  }
}

export {};
