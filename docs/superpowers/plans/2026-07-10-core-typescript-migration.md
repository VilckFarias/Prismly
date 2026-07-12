# Migração de core/ e do CLI para TypeScript — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar `core/` (adapters, aggregator, pricing, blocks) e o CLI (`index.js`) de JavaScript puro para TypeScript, eliminando os casts forçados e a duplicação de tipos entre `core/` e `app/`, sem quebrar o comportamento já validado por testes.

**Architecture:** `core/*.ts` roda nativamente no Node (v24, via type stripping — sem build step). Um novo `core/types.ts` centraliza os tipos de domínio (`RawUsageRecord`, `UsageRecord`, `UsageBucket`, `AggregatedUsage`, `SessionBlock`). `app/src/shared/types.ts` deixa de duplicar esses tipos, importando de `core/types.ts`. `app/src/main/index.ts` para de precisar de casts porque `aggregateUsage`/`computeBlocks` agora têm tipos de retorno reais.

**Tech Stack:** TypeScript (rodando via Node's native type stripping em `core/`+CLI, e via `electron-vite`/Vite em `app/`), `node:test`, Electron + React (inalterado nesta fase).

## Global Constraints

- `core/` (agora `.ts`): zero dependências externas em **runtime** — `@types/node` e `typescript` só entram como devDependencies (usadas apenas para checagem de tipos, nunca executadas/empacotadas).
- Identificadores de código em inglês; texto voltado ao usuário final em português.
- Nenhuma mudança de comportamento/lógica nesta migração — só tipos. Os 10 testes existentes devem continuar passando sem alterar suas asserções.
- **Extensões `.ts` explícitas são obrigatórias** em qualquer import relativo dentro de `core/*.ts` e em `index.ts` (o Node exige isso ao rodar `.ts` nativamente — não resolve extensão implicitamente como um bundler faria). Dentro de `app/` (bundlado pelo Vite), imports para `core/` continuam **sem** extensão, igual ao padrão já usado para `./watcher` — evita mexer nas opções de resolução de extensão dos tsconfigs do `app/`.
- `app/tsconfig.node.json` e `app/tsconfig.web.json` já usam `"composite": false` (fixado nas Tasks 7 e 10 do plano anterior) — não reverter isso.

---

### Task 1: Setup — dependências, `core/types.ts`, `tsconfig.json` raiz

**Files:**
- Modify: `package.json` (raiz)
- Create: `core/types.ts`
- Create: `tsconfig.json` (raiz)

**Interfaces:**
- Consumes: nada.
- Produces: `core/types.ts` exporta `RawUsageRecord`, `UsageRecord`, `UsageBucket`, `AggregatedUsage`, `SessionBlock` — usados por todas as tasks seguintes.

- [ ] **Step 1: Adicionar devDependencies no `package.json` raiz**

Editar `package.json`, adicionando (mantendo o resto do arquivo como está):

```json
{
  "name": "prismly",
  "version": "0.1.0",
  "description": "Reads local AI coding assistant usage logs and computes token usage/cost.",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "node --test core/**/*.test.js"
  },
  "license": "UNLICENSED",
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.7.0"
  }
}
```

(Os campos `main`/`scripts` mudam de `.js` para `.ts` na Task 6, depois que `index.ts` existir — não mude ainda.)

- [ ] **Step 2: Instalar as dependências**

Run: `npm install`
Expected: cria/atualiza `node_modules/` e `package-lock.json` na raiz, sem erros. (`node_modules/` já está no `.gitignore` da raiz.)

- [ ] **Step 3: Criar `core/types.ts`**

```ts
export interface RawUsageRecord {
  source: string;
  timestamp: string;
  model: string;
  project: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheCreation5mTokens: number;
  cacheCreation1hTokens: number;
  cacheReadTokens: number;
}

export interface UsageRecord {
  timestamp: string;
  model: string;
  project: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

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
```

Nota: `UsageRecord` é deliberadamente mais enxuto que `RawUsageRecord` — só os campos que `aggregateUsage`/`computeBlocks` realmente usam (sem `source`, `sessionId`, `cacheCreation5mTokens`, `cacheCreation1hTokens`). Isso é o que já bate com os fixtures dos testes existentes (que não incluem esses campos) e evita forçar testes a inventar dados que a função não usa. Objetos com mais campos (como os que vêm de `collectClaudeUsage` + `cost`) continuam batendo com `UsageRecord` normalmente — TypeScript permite passar um objeto com campos extras onde um tipo mais enxuto é esperado, desde que venha de uma variável (não um literal inline).

- [ ] **Step 4: Criar `tsconfig.json` na raiz**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true
  },
  "include": ["core/**/*.ts", "index.ts"]
}
```

Esse `tsconfig.json` é só para checagem de tipos (`tsc --noEmit`) — nunca gera arquivo, porque o Node roda o `.ts` original diretamente. `allowImportingTsExtensions` é necessário porque os imports dentro de `core/` vão usar extensão `.ts` explícita (exigência do Node, não do TypeScript) — essa opção só é permitida quando `noEmit` está ligado, o que já é o caso aqui.

- [ ] **Step 5: Adicionar o script `typecheck` no `package.json`**

Dentro de `"scripts"`, adicionar:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 6: Rodar o typecheck pra confirmar que compila (trivial nesse ponto)**

Run: `npm run typecheck`
Expected: sem erros (só `core/types.ts` existe até agora, sem nenhum arquivo `index.ts` ainda — o `include` vai reclamar se `index.ts` não existir ainda; se der erro `File 'index.ts' not found`, é esperado nesse ponto porque `index.ts` só é criado na Task 6. Se esse erro aparecer, confirme que é exatamente esse (arquivo não encontrado) e nada mais — é aceitável neste passo intermediário.)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json core/types.ts tsconfig.json
git commit -m "chore: set up TypeScript tooling for core/ and the CLI"
```

