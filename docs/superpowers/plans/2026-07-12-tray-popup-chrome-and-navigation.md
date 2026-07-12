# Janela customizada, navegação e Ao vivo enriquecido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o esconder-ao-perder-foco por botões explícitos de minimizar/fechar, tornar o popup redimensionável (lembrando o tamanho), e reformular a navegação (Ao vivo/Histórico/Configuração + sub-menu Dia/Semana/Mensal dentro de Histórico), enriquecendo a aba Ao vivo com uma barra de progresso, registros do bloco, resumo do dia e atualização manual.

**Architecture:** `popupPosition.ts` vira `popupGeometry.ts` (guarda x/y/largura/altura juntos). `popupWindow.ts` usa a geometria salva na criação e fica redimensionável. `tray.ts` usa a geometria salva pra posicionar, e o menu ganha "Redefinir janela". Duas novas pontas de IPC (`popup:hide`, `usage:refresh`) ligam botões do renderer a ações do processo principal. No renderer, `App.tsx` ganha uma barra de título customizada e o novo cabeçalho de navegação de 3 itens; `Historico.tsx` ganha seu próprio sub-menu (Dia/Semana/Mensal) e uma área rolável; `AoVivo.tsx` ganha a barra de progresso e os dados novos.

**Tech Stack:** Electron (`BrowserWindow` redimensionável, `ipcMain`/`ipcRenderer`, `Tray`), TypeScript, React — sem novas dependências.

## Global Constraints

- Nenhum teste automatizado novo (mesma justificativa das specs anteriores).
- Windows-first.
- Identificadores de código em inglês; texto voltado ao usuário final em português.
- "Configuração", "Semana" e "Mensal" ficam visíveis mas desabilitados nesta fase — sem lógica real por trás ainda.
- A barra de progresso do "Ao vivo" representa tempo decorrido da janela de 5h, não "% do limite do plano" (o Prismly não tem acesso ao limite real da assinatura).

---

### Task 1: `app/src/main/popupGeometry.ts` — renomear e estender `popupPosition.ts`

**Files:**
- Move: `app/src/main/popupPosition.ts` → `app/src/main/popupGeometry.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `saveGeometry(x, y, width, height): void`, `loadGeometry(): { x, y, width, height } | null`, `isPositionOnScreen(x, y): boolean`, `clearGeometry(): void` — usados por `popupWindow.ts` (Task 2) e `tray.ts` (Task 3).

- [ ] **Step 1: Mover o arquivo**

```bash
git mv app/src/main/popupPosition.ts app/src/main/popupGeometry.ts
```

- [ ] **Step 2: Substituir o conteúdo de `app/src/main/popupGeometry.ts`**

```ts
import { app, screen } from 'electron';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface SavedGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

function getGeometryFilePath(): string {
  return join(app.getPath('userData'), 'popup-geometry.json');
}

export function saveGeometry(x: number, y: number, width: number, height: number): void {
  writeFileSync(getGeometryFilePath(), JSON.stringify({ x, y, width, height }));
}

