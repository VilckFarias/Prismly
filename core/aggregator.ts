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

function localDayKey(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mondayKey(timestamp: string): string {
  const date = new Date(timestamp.slice(0, 10) + 'T00:00:00');
  const day = date.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

export function aggregateUsage(records: UsageRecord[]): AggregatedUsage {
  const byDay = groupBy(records, (record) => localDayKey(record.timestamp));
  const byWeek = groupBy(records, (record) => mondayKey(record.timestamp));
  const byMonth = groupBy(records, (record) => record.timestamp.slice(0, 7));
  const byModel = groupBy(records, (record) => record.model);
  const byProject = groupBy(records, (record) => record.project);

  const totals = createEmptyBucket();
  for (const record of records) addRecord(totals, record);

  return { byDay, byWeek, byMonth, byModel, byProject, totals };
}