---

### Task 2: Migrar `core/pricing.js` → `core/pricing.ts`

**Files:**
- Move: `core/pricing.js` → `core/pricing.ts`
- Move: `core/pricing.test.js` → `core/pricing.test.ts`

**Interfaces:**
- Consumes: nada de `core/types.ts` (a função tem seu próprio tipo enxuto local — `pricing.ts` não precisa dos campos completos de `UsageRecord`).
- Produces: `calculateCost(record: { model, inputTokens, outputTokens, cacheCreation5mTokens, cacheCreation1hTokens, cacheReadTokens }): number` — mesma assinatura funcional de antes, agora tipada. Usado por `index.ts` (Task 6) e `app/src/main/index.ts` (Task 7).

- [ ] **Step 1: Mover os arquivos**

```bash
git mv core/pricing.js core/pricing.ts
git mv core/pricing.test.js core/pricing.test.ts
```

- [ ] **Step 2: Substituir o conteúdo de `core/pricing.ts`**

```ts
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
```

- [ ] **Step 3: Substituir o conteúdo de `core/pricing.test.ts`**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCost } from './pricing.ts';

test('calcula o custo somando cada faixa de preço do modelo', () => {
  const record = {
    model: 'claude-sonnet-5',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    cacheCreation5mTokens: 1_000_000,
    cacheCreation1hTokens: 1_000_000,
    cacheReadTokens: 1_000_000,
  };

  const cost = calculateCost(record);

  assert.equal(cost, 2 + 10 + 2.5 + 4 + 0.2);
});

test('retorna 0 para modelo desconhecido', () => {
  const cost = calculateCost({
    model: 'unknown-model',
    inputTokens: 1000,
    outputTokens: 0,
    cacheCreation5mTokens: 0,
    cacheCreation1hTokens: 0,
    cacheReadTokens: 0,
  });

  assert.equal(cost, 0);
});
```

(Só a extensão do import mudou de `'./pricing.js'` para `'./pricing.ts'` — asserções idênticas às de antes.)

- [ ] **Step 4: Rodar o teste**

Run: `node --test core/pricing.test.ts`
Expected: `# pass 2`, `# fail 0`.