export function loadGeometry(): SavedGeometry | null {
  const filePath = getGeometryFilePath();
  if (!existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as SavedGeometry;
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isPositionOnScreen(x: number, y: number): boolean {
  return screen.getAllDisplays().some((display) => {
    const { x: dx, y: dy, width, height } = display.bounds;
    return x >= dx && x < dx + width && y >= dy && y < dy + height;
  });
}

export function clearGeometry(): void {
  const filePath = getGeometryFilePath();
  if (existsSync(filePath)) unlinkSync(filePath);
}
```

Nota: o nome do arquivo salvo em disco muda de `popup-position.json` pra `popup-geometry.json` — qualquer posição salva antes por engano fica órfã (ignorada), o que é aceitável: o app simplesmente cai no padrão (ancorar acima do ícone, tamanho 380x500) na próxima abertura.

- [ ] **Step 3: Rodar o typecheck**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.node.json`
Expected: erros esperados nesse ponto, já que `popupWindow.ts` e `tray.ts` ainda importam do caminho antigo `./popupPosition` (Tasks 2-3 corrigem isso). Confirme que o único tipo de erro é "Cannot find module './popupPosition'" (ou `savePosition`/`loadPosition`/`clearPosition` não encontrados) — nada além disso.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/popupGeometry.ts
git commit -m "refactor: rename popupPosition to popupGeometry and store window size too"
```

---

### Task 2: `app/src/main/popupWindow.ts` — redimensionável + geometria salva

**Files:**
- Modify: `app/src/main/popupWindow.ts`

**Interfaces:**
- Consumes: `loadGeometry`, `saveGeometry` de `./popupGeometry` (Task 1).
- Produces: `createPopupWindow(): BrowserWindow` — mesma assinatura de antes. `POPUP_WIDTH`, `POPUP_HEIGHT` continuam exportados (usados por `tray.ts`, Task 3); dois novos exports, `POPUP_MIN_WIDTH`, `POPUP_MIN_HEIGHT`.

- [ ] **Step 1: Substituir `app/src/main/popupWindow.ts`**

```ts
import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { loadGeometry, saveGeometry } from './popupGeometry';

export const POPUP_WIDTH = 380;
export const POPUP_HEIGHT = 500;
export const POPUP_MIN_WIDTH = 320;
export const POPUP_MIN_HEIGHT = 400;

const SAVE_GEOMETRY_DEBOUNCE_MS = 300;

export function createPopupWindow(): BrowserWindow {
  const saved = loadGeometry();

  const popupWindow = new BrowserWindow({
    width: saved?.width ?? POPUP_WIDTH,
    height: saved?.height ?? POPUP_HEIGHT,
    minWidth: POPUP_MIN_WIDTH,
    minHeight: POPUP_MIN_HEIGHT,
    show: false,
    frame: false,
    resizable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    popupWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    popupWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  let saveTimeout: NodeJS.Timeout | null = null;
  const scheduleSaveGeometry = (): void => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const bounds = popupWindow.getBounds();
      saveGeometry(bounds.x, bounds.y, bounds.width, bounds.height);
    }, SAVE_GEOMETRY_DEBOUNCE_MS);
  };

  popupWindow.on('moved', scheduleSaveGeometry);
  popupWindow.on('resized', scheduleSaveGeometry);

  return popupWindow;
}
```

Mudanças em relação à versão anterior: `width`/`height` iniciais vêm da geometria salva (se existir), `minWidth`/`minHeight` novos, `resizable: true` (era `false`), o handler de `blur` (que escondia a janela) foi removido, e o antigo handler só de `moved` virou `scheduleSaveGeometry`, escutando tanto `moved` quanto `resized` e salvando os quatro valores (`getBounds()` já traz x/y/width/height juntos).

- [ ] **Step 2: Rodar o typecheck**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.node.json`
Expected: erro restante só em `tray.ts` (ainda não corrigido — Task 3), nada em `popupWindow.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/popupWindow.ts
git commit -m "feat: make the popup window resizable and remember its size"
```

---

### Task 3: `app/src/main/tray.ts` — usar geometria salva, renomear reset

**Files:**
- Modify: `app/src/main/tray.ts`

**Interfaces:**
- Consumes: `loadGeometry`, `isPositionOnScreen`, `clearGeometry` de `./popupGeometry` (Task 1); `POPUP_WIDTH`, `POPUP_HEIGHT` de `./popupWindow` (Task 2, inalterados).
- Produces: `createTray(popupWindow: BrowserWindow): Tray` — mesma assinatura de antes.

- [ ] **Step 1: Substituir `app/src/main/tray.ts`**

```ts
import { app, BrowserWindow, Menu, Tray } from 'electron';
import { join } from 'node:path';
import { POPUP_HEIGHT, POPUP_WIDTH } from './popupWindow';
import { clearGeometry, isPositionOnScreen, loadGeometry } from './popupGeometry';

function anchorAboveTray(popupWindow: BrowserWindow, tray: Tray): void {
  const trayBounds = tray.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - POPUP_WIDTH / 2);
  const y = Math.round(trayBounds.y - POPUP_HEIGHT);
  popupWindow.setPosition(x, y, false);
}

function positionPopup(popupWindow: BrowserWindow, tray: Tray): void {
  const saved = loadGeometry();
  if (saved && isPositionOnScreen(saved.x, saved.y)) {
    popupWindow.setPosition(saved.x, saved.y, false);
    return;
  }

  anchorAboveTray(popupWindow, tray);
}

function togglePopup(popupWindow: BrowserWindow, tray: Tray): void {
  if (popupWindow.isVisible()) {
    popupWindow.hide();
    return;
  }

  positionPopup(popupWindow, tray);
  popupWindow.show();
  popupWindow.focus();
}

function resetWindow(popupWindow: BrowserWindow, tray: Tray): void {
  clearGeometry();
  if (popupWindow.isVisible()) {
    popupWindow.setSize(POPUP_WIDTH, POPUP_HEIGHT);
    anchorAboveTray(popupWindow, tray);
  }
}

export function createTray(popupWindow: BrowserWindow): Tray {
  const tray = new Tray(join(__dirname, '../../resources/icon.png'));
  tray.setToolTip('Prismly');

  tray.on('click', () => togglePopup(popupWindow, tray));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Redefinir janela', click: () => resetWindow(popupWindow, tray) },
    { label: 'Sair', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);

  return tray;
}
```

`resetWindow` agora, além de limpar a geometria salva, também redefine o tamanho pro padrão (380x500) e reancora acima do ícone — só quando o popup está visível no momento do clique (mesma lógica condicional de antes).

- [ ] **Step 2: Rodar o typecheck**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.node.json`
Expected: sem erros (Tasks 1-3 fecham o ciclo de renomeação/extensão da geometria).

- [ ] **Step 3: Commit**

```bash
git add app/src/main/tray.ts
git commit -m "feat: use saved geometry to position the popup, rename reset to include size"
```

---

### Task 4: Preload + declarações de tipo — `hidePopup` e `refresh`

**Files:**
- Modify: `app/src/preload/index.ts`
- Modify: `app/src/renderer/src/prismly.d.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: `window.prismly.hidePopup(): void`, `window.prismly.refresh(): void` — usados por `App.tsx` (Task 8).

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
  hidePopup(): void {
    ipcRenderer.send('popup:hide');
  },
  refresh(): void {
    ipcRenderer.send('usage:refresh');
  },
});
```

- [ ] **Step 2: Substituir `app/src/renderer/src/prismly.d.ts`**

```ts
import type { UsagePayload } from '../../shared/types';

