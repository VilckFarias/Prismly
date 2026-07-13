import type { UsagePayload } from '../../shared/types';

declare global {
  interface Window {
    prismly: {
      onUsageUpdate(callback: (payload: UsagePayload) => void): () => void;
      hidePopup(): void;
      refresh(): void;
    };
  }
}

export {};