- [ ] **Step 5: Rodar o typecheck**

Run: `npm run typecheck`
Expected: mesmo erro esperado de `index.ts` não existir ainda (Task 6) — nenhum outro erro relacionado a `pricing.ts`.

- [ ] **Step 6: Commit**

```bash
git add core/pricing.ts core/pricing.test.ts
git commit -m "refactor: migrate core/pricing to TypeScript"
```

---

### Task 3: Migrar `core/aggregator.js` → `core/aggregator.ts`

**Files:**
- Move: `core/aggregator.js` → `core/aggregator.ts`
- Move: `core/aggregator.test.js` → `core/aggregator.test.ts`

**Interfaces:**
- Consumes: `UsageRecord`, `UsageBucket`, `AggregatedUsage` de `core/types.ts` (Task 1).
- Produces: `aggregateUsage(records: UsageRecord[]): AggregatedUsage` — mesma assinatura funcional de antes, agora tipada. Usado por `index.ts` (Task 6) e `app/src/main/index.ts` (Task 7).

- [ ] **Step 1: Mover os arquivos**

```bash
git mv core/aggregator.js core/aggregator.ts
git mv core/aggregator.test.js core/aggregator.test.ts
```

- [ ] **Step 2: Substituir o conteúdo de `core/aggregator.ts`**

```ts
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
```

- [ ] **Step 3: Substituir o conteúdo de `core/aggregator.test.ts`**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUsage } from './aggregator.ts';
import type { UsageRecord } from './types.ts';

function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    timestamp: '2026-07-09T10:00:00.000Z',
    model: 'claude-sonnet-5',
    project: 'demo-project',
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 1,
    ...overrides,
  };
}