declare global {
  interface Window {
    prismly: {
      onUsageUpdate(callback: (payload: UsagePayload) => void): () => void;
      hidePopup(): void;
      refresh(): void;
    };
  }
}

export {};
```

- [ ] **Step 3: Rodar o typecheck**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`
Expected: sem erros em nenhum dos dois.

- [ ] **Step 4: Commit**

```bash
git add app/src/preload/index.ts app/src/renderer/src/prismly.d.ts
git commit -m "feat: expose hidePopup and refresh to the renderer via preload"
```

---

### Task 5: `app/src/main/index.ts` — registrar os handlers de IPC

**Files:**
- Modify: `app/src/main/index.ts`

**Interfaces:**
- Consumes: nada novo de outras tasks (usa `popupWindow`/`sendUpdate` que já existem no arquivo).
- Produces: canais IPC `'popup:hide'` e `'usage:refresh'` — consumidos pelo lado do preload (Task 4, já implementado).

- [ ] **Step 1: Substituir `app/src/main/index.ts`**

```ts
import { app, BrowserWindow, ipcMain, Tray } from 'electron';
import { collectClaudeUsage } from '../../../core/adapters/claude';
import { calculateCost } from '../../../core/pricing';
import { aggregateUsage } from '../../../core/aggregator';
import { computeBlocks } from '../../../core/blocks';
import { startWatcher } from './watcher';
import { createPopupWindow } from './popupWindow';
import { createTray } from './tray';
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

let popupWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function sendUpdate(): void {
  if (!popupWindow) return;
  popupWindow.webContents.send('usage:update', buildPayload());
}

app.whenReady().then(() => {
  popupWindow = createPopupWindow();
  popupWindow.webContents.on('did-finish-load', sendUpdate);
  tray = createTray(popupWindow);
  void tray;
  startWatcher(sendUpdate);

  ipcMain.on('popup:hide', () => {
    popupWindow?.hide();
  });

  ipcMain.on('usage:refresh', () => {
    sendUpdate();
  });
});
```

