# Dashboard Electron com blocos de sessão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sair do modo terminal-only do Prismly para um app Electron (React + TypeScript) com uma aba "Ao vivo" (bloco de sessão de 5h atual) e uma aba "Histórico" (dia/modelo/projeto, como hoje), atualizando automaticamente conforme os logs crescem.

**Architecture:** `core/` continua Node puro/ESM/zero dependências (agora incluindo `blocks.js` para o algoritmo de janelas de 5h). `app/` é um projeto Electron+React+TS separado (dependências próprias via `electron-vite`), cujo processo principal importa `core/` diretamente, observa `~/.claude/projects/` com `fs.watch` e envia atualizações ao renderer via IPC.

**Tech Stack:** Node.js v20+, ESM, `node:test` (core/), Electron + React + TypeScript + `electron-vite` (app/).

## Global Constraints

- `core/` (adapters, aggregator, pricing, blocks): Node.js puro, ESM, **zero dependências externas**.
- `app/` (Electron/React/TS): dependências isoladas em `app/package.json`, não afetam `core/`.
- Identificadores de código em inglês; texto voltado ao usuário final em português.
- `npm start` na raiz (CLI atual) deve continuar funcionando sem quebrar.
- Sem framework de state management extra no renderer (React puro com hooks).

---

### Task 1: Restructure — mover a camada de dados para `core/`

**Files:**
- Move: `adapters/claude.js` → `core/adapters/claude.js`
- Move: `aggregator.js` → `core/aggregator.js`
- Move: `pricing.js` → `core/pricing.js`
- Modify: `index.js` (atualizar imports)
- Modify: `package.json` (nenhuma mudança de script ainda)

**Interfaces:**
- Consumes: nada (é um move mecânico).
- Produces: `core/adapters/claude.js` exporta `collectClaudeUsage()`; `core/pricing.js` exporta `calculateCost(record)`; `core/aggregator.js` exporta `aggregateUsage(records)` — mesmas assinaturas de hoje, só de novo caminho.

- [ ] **Step 1: Rodar o CLI atual e guardar a saída como referência**

Run: `npm start`
Expected: imprime `=== Prismly — Relatório de Uso do Claude Code ===` seguido das tabelas por modelo/projeto/dia, sem erros.

- [ ] **Step 2: Mover os arquivos com git mv**

```bash
mkdir -p core
git mv adapters core/adapters
git mv aggregator.js core/aggregator.js
git mv pricing.js core/pricing.js
```

- [ ] **Step 3: Atualizar os imports em `index.js`**

```js
import { collectClaudeUsage } from './core/adapters/claude.js';
import { calculateCost } from './core/pricing.js';
import { aggregateUsage } from './core/aggregator.js';
```

- [ ] **Step 4: Rodar o CLI de novo e comparar a forma da saída**

Run: `npm start`
Expected: mesma estrutura de saída do Step 1 (cabeçalho, tabelas por modelo/projeto/dia), sem erros de import. Os números podem variar levemente se houve uso novo entre as duas execuções — o que importa é não haver exceção e as seções aparecerem.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: move data layer into core/"
```

---

### Task 2: Testes para `core/aggregator.js` e `core/pricing.js`

**Files:**
- Create: `core/aggregator.test.js`
- Create: `core/pricing.test.js`
- Modify: `package.json` (adicionar script `test`)

**Interfaces:**
- Consumes: `aggregateUsage(records)` de `core/aggregator.js`; `calculateCost(record)` e `MODEL_PRICING` de `core/pricing.js` (ambos já existentes, sem mudança de assinatura).
- Produces: nenhuma API nova — só trava o comportamento atual com testes.

- [ ] **Step 1: Escrever os testes de `pricing.js`**

`core/pricing.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCost } from './pricing.js';

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

- [ ] **Step 2: Escrever os testes de `aggregator.js`**

`core/aggregator.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUsage } from './aggregator.js';

function makeRecord(overrides = {}) {
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

- [ ] **Step 3: Adicionar script de teste no `package.json`**

Em `package.json`, dentro de `"scripts"`, adicionar:

```json
"test": "node --test core/"
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test`
Expected: `# pass 4` (ou equivalente), `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add core/aggregator.test.js core/pricing.test.js package.json
git commit -m "test: cover aggregator and pricing with node:test"
```

---

### Task 3: `core/blocks.js` — blocos de sessão de 5h

**Files:**
- Create: `core/blocks.js`
- Create: `core/blocks.test.js`

**Interfaces:**
- Consumes: registros normalizados no mesmo formato usado por `aggregateUsage` (precisa de `timestamp`, `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `cost`).
- Produces: `computeBlocks(records, { now, blockDurationMs } = {})` → array de blocos `{ start, end, isActive, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, cost, count }`, ordenados por `start` crescente. Usado por `app/src/main/index.ts` na Task 7.