test('agrupa por dia, modelo e projeto, e soma os totais', () => {
  const records = [
    makeRecord(),
    makeRecord({
      timestamp: '2026-07-10T10:00:00.000Z',
      model: 'claude-opus-4-8',
      project: 'other-project',
      cost: 2,
    }),
  ];

  const { byDay, byModel, byProject, totals } = aggregateUsage(records);

  assert.deepEqual(Object.keys(byDay).sort(), ['2026-07-09', '2026-07-10']);
  assert.equal(byModel['claude-sonnet-5'].count, 1);
  assert.equal(byProject['other-project'].cost, 2);
  assert.equal(totals.count, 2);
  assert.equal(totals.cost, 3);
});
```

- [ ] **Step 4: Rodar o teste**

Run: `node --test core/aggregator.test.ts`
Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 5: Rodar o typecheck**

Run: `npm run typecheck`
Expected: mesmo erro esperado de `index.ts` (Task 6) — nenhum outro erro.

- [ ] **Step 6: Commit**

```bash
git add core/aggregator.ts core/aggregator.test.ts
git commit -m "refactor: migrate core/aggregator to TypeScript"
```

---

### Task 4: Migrar `core/blocks.js` → `core/blocks.ts`

**Files:**
- Move: `core/blocks.js` → `core/blocks.ts`
- Move: `core/blocks.test.js` → `core/blocks.test.ts`

**Interfaces:**
- Consumes: `UsageRecord`, `SessionBlock` de `core/types.ts` (Task 1).
- Produces: `computeBlocks(records: UsageRecord[], options?: { now?: Date; blockDurationMs?: number }): SessionBlock[]` — mesma assinatura funcional de antes, agora com tipo de retorno real (sem precisar de cast do lado do `app/`, resolvido na Task 7).

- [ ] **Step 1: Mover os arquivos**

```bash
git mv core/blocks.js core/blocks.ts
git mv core/blocks.test.js core/blocks.test.ts
```

- [ ] **Step 2: Substituir o conteúdo de `core/blocks.ts`**

```ts
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
```

Duas diferenças da versão JS, ambas cosméticas (sem mudança de comportamento observável, os testes abaixo confirmam):
- `end: ''` em vez de `end: null` no estado inicial do bloco (antes de ser finalizado) — `SessionBlock.end` é `string`, então usar `''` como placeholder é mais fiel ao tipo do que `null`. `end` sempre é sobrescrito antes do bloco ser retornado, então isso nunca aparece no resultado final.
- Em vez de `delete block.lastActivity` (mutação), o campo interno `lastActivity` é removido via desestruturação no `.map(({ lastActivity, ...rest }) => rest)` no final — o tipo resultante bate exatamente com `SessionBlock[]`, sem precisar de nenhum cast.

- [ ] **Step 3: Substituir o conteúdo de `core/blocks.test.ts`**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBlocks } from './blocks.ts';
import type { UsageRecord } from './types.ts';

function makeRecord(timestamp: string, overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    timestamp,
    model: 'claude-sonnet-5',
    project: 'demo-project',
    inputTokens: 100,
    outputTokens: 50,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 1,
    ...overrides,
  };
}

test('retorna array vazio quando não há registros', () => {
  assert.deepEqual(computeBlocks([]), []);
});

test('agrupa registros dentro de 5h num único bloco', () => {
  const records = [
    makeRecord('2026-07-09T10:15:00.000Z'),
    makeRecord('2026-07-09T12:00:00.000Z'),
  ];

  const blocks = computeBlocks(records, { now: new Date('2026-07-09T13:00:00.000Z') });

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].start, '2026-07-09T10:00:00.000Z');
  assert.equal(blocks[0].count, 2);
  assert.equal(blocks[0].inputTokens, 200);
  assert.equal(blocks[0].isActive, true);
});

test('abre um novo bloco após um gap de inatividade >= 5h', () => {
  const records = [
    makeRecord('2026-07-09T10:00:00.000Z'),
    makeRecord('2026-07-09T16:00:00.000Z'),
  ];

  const blocks = computeBlocks(records, { now: new Date('2026-07-09T17:00:00.000Z') });

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].isActive, false);
  assert.equal(blocks[1].isActive, true);
});

test('fecha o bloco 5h após o início, mesmo sem gap grande', () => {
  const records = [
    makeRecord('2026-07-09T10:15:00.000Z'),
    makeRecord('2026-07-09T14:00:00.000Z'),
    makeRecord('2026-07-09T15:30:00.000Z'),
  ];

  const blocks = computeBlocks(records, { now: new Date('2026-07-09T16:00:00.000Z') });

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].count, 2);
  assert.equal(blocks[1].count, 1);
});

test('projeta o fim como início + 5h enquanto o bloco está ativo', () => {
  const records = [makeRecord('2026-07-09T10:00:00.000Z')];

  const blocks = computeBlocks(records, { now: new Date('2026-07-09T10:30:00.000Z') });

  assert.equal(blocks[0].end, '2026-07-09T15:00:00.000Z');
});

test('usa a última atividade como fim quando o bloco já fechou', () => {
  const records = [
    makeRecord('2026-07-09T10:00:00.000Z'),
    makeRecord('2026-07-09T20:00:00.000Z'),
  ];

  const blocks = computeBlocks(records, { now: new Date('2026-07-09T21:00:00.000Z') });

  assert.equal(blocks[0].isActive, false);
  assert.equal(blocks[0].end, '2026-07-09T10:00:00.000Z');
});
```

- [ ] **Step 4: Rodar o teste**

Run: `node --test core/blocks.test.ts`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Rodar o typecheck**

Run: `npm run typecheck`
Expected: mesmo erro esperado de `index.ts` (Task 6) — nenhum outro erro.

- [ ] **Step 6: Commit**

```bash
git add core/blocks.ts core/blocks.test.ts
git commit -m "refactor: migrate core/blocks to TypeScript"
```

---

### Task 5: Migrar `core/adapters/claude.js` → `core/adapters/claude.ts`

**Files:**
- Move: `core/adapters/claude.js` → `core/adapters/claude.ts`
- Move: `core/adapters/claude.test.js` → `core/adapters/claude.test.ts`

