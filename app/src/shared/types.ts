import type { AggregatedUsage, SessionBlock } from '../../../core/types';

export type { UsageBucket, AggregatedUsage, SessionBlock } from '../../../core/types';

export interface UsagePayload {
  aggregated: AggregatedUsage;
  blocks: SessionBlock[];
}

export interface ThemeColors {
  bg: string;
  text: string;
  cardBg: string;
}

export interface SavedTheme {
  preset: string;
  colors: ThemeColors;
}