- [ ] **Step 2: Rodar o typecheck**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.node.json`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/src/main/index.ts
git commit -m "feat: wire popup:hide and usage:refresh IPC handlers"
```

---

### Task 6: `app/src/renderer/src/tabs/AoVivo.tsx` — barra de progresso e dados novos

**Files:**
- Modify: `app/src/renderer/src/tabs/AoVivo.tsx`

**Interfaces:**
- Consumes: `SessionBlock`, `UsageBucket` de `../../../shared/types` (já existentes).
- Produces: `AoVivo({ blocks, today, lastUpdated, onRefresh }): JSX.Element` — nova assinatura (antes era só `{ blocks }`), usada por `App.tsx` (Task 8).

- [ ] **Step 1: Substituir `app/src/renderer/src/tabs/AoVivo.tsx`**

```tsx
import type { JSX } from 'react';
import type { SessionBlock, UsageBucket } from '../../../shared/types';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatRemaining(endIso: string): string {
  const remainingMs = new Date(endIso).getTime() - Date.now();
  if (remainingMs <= 0) return '0min';
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
}

function percentElapsed(block: SessionBlock): number {
  const start = new Date(block.start).getTime();
  const end = new Date(block.end).getTime();
  const now = Date.now();
  if (end <= start) return 100;
  const percent = ((now - start) / (end - start)) * 100;
  return Math.min(100, Math.max(0, percent));
}

interface AoVivoProps {
  blocks: SessionBlock[];
  today: UsageBucket | undefined;
  lastUpdated: Date | null;
  onRefresh: () => void;
}

export function AoVivo({ blocks, today, lastUpdated, onRefresh }: AoVivoProps): JSX.Element {
  const activeBlock = blocks.find((block) => block.isActive) ?? null;

  return (
    <section style={{ padding: 14 }}>
      {activeBlock ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <strong style={{ fontSize: 14 }}>Sessão atual</strong>
            <span style={{ fontSize: 11, color: '#999' }}>reinicia em {formatRemaining(activeBlock.end)}</span>
          </div>
          <div style={{ background: '#333', borderRadius: 5, height: 8, marginBottom: 8 }}>
            <div
              style={{
                background: 'linear-gradient(90deg, #4f9eff, #7ab8ff)',
                width: `${percentElapsed(activeBlock)}%`,
                height: 8,
                borderRadius: 5,
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: '#bbb' }}>
            {formatCost(activeBlock.cost)} · {formatNumber(activeBlock.inputTokens + activeBlock.outputTokens)} tokens
            · {activeBlock.count} registros
          </div>
        </>
      ) : (
        <p>Nenhum bloco de sessão ativo no momento.</p>
      )}

      {today && (
        <div style={{ marginTop: 14, fontSize: 12, color: '#999' }}>
          Hoje: {formatCost(today.cost)} · {today.count} registros
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <span style={{ fontSize: 11, color: '#777' }}>
          Atualizado às {lastUpdated ? formatTime(lastUpdated) : '—'}
        </span>
        <button
          onClick={onRefresh}
          style={{ background: 'none', border: 'none', color: '#4f9eff', fontSize: 12, cursor: 'pointer' }}
        >
          ↻ Atualizar
        </button>
      </div>
    </section>
  );
}
```