- [ ] **Step 1: Escrever os testes (falhando)**

`core/blocks.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBlocks } from './blocks.js';

function makeRecord(timestamp, overrides = {}) {
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

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --test core/blocks.test.js`
Expected: FAIL — `Cannot find module './blocks.js'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `core/blocks.js`**

```js
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
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --test core/blocks.test.js`
Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Rodar a suíte completa**

Run: `npm test`
Expected: todos os testes de `core/` (pricing, aggregator, blocks) passam.

- [ ] **Step 6: Commit**

```bash
git add core/blocks.js core/blocks.test.js
git commit -m "feat: add 5h session block computation to core/"
```

---

### Task 4: `core/adapters/claude.js` — não quebrar quando o diretório de logs não existe

**Files:**
- Modify: `core/adapters/claude.js:7-11` (função `findJsonlFiles`)
- Create: `core/adapters/claude.test.js`

**Interfaces:**
- Consumes: nada novo.
- Produces: `findJsonlFiles(rootDir)` passa a ser exportado (antes era privado) e retorna `[]` em vez de lançar exceção quando `rootDir` não existe.

- [ ] **Step 1: Escrever o teste (falhando)**

`core/adapters/claude.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { findJsonlFiles } from './claude.js';

test('retorna array vazio quando o diretório não existe', () => {
  const result = findJsonlFiles('/caminho/que/nao/existe/prismly-test');
  assert.deepEqual(result, []);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test core/adapters/claude.test.js`
Expected: FAIL — `findJsonlFiles is not a function` (a função ainda não é exportada) ou lança `ENOENT`.

- [ ] **Step 3: Exportar `findJsonlFiles` e tratar `ENOENT`**

Em `core/adapters/claude.js`, substituir:

```js
function findJsonlFiles(rootDir) {
  return readdirSync(rootDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => join(entry.parentPath, entry.name));
}
```

por:

```js
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
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test core/adapters/claude.test.js`
Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 5: Rodar a suíte completa e o CLI**

Run: `npm test && npm start`
Expected: todos os testes passam; `npm start` continua imprimindo o relatório normalmente.

- [ ] **Step 6: Commit**

```bash
git add core/adapters/claude.js core/adapters/claude.test.js
git commit -m "fix: return empty usage list when the projects dir is missing"
```

---

### Task 5: Atualizar `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nada (documentação).
- Produces: nada (documentação).

- [ ] **Step 1: Atualizar a seção "Fase atual"**

Substituir o parágrafo da seção `## Fase atual: base de dados` por:

```markdown
## Fase atual: app gráfico

A camada de dados (`core/`) está validada e estável. A fase atual adiciona um app Electron (`app/`) com visualização gráfica: uma aba "Ao vivo" com o bloco de sessão de 5h em andamento, e uma aba "Histórico" com os agregados por dia/modelo/projeto que já existiam no relatório de terminal. O modo CLI (`npm start`) continua existindo.
```

Ajustar o título de `## Fase atual: base de dados` para `## Fase atual: app gráfico`.

- [ ] **Step 2: Atualizar a seção "Stack"**

Substituir:

```markdown
## Stack

Node.js puro (v20+), ESM, zero dependências externas.
```

por:

```markdown
## Stack

- `core/` — Node.js puro (v20+), ESM, zero dependências externas.
- `app/` — Electron + React + TypeScript, empacotado com `electron-vite`. Dependências isoladas em `app/package.json`; não afetam `core/`.
```

- [ ] **Step 3: Atualizar a seção "Arquitetura" com o novo layout e `blocks.js`**

No início da seção `## Arquitetura`, antes do item de `adapters/claude.js`, adicionar:

```markdown
- `core/adapters/claude.js`, `core/aggregator.js`, `core/pricing.js` — mesma responsabilidade de antes, agora dentro de `core/`.
- `core/blocks.js` — agrupa registros normalizados em blocos de sessão de 5h (a janela de uso do Claude Code), expondo início/fim/status ativo e os totais acumulados de cada bloco. Usado pela aba "Ao vivo" do app.
- `app/` — app Electron (processo principal + preload + renderer React/TS). O processo principal roda a pipeline de `core/`, observa `~/.claude/projects/` com `fs.watch` e envia atualizações ao renderer via IPC.
```

(Os itens de `adapters/claude.js`, `pricing.js` e `aggregator.js` originais podem ser removidos ou fundidos com o novo texto, evitando duplicação.)

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the app/ phase and core/blocks.js in CLAUDE.md"
```

---

### Task 6: Scaffold do `app/` (Electron + React + TypeScript via electron-vite)

**Files:**
- Create: `app/` (gerado pelo scaffold oficial do electron-vite)

**Interfaces:**
- Consumes: nada.
- Produces: estrutura padrão `app/src/main/index.ts`, `app/src/preload/index.ts`, `app/src/renderer/`, `app/electron.vite.config.ts`, `app/package.json`, `app/tsconfig*.json` — modificada nas próximas tasks.

- [ ] **Step 1: Rodar o scaffold oficial**

A partir da raiz do repositório (`prismly/`):

```bash
npm create @quick-start/electron@latest app -- --template react-ts
```

Responder "yes" caso pergunte para sobrescrever/criar a pasta `app`.

- [ ] **Step 2: Instalar as dependências do app**

```bash
cd app
npm install
```

- [ ] **Step 3: Remover git aninhado, se o scaffold criou um**

Run (dentro de `app/`): `ls -la`
Expected: se existir `app/.git`, remover com `rm -rf .git` — o `app/` deve fazer parte do repositório git da raiz, não ser um repo próprio.

- [ ] **Step 4: Rodar o template padrão e confirmar que abre**

Run (dentro de `app/`): `npm run dev`
Expected: uma janela Electron abre mostrando a tela padrão do template (logo do Vite/Electron). Fechar a janela e o processo (Ctrl+C) depois de confirmar.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app
git commit -m "chore: scaffold app/ with electron-vite (react-ts template)"
```

---

### Task 7: Tipos compartilhados + pipeline no processo principal

**Files:**
- Create: `app/src/shared/types.ts`
- Modify: `app/src/main/index.ts` (substituir pelo conteúdo abaixo)

**Interfaces:**
- Consumes: `collectClaudeUsage()` de `../../../core/adapters/claude.js`; `calculateCost(record)` de `../../../core/pricing.js`; `aggregateUsage(records)` de `../../../core/aggregator.js`; `computeBlocks(records)` de `../../../core/blocks.js` (Tasks 1–4).
- Produces: tipos `UsageRecord`, `UsageBucket`, `AggregatedUsage`, `SessionBlock`, `UsagePayload` em `app/src/shared/types.ts` — usados por `preload` (Task 9) e pelo `renderer` (Tasks 10–11). Canal IPC `'usage:update'` carregando `UsagePayload`.

- [ ] **Step 1: Permitir importar `.js` puro do `core/` a partir do TypeScript**

O processo principal vai importar `core/adapters/claude.js`, `core/pricing.js`, `core/aggregator.js` e `core/blocks.js` diretamente — todos arquivos `.js` sem tipos. Por padrão o TypeScript não resolve `.js` como módulo a menos que `allowJs` esteja ligado. No tsconfig usado pelo processo `main` (gerado pelo scaffold — geralmente `app/tsconfig.node.json`; abrir `app/tsconfig.json` e conferir qual arquivo é referenciado pelo `main`), garantir que `compilerOptions` inclua:

```json
{
  "compilerOptions": {
    "allowJs": true,
    "checkJs": false
  }
}
```

`checkJs: false` evita que o TypeScript tente checar os tipos dentro dos próprios arquivos `.js` de `core/` (que não têm anotações) — as chamadas a partir do `main` continuam com tipo `any` implícito, o que é aceitável já que `core/` decidimos manter em JS puro.

- [ ] **Step 2: Criar `app/src/shared/types.ts`**

```ts
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
```

- [ ] **Step 3: Substituir `app/src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { collectClaudeUsage } from '../../../core/adapters/claude.js';
import { calculateCost } from '../../../core/pricing.js';
import { aggregateUsage } from '../../../core/aggregator.js';
import { computeBlocks } from '../../../core/blocks.js';
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

Nota: `watcher.ts` é criado na Task 8 — este arquivo só compila depois dela. Isso é esperado; a Task 8 é a continuação direta desta.

- [ ] **Step 4: Commit**

```bash
git add app/src/shared/types.ts app/src/main/index.ts
git commit -m "feat: run the core/ pipeline from the Electron main process"
```

(O commit fica com o build quebrado até a Task 8 criar `watcher.ts` — ambas as tasks devem ser aplicadas em sequência antes de rodar `npm run dev` no `app/`.)

---

### Task 8: Watcher — observar os logs e atualizar ao vivo

**Files:**
- Create: `app/src/main/watcher.ts`

**Interfaces:**
- Consumes: nenhuma API de `core/` diretamente.
- Produces: `startWatcher(onChange: () => void): void` — usado por `app/src/main/index.ts` (Task 7).

- [ ] **Step 1: Criar `app/src/main/watcher.ts`**

```ts
import { watch } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const DEBOUNCE_MS = 1000;

export function startWatcher(onChange: () => void): void {
  let timer: NodeJS.Timeout | null = null;

  const scheduleUpdate = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, DEBOUNCE_MS);
  };

  try {
    watch(PROJECTS_DIR, { recursive: true }, scheduleUpdate);
  } catch (error) {
    console.error('Não foi possível observar os logs em', PROJECTS_DIR, error);
  }
}
```

- [ ] **Step 2: Verificar que o processo principal compila**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.node.json`
Expected: sem erros de tipo (ajustar o caminho do `tsconfig` conforme o gerado pelo scaffold, caso o nome seja diferente).