**Interfaces:**
- Consumes: `RawUsageRecord` de `core/types.ts` (Task 1, caminho `'../types.ts'` a partir de `core/adapters/`).
- Produces: `collectClaudeUsage(): RawUsageRecord[]`, `findJsonlFiles(rootDir: string): string[]` — mesmas assinaturas funcionais de antes, agora tipadas.

- [ ] **Step 1: Mover os arquivos**

```bash
git mv core/adapters/claude.js core/adapters/claude.ts
git mv core/adapters/claude.test.js core/adapters/claude.test.ts
```

- [ ] **Step 2: Substituir o conteúdo de `core/adapters/claude.ts`**

```ts
import { readFileSync, readdirSync, type Dirent } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import type { RawUsageRecord } from '../types.ts';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

export function findJsonlFiles(rootDir: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(rootDir, { recursive: true, withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => join(entry.parentPath, entry.name));
}

function getProjectName(filePath: string): string {
  return relative(PROJECTS_DIR, filePath).split(sep)[0];
}

interface ClaudeLogEntry {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation?: {
        ephemeral_5m_input_tokens?: number;
        ephemeral_1h_input_tokens?: number;
      };
    };
  };
}

function parseLine(line: string): ClaudeLogEntry | null {
  try {
    return JSON.parse(line) as ClaudeLogEntry;
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
export function collectClaudeUsage(): RawUsageRecord[] {
  const recordsByMessageId = new Map<string, RawUsageRecord>();

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
        timestamp: entry.timestamp ?? '',
        model: entry.message?.model ?? '',
        project,
        sessionId: entry.sessionId ?? '',
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
```

Nota: `entry.timestamp ?? ''`, `entry.message?.model ?? ''`, `entry.sessionId ?? ''` são fallbacks novos (a versão JS não precisava disso, já que não tinha tipos estritos). Na prática esses campos sempre vêm preenchidos quando `entry.type === 'assistant'` e `entry.message.usage` existe (já checado antes) — os fallbacks só existem para satisfazer o tipo estrito (`string`, não `string | undefined`) em dados malformados, seguindo o mesmo estilo defensivo que `usage.input_tokens ?? 0` já usava.

- [ ] **Step 3: Substituir o conteúdo de `core/adapters/claude.test.ts`**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { findJsonlFiles } from './claude.ts';

test('retorna array vazio quando o diretório não existe', () => {
  const result = findJsonlFiles('/caminho/que/nao/existe/prismly-test');
  assert.deepEqual(result, []);
});
```

- [ ] **Step 4: Rodar o teste**

Run: `node --test core/adapters/claude.test.ts`
Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 5: Rodar o typecheck**

Run: `npm run typecheck`
Expected: mesmo erro esperado de `index.ts` (Task 6) — nenhum outro erro. Se `Dirent`/`entry.parentPath`/`NodeJS.ErrnoException` derem erro de tipo não encontrado, confirme que `@types/node` foi instalado corretamente (Task 1, Step 2) antes de investigar mais.

- [ ] **Step 6: Rodar a suíte completa de `core/`**

Run: `node --test core/**/*.test.ts`
Expected: `# pass 10`, `# fail 0` (todos os testes de `core/` até agora).

- [ ] **Step 7: Commit**

```bash
git add core/adapters/claude.ts core/adapters/claude.test.ts
git commit -m "refactor: migrate core/adapters/claude to TypeScript"
```

---

### Task 6: Migrar `index.js` → `index.ts` (CLI) + atualizar `package.json` e `CLAUDE.md`

**Files:**
- Move: `index.js` → `index.ts`
- Modify: `package.json` (raiz)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `collectClaudeUsage` de `core/adapters/claude.ts`, `calculateCost` de `core/pricing.ts`, `aggregateUsage` de `core/aggregator.ts`, `UsageBucket` de `core/types.ts` (todas as Tasks 2-5, extensão `.ts` explícita nos imports).
- Produces: nada consumido por outra task — é o ponto de entrada do CLI.