`percentElapsed` calcula a % de tempo decorrido entre `block.start` e `block.end` (que já vem projetado como início+5h enquanto o bloco está ativo — ver `core/blocks.ts`), sem depender de nenhum limite de conta real. `today` é opcional (`UsageBucket | undefined`) porque pode não haver nenhum registro no dia corrente ainda.

- [ ] **Step 2: Rodar o typecheck**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.web.json`
Expected: erro esperado em `App.tsx` (Task 8 ainda não fechou a nova assinatura de props) — nenhum erro dentro do próprio `AoVivo.tsx`. Se aparecer erro dentro de `AoVivo.tsx`, pare e reporte.

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/src/tabs/AoVivo.tsx
git commit -m "feat: add a progress bar and richer stats to the Ao vivo tab"
```

---

### Task 7: `app/src/renderer/src/tabs/Historico.tsx` — sub-menu Dia/Semana/Mensal + rolagem

**Files:**
- Modify: `app/src/renderer/src/tabs/Historico.tsx`

**Interfaces:**
- Consumes: `AggregatedUsage`, `UsageBucket` de `../../../shared/types` (já existentes, sem mudança).
- Produces: `Historico({ aggregated }): JSX.Element` — mesma assinatura de antes.

- [ ] **Step 1: Substituir `app/src/renderer/src/tabs/Historico.tsx`**

```tsx
import { useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { AggregatedUsage, UsageBucket } from '../../../shared/types';

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function formatCost(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

function CardList({ title, rows }: { title: string; rows: [string, UsageBucket][] }): JSX.Element {
  return (
    <section>
      <h2>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(([key, bucket]) => (
          <div key={key} style={{ background: '#242424', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{key}</strong>
              <span style={{ color: '#4f9eff', fontWeight: 'bold' }}>{formatCost(bucket.cost)}</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '2px 12px',
                marginTop: 6,
                fontSize: 12,
                color: '#999',
              }}
            >
              <span>Tokens entrada: {formatNumber(bucket.inputTokens)}</span>
              <span>Tokens saída: {formatNumber(bucket.outputTokens)}</span>
              <span>Cache escrita: {formatNumber(bucket.cacheCreationTokens)}</span>
              <span>Cache leitura: {formatNumber(bucket.cacheReadTokens)}</span>
              <span>Registros: {bucket.count}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function pillStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    fontSize: 11,
    padding: '3px 10px',
    borderRadius: 12,
    border: 'none',
    background: active ? '#4f9eff' : '#242424',
    color: disabled ? '#555' : active ? '#fff' : '#999',
    cursor: disabled ? 'default' : 'pointer',
  };
}

type Granularity = 'dia' | 'semana' | 'mensal';

export function Historico({ aggregated }: { aggregated: AggregatedUsage }): JSX.Element {
  const [granularity, setGranularity] = useState<Granularity>('dia');

  const byDayRows = Object.entries(aggregated.byDay).sort(([a], [b]) => a.localeCompare(b));
  const byModelRows = Object.entries(aggregated.byModel).sort(([, a], [, b]) => b.cost - a.cost);
  const byProjectRows = Object.entries(aggregated.byProject).sort(([, a], [, b]) => b.cost - a.cost);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', flexShrink: 0 }}>
        <button
          onClick={() => setGranularity('dia')}
          disabled={granularity === 'dia'}
          style={pillStyle(granularity === 'dia', false)}
        >
          Dia
        </button>
        <button disabled style={pillStyle(false, true)}>
          Semana
        </button>
        <button disabled style={pillStyle(false, true)}>
          Mensal
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {granularity === 'dia' && (
          <>
            <CardList title="Por dia" rows={byDayRows} />
            <CardList title="Por modelo" rows={byModelRows} />
            <CardList title="Por projeto" rows={byProjectRows} />
          </>
        )}
      </div>
    </div>
  );
}
```

O componente vira um flex-column de altura 100% (herdada do contêiner que `App.tsx` vai fornecer na Task 8): a linha de sub-menu (`flexShrink: 0`) não encolhe, e a área de cards (`flex: 1, overflowY: 'auto'`) rola sozinha quando o conteúdo não cabe.

