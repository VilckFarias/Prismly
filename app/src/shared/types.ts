import type { AggregatedUsage, SessionBlock } from '../../../core/types';

export type { UsageBucket, AggregatedUsage, SessionBlock } from '../../../core/types';

export interface UsagePayload {
  aggregated: AggregatedUsage;
  blocks: SessionBlock[];
}
