function createEmptyBucket() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 0,
    count: 0,
  };
}

function addRecord(bucket, record) {
  bucket.inputTokens += record.inputTokens;
  bucket.outputTokens += record.outputTokens;
  bucket.cacheCreationTokens += record.cacheCreationTokens;
  bucket.cacheReadTokens += record.cacheReadTokens;
  bucket.cost += record.cost;
  bucket.count += 1;
}

function groupBy(records, keyFn) {
  const groups = {};
  for (const record of records) {
    const key = keyFn(record);
    if (!groups[key]) groups[key] = createEmptyBucket();
    addRecord(groups[key], record);
  }
  return groups;
}

export function aggregateUsage(records) {
  const byDay = groupBy(records, (record) => record.timestamp.slice(0, 10));
  const byModel = groupBy(records, (record) => record.model);
  const byProject = groupBy(records, (record) => record.project);

  const totals = createEmptyBucket();
  for (const record of records) addRecord(totals, record);

  return { byDay, byModel, byProject, totals };
}
