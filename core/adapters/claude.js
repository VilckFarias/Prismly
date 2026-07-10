import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

export function findJsonlFiles(rootDir) {
  let entries;
  try {
    entries = readdirSync(rootDir, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => join(entry.parentPath, entry.name));
}

function getProjectName(filePath) {
  return relative(PROJECTS_DIR, filePath).split(sep)[0];
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// A single API response can be split across multiple "assistant" lines (e.g.
// a thinking block and a text block written separately), each with its own
// uuid but sharing one message.id. input/cache tokens are identical across
// those lines, but output_tokens is the *cumulative* count so far and grows
// with each line — only the last line for a given message.id has the final
// total, so later occurrences must overwrite earlier ones, not be skipped.
// Duplicates also show up across different session files (resumed/forked
// sessions carry over prior history), so this must be tracked globally
// across every file processed, not per file.
export function collectClaudeUsage() {
  const recordsByMessageId = new Map();

  for (const filePath of findJsonlFiles(PROJECTS_DIR)) {
    const project = getProjectName(filePath);
    const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);

    for (const line of lines) {
      const entry = parseLine(line);
      if (!entry || entry.type !== 'assistant') continue;

      const messageId = entry.message?.id;
      const usage = entry.message?.usage;
      if (!messageId || !usage) continue;

      // Cache writes have different prices for the 5-minute and 1-hour TTL.
      // When the breakdown is present, trust it over the aggregate field —
      // otherwise fall back to treating it all as 5-minute (the default TTL).
      const cacheCreation5mTokens =
        usage.cache_creation?.ephemeral_5m_input_tokens ?? usage.cache_creation_input_tokens ?? 0;
      const cacheCreation1hTokens = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;

      recordsByMessageId.set(messageId, {
        source: 'claude',
        timestamp: entry.timestamp,
        model: entry.message.model,
        project,
        sessionId: entry.sessionId,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheCreationTokens: cacheCreation5mTokens + cacheCreation1hTokens,
        cacheCreation5mTokens,
        cacheCreation1hTokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      });
    }
  }

  return [...recordsByMessageId.values()];
}