- [ ] **Step 2: Rodar o typecheck**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.web.json`
Expected: mesmo erro esperado em `App.tsx` (ainda não atualizado) — nenhum erro dentro de `Historico.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/src/tabs/Historico.tsx
git commit -m "feat: add a Dia/Semana/Mensal sub-nav and scrolling to Histórico"
```

---

### Task 8: `App.tsx` + `main.css` — barra de título, navegação e layout com rolagem

**Files:**
- Modify: `app/src/renderer/src/App.tsx`
- Modify: `app/src/renderer/src/assets/main.css`

**Interfaces:**
- Consumes: `AoVivo({ blocks, today, lastUpdated, onRefresh })` (Task 6), `Historico({ aggregated })` (Task 7), `window.prismly.hidePopup()`/`window.prismly.refresh()` (Task 4).
- Produces: nada consumido por outra task — é o componente raiz do renderer.

- [ ] **Step 1: Corrigir a base de layout em `app/src/renderer/src/assets/main.css`**

O `body`/`#root` gerados pelo scaffold centralizavam um conteúdo de tamanho fixo (pensado pra tela de boas-vindas do template) — não davam altura cheia pra nada rolar dentro. Substituir o bloco `body { ... }` e `#root { ... }` (linhas 3-35 do arquivo atual) por:

```css
body {
  overflow: hidden;
  background-image: url('./wavy-lines.svg');
  background-size: cover;
  user-select: none;
  height: 100vh;
  margin: 0;
}

#root {
  height: 100%;
  display: flex;
  flex-direction: column;
}
```

(Remove `display: flex; align-items: center; justify-content: center;` do `body`, e `align-items: center; justify-content: center; margin-bottom: 80px;` do `#root` — esses vinham da tela de demonstração do template e atrapalham o layout de altura cheia.)

- [ ] **Step 2: Substituir `app/src/renderer/src/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import type { UsageBucket, UsagePayload } from '../../shared/types';
import { Historico } from './tabs/Historico';
import { AoVivo } from './tabs/AoVivo';

type View = 'ao-vivo' | 'historico' | 'configuracao';

const dragHandleStyle = {
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingLeft: 12,
  paddingRight: 6,
  fontSize: 12,
  color: '#999',
  WebkitAppRegion: 'drag',
  flexShrink: 0,
} as const;

const windowButtonStyle = {
  width: 18,
  height: 18,
  border: 'none',
  background: '#2a2a2a',
  color: '#ccc',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
  WebkitAppRegion: 'no-drag',
} as const;

function navButtonStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    flex: 1,
    textAlign: 'center',
    padding: '8px 0',
    fontSize: 12,
    fontWeight: active ? 'bold' : 'normal',
    color: disabled ? '#555' : active ? '#fff' : '#999',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #4f9eff' : '2px solid transparent',
    cursor: disabled ? 'default' : 'pointer',
  };
}

export function App(): JSX.Element {
  const [payload, setPayload] = useState<UsagePayload | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [view, setView] = useState<View>('ao-vivo');

  useEffect(() => {
    return window.prismly.onUsageUpdate((newPayload) => {
      setPayload(newPayload);
      setLastUpdated(new Date());
    });
  }, []);

  if (!payload) {
    return <p>Carregando dados de uso...</p>;
  }

  if (payload.aggregated.totals.count === 0) {
    return <p>Nenhum uso encontrado ainda.</p>;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const today: UsageBucket | undefined = payload.aggregated.byDay[todayKey];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div style={dragHandleStyle}>
        <span>Prismly</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={windowButtonStyle} onClick={() => window.prismly.hidePopup()}>
            —
          </button>
          <button style={windowButtonStyle} onClick={() => window.prismly.hidePopup()}>
            ×
          </button>
        </div>
      </div>
      <nav style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid #2a2a2a' }}>
        <button
          onClick={() => setView('ao-vivo')}
          disabled={view === 'ao-vivo'}
          style={navButtonStyle(view === 'ao-vivo', false)}
        >
          Ao vivo
        </button>
        <button
          onClick={() => setView('historico')}
          disabled={view === 'historico'}
          style={navButtonStyle(view === 'historico', false)}
        >
          Histórico
        </button>
        <button disabled style={navButtonStyle(false, true)}>
          Configuração
        </button>
      </nav>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {view === 'ao-vivo' && (
          <AoVivo
            blocks={payload.blocks}
            today={today}
            lastUpdated={lastUpdated}
            onRefresh={() => window.prismly.refresh()}
          />
        )}
        {view === 'historico' && <Historico aggregated={payload.aggregated} />}
      </div>
    </div>
  );
}
```