- [ ] **Step 3: Commit**

```bash
git add app/src/main/watcher.ts
git commit -m "feat: watch ~/.claude/projects and refresh usage data on change"
```

---

### Task 9: Preload — expor a API segura pro renderer

**Files:**
- Modify: `app/src/preload/index.ts` (substituir pelo conteúdo abaixo)
- Create: `app/src/renderer/src/prismly.d.ts`

**Interfaces:**
- Consumes: tipo `UsagePayload` de `../shared/types` (Task 7).
- Produces: `window.prismly.onUsageUpdate(callback: (payload: UsagePayload) => void): () => void` — usado pelo renderer nas Tasks 10–11.

- [ ] **Step 1: Substituir `app/src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { UsagePayload } from '../shared/types';

contextBridge.exposeInMainWorld('prismly', {
  onUsageUpdate(callback: (payload: UsagePayload) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, payload: UsagePayload): void =>
      callback(payload);
    ipcRenderer.on('usage:update', listener);
    return () => ipcRenderer.removeListener('usage:update', listener);
  },
});
```

- [ ] **Step 2: Declarar o tipo global de `window.prismly`**

`app/src/renderer/src/prismly.d.ts`:

```ts
import type { UsagePayload } from '../../shared/types';

declare global {
  interface Window {
    prismly: {
      onUsageUpdate(callback: (payload: UsagePayload) => void): () => void;
    };
  }
}

export {};
```

