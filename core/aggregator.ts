import type { UsageRecord, UsageBucket, AggregatedUsage } from './types.ts';

function createEmptyBucket(): UsageBucket {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 0,
    count: 0,
  };
}

function addRecord(bucket: UsageBucket, record: UsageRecord): void {
  bucket.inputTokens += record.inputTokens;
  bucket.outputTokens += record.outputTokens;
  bucket.cacheCreationTokens += record.cacheCreationTokens;
  bucket.cacheReadTokens += record.cacheReadTokens;
  bucket.cost += record.cost;
  bucket.count += 1;
}

function groupBy(
  records: UsageRecord[],
  keyFn: (record: UsageRecord) => string,
): Record<string, UsageBucket> {
  const groups: Record<string, UsageBucket> = {};
  for (const record of records) {
    const key = keyFn(record);
    if (!groups[key]) groups[key] = createEmptyBucket();
    addRecord(groups[key], record);
  }
  return groups;
}

export function aggregateUsage(records: UsageRecord[]): AggregatedUsage {
  const byDay = groupBy(records, (record) => record.timestamp.slice(0, 10));
  const byModel = groupBy(records, (record) => record.model);
  const byProject = groupBy(records, (record) => record.project);

  const totals = createEmptyBucket();
  for (const record of records) addRecord(totals, record);

  return { byDay, byModel, byProject, totals };
}
