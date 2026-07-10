export interface UsageBucket {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
  count: number;
}

export interface AggregatedUsage {
  byDay: Record<string, UsageBucket>;
  byModel: Record<string, UsageBucket>;
  byProject: Record<string, UsageBucket>;
  totals: UsageBucket;
}

export interface SessionBlock {
  start: string;
  end: string;
  isActive: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
  count: number;
}

export interface UsagePayload {
  aggregated: AggregatedUsage;
  blocks: SessionBlock[];
}
