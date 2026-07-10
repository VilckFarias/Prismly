const BLOCK_DURATION_MS = 5 * 60 * 60 * 1000;

function floorToHour(date) {
  const floored = new Date(date.getTime());
  floored.setUTCMinutes(0, 0, 0);
  return floored;
}

function createBlock(startTime) {
  return {
    start: floorToHour(startTime).toISOString(),
    lastActivity: startTime.toISOString(),
    isActive: false,
    end: null,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 0,
    count: 0,
  };
}

function addToBlock(block, record, recordTime) {
  block.inputTokens += record.inputTokens;
  block.outputTokens += record.outputTokens;
  block.cacheCreationTokens += record.cacheCreationTokens;
  block.cacheReadTokens += record.cacheReadTokens;
  block.cost += record.cost;
  block.count += 1;
  block.lastActivity = recordTime.toISOString();
}

// Um bloco cobre uma janela rolante de 5h (o limite de uso do Claude Code
// funciona assim publicamente). Um registro abre um bloco novo se: (a) já
// passou o gap de inatividade (>= 5h desde a última atividade do bloco), ou
// (b) o bloco atual já ultrapassou 5h desde o próprio início, mesmo com uso
// contínuo. As duas condições são checadas separadamente porque cobrem
// situações diferentes: uso esporádico com buracos grandes vs. uso contínuo
// que estoura a janela.
export function computeBlocks(records, { now = new Date(), blockDurationMs = BLOCK_DURATION_MS } = {}) {
  if (records.length === 0) return [];

  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const blocks = [];
  let currentBlock = null;

  for (const record of sorted) {
    const recordTime = new Date(record.timestamp);

    const blockExpired =
      currentBlock &&
      recordTime.getTime() - new Date(currentBlock.start).getTime() >= blockDurationMs;
    const gapExceeded =
      currentBlock &&
      recordTime.getTime() - new Date(currentBlock.lastActivity).getTime() >= blockDurationMs;

    if (!currentBlock || blockExpired || gapExceeded) {
      currentBlock = createBlock(recordTime);
      blocks.push(currentBlock);
    }

    addToBlock(currentBlock, record, recordTime);
  }

  const nowMs = now.getTime();
  for (const block of blocks) {
    const startMs = new Date(block.start).getTime();
    block.isActive = nowMs < startMs + blockDurationMs;
    block.end = block.isActive
      ? new Date(startMs + blockDurationMs).toISOString()
      : block.lastActivity;
    delete block.lastActivity;
  }

  return blocks;
}