- [ ] **Step 3: Commit**

```bash
git add app/src/preload/index.ts app/src/renderer/src/prismly.d.ts
git commit -m "feat: expose usage:update IPC channel to the renderer via preload"
```

---

### Task 10: Renderer — casca do app + aba Histórico

**Files:**
- Modify: `app/src/renderer/src/App.tsx` (substituir pelo conteúdo abaixo)
- Create: `app/src/renderer/src/tabs/Historico.tsx`

**Interfaces:**
- Consumes: `window.prismly.onUsageUpdate` (Task 9); tipos `UsagePayload`, `AggregatedUsage`, `UsageBucket` (Task 7).
- Produces: componente `Historico({ aggregated: AggregatedUsage })` — usado por `App.tsx`.

- [ ] **Step 1: Criar `app/src/renderer/src/tabs/Historico.tsx`**

```tsx
import type { AggregatedUsage, UsageBucket } from '../../../shared/types';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function Table({ title, rows }: { title: string; rows: [string, UsageBucket][] }): JSX.Element {
  return (
    <section>
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Chave</th>
            <th>Tokens entrada</th>
            <th>Tokens saída</th>
            <th>Cache escrita</th>
            <th>Cache leitura</th>
            <th>Custo (USD)</th>
            <th>Registros</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, bucket]) => (
            <tr key={key}>
              <td>{key}</td>
              <td>{formatNumber(bucket.inputTokens)}</td>
              <td>{formatNumber(bucket.outputTokens)}</td>
              <td>{formatNumber(bucket.cacheCreationTokens)}</td>
              <td>{formatNumber(bucket.cacheReadTokens)}</td>
              <td>{formatCost(bucket.cost)}</td>
              <td>{bucket.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Historico({ aggregated }: { aggregated: AggregatedUsage }): JSX.Element {
  const byDayRows = Object.entries(aggregated.byDay).sort(([a], [b]) => a.localeCompare(b));
  const byModelRows = Object.entries(aggregated.byModel).sort(([, a], [, b]) => b.cost - a.cost);
  const byProjectRows = Object.entries(aggregated.byProject).sort(([, a], [, b]) => b.cost - a.cost);

  return (
    <div>
      <Table title="Por dia" rows={byDayRows} />
      <Table title="Por modelo" rows={byModelRows} />
      <Table title="Por projeto" rows={byProjectRows} />
    </div>
  );
}
```

