interface PricedRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
  cacheReadTokens: number;
}

interface ModelPricing {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

// USD per 1M tokens, sourced from https://platform.claude.com/docs/en/docs/about-claude/pricing
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-5': { input: 2, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2, output: 10 },
  'claude-sonnet-4-6': { input: 3, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3, output: 15 },
  'claude-opus-4-8': { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5, output: 25 },
  'claude-opus-4-7': { input: 5, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5, output: 25 },
  'claude-haiku-4-5-20251001': { input: 1, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1, output: 5 },
};

const TOKENS_PER_MILLION = 1_000_000;

export function calculateCost(record: PricedRecord): number {
  const pricing = MODEL_PRICING[record.model];
  if (!pricing) return 0;

  const cost =
    record.inputTokens * pricing.input +
    record.cacheCreation5mTokens * pricing.cacheWrite5m +
    record.cacheCreation1hTokens * pricing.cacheWrite1h +
    record.cacheReadTokens * pricing.cacheRead +
    record.outputTokens * pricing.output;

  return cost / TOKENS_PER_MILLION;
}