Note sobre `dragHandleStyle`/`windowButtonStyle`: seguem o mesmo padrão já usado nesse arquivo (`as const` numa `const` separada, não inline no JSX) pra `WebkitAppRegion` — `drag` na faixa toda, `no-drag` nos dois botões (que agora ficam DENTRO da faixa arrastável, então precisam da marcação explícita pra continuar clicáveis).

- [ ] **Step 3: Rodar o typecheck**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.web.json`
Expected: sem erros (fecha o ciclo das Tasks 6-8).

- [ ] **Step 4: Commit**

```bash
git add app/src/renderer/src/App.tsx app/src/renderer/src/assets/main.css
git commit -m "feat: add a custom titlebar and Ao vivo/Histórico/Configuração navigation"
```

---

### Task 9: Verificação manual de ponta a ponta

**Files:** nenhum (só validação).

**Interfaces:** N/A.

- [ ] **Step 1: Rodar o typecheck completo**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`
Expected: sem erros em nenhum dos dois.

- [ ] **Step 2: Rodar o app em modo dev**

Run (dentro de `app/`, com `ELECTRON_RUN_AS_NODE` removido do ambiente se estiver setado): `npm run dev`
Expected: nenhuma janela abre sozinha; ícone aparece na bandeja.

- [ ] **Step 3: Testar a barra de título e os botões**

Abrir o popup pelo ícone. Verificar a faixa "Prismly" no topo com os dois botões (— e ×) à direita.
Expected: arrastar pela faixa (fora dos botões) move a janela; clicar em qualquer um dos dois botões esconde o popup; clicar fora do popup (sem usar os botões) **não** esconde mais.

- [ ] **Step 4: Testar redimensionar**

Abrir o popup, arrastar uma borda/canto pra redimensionar.
Expected: a janela redimensiona livremente, sem ficar menor que 320x400. Esconder e abrir de novo confirma que lembrou o tamanho.

- [ ] **Step 5: Testar a navegação nova**

Clicar em "Ao vivo", "Histórico"; tentar clicar em "Configuração".
Expected: "Ao vivo" mostra a barra de progresso da sessão, registros do bloco, resumo "Hoje" e "Atualizado às HH:MM" com botão "Atualizar". "Histórico" mostra o sub-menu Dia/Semana/Mensal (só "Dia" clicável) com os cards de antes, rolando quando não cabe. "Configuração" não responde a clique (desabilitado).

- [ ] **Step 6: Testar o botão Atualizar**

Na aba "Ao vivo", clicar em "Atualizar".
Expected: o "Atualizado às HH:MM" muda pro horário atual.

- [ ] **Step 7: Testar "Redefinir janela"**

Com o popup redimensionado e/ou movido, clicar com o botão direito no ícone da bandeja → "Redefinir janela".
Expected: o popup volta ao tamanho padrão (380x500) e à posição ancorada acima do ícone.

- [ ] **Step 8: Confirmar que "Sair" continua funcionando**

Clique direito no ícone → "Sair".
Expected: o processo do Electron encerra por completo.

- [ ] **Step 9: Commit final (se houver ajustes pendentes da verificação)**

```bash
git add -A
git commit -m "chore: final verification pass for the popup chrome and navigation redesign"
```