- [ ] **Step 1: Mover o arquivo**

```bash
git mv index.js index.ts
```

- [ ] **Step 2: Substituir o conteúdo de `index.ts`**

```ts
import { collectClaudeUsage } from './core/adapters/claude.ts';
import { calculateCost } from './core/pricing.ts';
import { aggregateUsage } from './core/aggregator.ts';
import type { UsageBucket } from './core/types.ts';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function toRows(
  groups: Record<string, UsageBucket>,
  keyLabel: string,
  sortBy?: 'key' | 'cost',
): Record<string, string | number>[] {
  const entries = Object.entries(groups);

  if (sortBy === 'key') {
    entries.sort(([a], [b]) => a.localeCompare(b));
  } else {
    entries.sort(([, a], [, b]) => b.cost - a.cost);
  }

  return entries.map(([key, bucket]) => ({
    [keyLabel]: key,
    'Tokens entrada': formatNumber(bucket.inputTokens),
    'Tokens saída': formatNumber(bucket.outputTokens),
    'Cache escrita': formatNumber(bucket.cacheCreationTokens),
    'Cache leitura': formatNumber(bucket.cacheReadTokens),
    'Custo (USD)': formatCost(bucket.cost),
    Registros: bucket.count,
  }));
}

function run(): void {
  const records = collectClaudeUsage().map((record) => ({
    ...record,
    cost: calculateCost(record),
  }));

  const { byDay, byModel, byProject, totals } = aggregateUsage(records);
  const days = Object.keys(byDay).sort();

  console.log('=== Prismly — Relatório de Uso do Claude Code ===\n');
  console.log(`Registros processados: ${formatNumber(totals.count)}`);
  console.log(`Período: ${days[0]} a ${days.at(-1)}`);
  console.log(`Custo total: ${formatCost(totals.cost)}`);
  console.log(`Tokens de entrada: ${formatNumber(totals.inputTokens)}`);
  console.log(`Tokens de saída: ${formatNumber(totals.outputTokens)}`);
  console.log(`Tokens de cache (escrita): ${formatNumber(totals.cacheCreationTokens)}`);
  console.log(`Tokens de cache (leitura): ${formatNumber(totals.cacheReadTokens)}`);

  console.log('\n--- Por modelo ---');
  console.table(toRows(byModel, 'Modelo'));

  console.log('\n--- Por projeto ---');
  console.table(toRows(byProject, 'Projeto'));

  console.log('\n--- Por dia ---');
  console.table(toRows(byDay, 'Dia', 'key'));
}

run();
```

- [ ] **Step 3: Atualizar `package.json`**

```json
{
  "name": "prismly",
  "version": "0.1.0",
  "description": "Reads local AI coding assistant usage logs and computes token usage/cost.",
  "type": "module",
  "main": "index.ts",
  "scripts": {
    "start": "node index.ts",
    "test": "node --test core/**/*.test.ts",
    "typecheck": "tsc --noEmit"
  },
  "license": "UNLICENSED",
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.7.0"
  }
}
```

- [ ] **Step 4: Rodar o CLI**

Run: `npm start`
Expected: mesmo relatório de sempre (cabeçalho, tabelas por modelo/projeto/dia), sem erros — confirma que o Node roda `index.ts` nativamente sem build.

- [ ] **Step 5: Rodar o typecheck (agora sem o erro de arquivo faltando)**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Rodar a suíte de testes**

Run: `npm test`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 7: Atualizar `CLAUDE.md`**

Na seção `## Stack`, substituir:

```markdown
- `core/` — Node.js puro (v20+), ESM, zero dependências externas.
```

por:

```markdown
- `core/` e o CLI (`index.ts`) — TypeScript, rodando nativamente no Node (v22.6+/24, via "type stripping" — sem build step, sem `ts-node`). Zero dependências externas em runtime; `@types/node` e `typescript` entram só como devDependencies, usadas exclusivamente para checagem de tipos (`npm run typecheck`).
```

