import type { UsageRecord, SessionBlock } from './types.ts';

const BLOCK_DURATION_MS = 5 * 60 * 60 * 1000;

interface BlockInProgress extends SessionBlock {
  lastActivity: string;
}

function floorToHour(date: Date): Date {
  const floored = new Date(date.getTime());
  floored.setUTCMinutes(0, 0, 0);
  return floored;
}

function createBlock(startTime: Date): BlockInProgress {
  return {
    start: floorToHour(startTime).toISOString(),
    lastActivity: startTime.toISOString(),
    isActive: false,
    end: '',
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 0,
    count: 0,
  };
}

function addToBlock(block: BlockInProgress, record: UsageRecord, recordTime: Date): void {
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
export function computeBlocks(
  records: UsageRecord[],
  { now = new Date(), blockDurationMs = BLOCK_DURATION_MS }: { now?: Date; blockDurationMs?: number } = {},
): SessionBlock[] {
  if (records.length === 0) return [];

  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const blocks: BlockInProgress[] = [];
  let currentBlock: BlockInProgress | null = null;

  for (const record of sorted) {
    const recordTime = new Date(record.timestamp);

    const blockExpired =
      currentBlock !== null &&
      recordTime.getTime() - new Date(currentBlock.start).getTime() >= blockDurationMs;
    const gapExceeded =
      currentBlock !== null &&
      recordTime.getTime() - new Date(currentBlock.lastActivity).getTime() >= blockDurationMs;

    if (currentBlock === null || blockExpired || gapExceeded) {
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
  }

  return blocks.map(({ lastActivity, ...rest }) => rest);
}