- [ ] **Step 2: Substituir `app/src/renderer/src/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { UsagePayload } from '../../shared/types';
import { Historico } from './tabs/Historico';
import { AoVivo } from './tabs/AoVivo';

type Tab = 'ao-vivo' | 'historico';

export function App(): JSX.Element {
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [tab, setTab] = useState<Tab>('ao-vivo');

  useEffect(() => {
    return window.prismly.onUsageUpdate(setPayload);
  }, []);

  if (!payload) {
    return <p>Carregando dados de uso...</p>;
  }

  if (payload.aggregated.totals.count === 0) {
    return <p>Nenhum uso encontrado ainda.</p>;
  }

  return (
    <div>
      <nav>
        <button onClick={() => setTab('ao-vivo')} disabled={tab === 'ao-vivo'}>
          Ao vivo
        </button>
        <button onClick={() => setTab('historico')} disabled={tab === 'historico'}>
          Histórico
        </button>
      </nav>
      {tab === 'ao-vivo' ? <AoVivo blocks={payload.blocks} /> : <Historico aggregated={payload.aggregated} />}
    </div>
  );
}
```

Nota: `AoVivo` é criado na Task 11 — este arquivo só compila depois dela.

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/src/App.tsx app/src/renderer/src/tabs/Historico.tsx
git commit -m "feat: render the Histórico tab with day/model/project tables"
```

---

### Task 11: Renderer — aba Ao vivo (bloco de sessão)

**Files:**
- Create: `app/src/renderer/src/tabs/AoVivo.tsx`

**Interfaces:**
- Consumes: tipo `SessionBlock` (Task 7).
- Produces: componente `AoVivo({ blocks: SessionBlock[] })` — consumido por `App.tsx` (Task 10).

- [ ] **Step 1: Criar `app/src/renderer/src/tabs/AoVivo.tsx`**

```tsx
import type { SessionBlock } from '../../../shared/types';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function AoVivo({ blocks }: { blocks: SessionBlock[] }): JSX.Element {
  const activeBlock = blocks.find((block) => block.isActive) ?? null;

  if (!activeBlock) {
    return <p>Nenhum bloco de sessão ativo no momento.</p>;
  }

  return (
    <section>
      <h2>Bloco atual</h2>
      <p>Início: {formatTime(activeBlock.start)}</p>
      <p>Termina às: {formatTime(activeBlock.end)}</p>
      <p>Tokens de entrada: {formatNumber(activeBlock.inputTokens)}</p>
      <p>Tokens de saída: {formatNumber(activeBlock.outputTokens)}</p>
      <p>Custo acumulado no bloco: {formatCost(activeBlock.cost)}</p>
    </section>
  );
}
```

- [ ] **Step 2: Rodar o app em modo dev e verificar visualmente**

Run (dentro de `app/`): `npm run dev`
Expected: a janela abre mostrando "Ao vivo" por padrão (ou "Nenhum uso encontrado ainda"/"Carregando..." se não houver dados), o botão "Histórico" alterna pra aba de tabelas por dia/modelo/projeto.

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/src/tabs/AoVivo.tsx
git commit -m "feat: render the Ao vivo tab with the current session block"
```

---

### Task 12: Verificação manual de ponta a ponta

**Files:** nenhum (só validação).

**Interfaces:** N/A.

- [ ] **Step 1: Rodar a suíte de testes do core**

Run: `npm test` (na raiz)
Expected: todos os testes de `core/` passam.

- [ ] **Step 2: Rodar o CLI**

Run: `npm start` (na raiz)
Expected: relatório de terminal continua funcionando como antes das mudanças.

- [ ] **Step 3: Rodar o app Electron e checar as duas abas**

Run (dentro de `app/`): `npm run dev`
Expected: aba "Ao vivo" mostra o bloco de sessão atual (ou estado vazio, se não houver uso recente); aba "Histórico" mostra as três tabelas com os mesmos números do CLI.

- [ ] **Step 4: Checar a atualização automática**

Enquanto o app está aberto, usar o Claude Code normalmente em outro terminal (gerando novas linhas de log) e observar se, após ~1s (debounce), os números na aba ativa mudam sem precisar fechar/reabrir o app.
Expected: os valores mudam sozinhos, sem reiniciar o app.

- [ ] **Step 5: Commit final (se houver ajustes pendentes)**

```bash
git add -A
git commit -m "chore: final verification pass for the Electron dashboard"
```