Na seção `## Arquitetura`, adicionar logo após a lista existente:

```markdown
- `core/types.ts` — fonte única dos tipos de domínio (`RawUsageRecord`, `UsageRecord`, `UsageBucket`, `AggregatedUsage`, `SessionBlock`). `app/src/shared/types.ts` importa daqui em vez de duplicar.
```

- [ ] **Step 8: Commit**

```bash
git add index.ts package.json CLAUDE.md
git commit -m "refactor: migrate the CLI (index.ts) to TypeScript"
```

---

### Task 7: Atualizar `app/` para consumir `core/*.ts` sem duplicação nem casts

**Files:**
- Modify: `app/src/shared/types.ts`
- Modify: `app/src/main/index.ts`
- Modify: `app/tsconfig.node.json`

**Interfaces:**
- Consumes: `RawUsageRecord`, `UsageRecord`, `UsageBucket`, `AggregatedUsage`, `SessionBlock` de `../../../core/types.ts` (Task 1); `collectClaudeUsage`, `calculateCost`, `aggregateUsage`, `computeBlocks` de `core/*.ts` (Tasks 2-5).
- Produces: `UsagePayload` continua exportado de `app/src/shared/types.ts`, mesma forma de antes — usado por `preload/index.ts` e pelo renderer (sem mudança de interface pública, só de onde os tipos vêm).

- [ ] **Step 1: Substituir `app/src/shared/types.ts`**

```ts
import type { AggregatedUsage, SessionBlock } from '../../../core/types';

export type { UsageBucket, AggregatedUsage, SessionBlock } from '../../../core/types';

export interface UsagePayload {
  aggregated: AggregatedUsage;
  blocks: SessionBlock[];
}
```

Nota: sem extensão `.ts` no import aqui — dentro de `app/` (bundlado pelo Vite), extensão explícita não é necessária nem usada em nenhum outro import do projeto (ex: `./watcher`), então não vamos introduzir um padrão novo. Isso também evita precisar tocar em `allowImportingTsExtensions` nos tsconfigs do `app/`.

- [ ] **Step 2: Substituir `app/src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { collectClaudeUsage } from '../../../core/adapters/claude';
import { calculateCost } from '../../../core/pricing';
import { aggregateUsage } from '../../../core/aggregator';
import { computeBlocks } from '../../../core/blocks';
import { startWatcher } from './watcher';
import type { UsagePayload } from '../shared/types';

function buildPayload(): UsagePayload {
  const records = collectClaudeUsage().map((record) => ({
    ...record,
    cost: calculateCost(record),
  }));

  return {
    aggregated: aggregateUsage(records),
    blocks: computeBlocks(records),
  };
}

let mainWindow: BrowserWindow | null = null;

function sendUpdate(): void {
  if (!mainWindow) return;
  mainWindow.webContents.send('usage:update', buildPayload());
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('did-finish-load', sendUpdate);
}

app.whenReady().then(() => {
  createWindow();
  startWatcher(sendUpdate);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

Note as mudanças em relação à versão anterior: os imports de `core/` perderam a extensão `.js` (os arquivos agora são `.ts`, resolvidos pelo Vite sem precisar de extensão — mesmo padrão de `./watcher`), e `buildPayload()` não usa mais `as AggregatedUsage`/`as unknown as SessionBlock[]` — `aggregateUsage`/`computeBlocks` agora retornam os tipos certos diretamente.

- [ ] **Step 3: Remover `allowJs`/`checkJs` de `app/tsconfig.node.json`**

Conteúdo final:

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": ["electron.vite.config.*", "src/main/**/*", "src/preload/**/*", "src/shared/**/*", "../core/**/*"],
  "compilerOptions": {
    "composite": false,
    "types": ["electron-vite/node"]
  }
}
```

(`allowJs`/`checkJs` só existiam para tolerar os antigos `.js` de `core/` — agora que são `.ts` de verdade, essas opções não fazem mais sentido. O `include` com `"../core/**/*"` continua igual — o glob já cobre `.ts` sem precisar mudar.)

- [ ] **Step 4: Rodar o typecheck do processo principal**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.node.json`
Expected: sem erros. Se aparecer erro de resolução de módulo pros imports sem extensão de `core/`, tente confirmar se `moduleResolution` herdado de `@electron-toolkit/tsconfig/tsconfig.node.json` é `bundler` (que resolve extensão automaticamente) — se não for, reporte o erro exato em vez de adivinhar uma correção.

- [ ] **Step 5: Rodar o typecheck do renderer (não deveria ter mudado, mas confirme)**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.web.json`
Expected: sem erros (o renderer só toca em `core/` indiretamente via `app/src/shared/types.ts`, que já foi atualizado no Step 1).

- [ ] **Step 6: Commit**

```bash
git add app/src/shared/types.ts app/src/main/index.ts app/tsconfig.node.json
git commit -m "refactor: consume core/*.ts directly in app/, removing casts and duplicated types"
```

---

### Task 8: Corrigir indicador de aba ativa + verificação final de ponta a ponta

**Files:**
- Modify: `app/src/renderer/src/App.tsx`

**Interfaces:** N/A (última task, sem consumidores posteriores).

- [ ] **Step 1: Adicionar indicador visual explícito de aba ativa**

Em `app/src/renderer/src/App.tsx`, substituir o bloco `<nav>`:

```tsx
      <nav>
        <button onClick={() => setTab('ao-vivo')} disabled={tab === 'ao-vivo'}>
          Ao vivo
        </button>
        <button onClick={() => setTab('historico')} disabled={tab === 'historico'}>
          Histórico
        </button>
      </nav>
```

por:

```tsx
      <nav>
        <button
          onClick={() => setTab('ao-vivo')}
          disabled={tab === 'ao-vivo'}
          aria-pressed={tab === 'ao-vivo'}
          style={tab === 'ao-vivo' ? { fontWeight: 'bold', borderBottom: '2px solid #4f9eff' } : undefined}
        >
          Ao vivo
        </button>
        <button
          onClick={() => setTab('historico')}
          disabled={tab === 'historico'}
          aria-pressed={tab === 'historico'}
          style={tab === 'historico' ? { fontWeight: 'bold', borderBottom: '2px solid #4f9eff' } : undefined}
        >
          Histórico
        </button>
      </nav>
```

Isso mantém `disabled` (não faz sentido reclicar na aba já ativa) mas adiciona um sinal visual explícito (negrito + borda inferior azul) que não depende do estilo nativo de "desabilitado" do sistema operacional — resolve a ambiguidade visual que gerou a dúvida original.

- [ ] **Step 2: Rodar o typecheck do renderer**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.web.json`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/src/App.tsx
git commit -m "fix: make the active tab visually distinct, not just disabled"
```

- [ ] **Step 4: Verificação completa — testes e typecheck**

Run: `npm test` (raiz)
Expected: `# pass 10`, `# fail 0`.

Run: `npm run typecheck` (raiz)
Expected: sem erros.

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`
Expected: sem erros em nenhum dos dois.

- [ ] **Step 5: Verificação completa — CLI**

Run: `npm start` (raiz)
Expected: relatório de terminal funcionando normalmente.

- [ ] **Step 6: Verificação completa — app Electron rodando de verdade**

Run (dentro de `app/`): `npm run dev` (em ambiente com display disponível — em sandbox headless sem tela, essa etapa só pode ser validada por processo, não visualmente; ver nota abaixo)

Expected: a janela abre, a aba "Ao vivo" aparece com destaque visual claro (negrito + borda), clicar em "Histórico" alterna a aba e o destaque visual se move para o botão certo, os números batem com o que o CLI mostrou no Step 5.

**Nota para quem executa esta task:** se estiver rodando num ambiente sem tela (sandbox headless), essa verificação visual não é possível — reporte isso explicitamente em vez de assumir que funcionou, e sinalize que um humano (ou uma sessão com display real) precisa confirmar visualmente antes de considerar a fase encerrada.
