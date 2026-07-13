# Cards no Histórico + posicionamento livre do popup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar as tabelas do "Histórico" por cards (cabem no popup de 380px) e permitir arrastar o popup livremente pela tela, lembrando a posição entre uma abertura e outra.

**Architecture:** Um novo módulo `app/src/main/popupPosition.ts` cuida de salvar/carregar/validar/limpar a posição salva num arquivo JSON. `popupWindow.ts` grava a posição (com debounce) quando a janela é movida. `tray.ts` usa a posição salva (se válida) em vez de sempre ancorar acima do ícone, e ganha um item de menu "Redefinir posição". No renderer, `Historico.tsx` troca `Table` por `CardList`, e `App.tsx` ganha uma faixa de arrastar no topo.

**Tech Stack:** Electron (`screen`, `BrowserWindow.on('moved')`), TypeScript, React — sem novas dependências.

## Global Constraints

- Nenhum teste automatizado novo (infraestrutura de UI nativa/layout, sem lógica de negócio isolada — mesma justificativa da spec anterior).
- Windows-first.
- Identificadores de código em inglês; texto voltado ao usuário final em português ("Redefinir posição", "Prismly" na faixa de arrastar).
- As Tasks 1-3 do plano anterior (`2026-07-12-tray-app.md`) já estão implementadas e revisadas — este plano modifica `tray.ts` e `popupWindow.ts` (criados lá), não os recria do zero.

---

### Task 1: `app/src/main/popupPosition.ts` — salvar/carregar/validar/limpar posição

**Files:**
- Create: `app/src/main/popupPosition.ts`

**Interfaces:**
- Consumes: nada de outras tasks.
- Produces: `savePosition(x: number, y: number): void`, `loadPosition(): { x: number; y: number } | null`, `isPositionOnScreen(x: number, y: number): boolean`, `clearPosition(): void` — usados por `app/src/main/popupWindow.ts` e `app/src/main/tray.ts` (Task 4).

- [ ] **Step 1: Criar `app/src/main/popupPosition.ts`**

```ts
import { app, screen } from 'electron';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface SavedPosition {
  x: number;
  y: number;
}

function getPositionFilePath(): string {
  return join(app.getPath('userData'), 'popup-position.json');
}

export function savePosition(x: number, y: number): void {
  writeFileSync(getPositionFilePath(), JSON.stringify({ x, y }));
}

export function loadPosition(): SavedPosition | null {
  const filePath = getPositionFilePath();
  if (!existsSync(filePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as SavedPosition;
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return null;
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

export function clearPosition(): void {
  const filePath = getPositionFilePath();
  if (existsSync(filePath)) unlinkSync(filePath);
}
```

`isPositionOnScreen` checa se o canto superior-esquerdo salvo (x, y) cai dentro dos limites de algum monitor conectado no momento — suficiente pra detectar o caso principal (monitor desconectado, posição salva de uma configuração de tela que não existe mais).

- [ ] **Step 2: Rodar o typecheck**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.node.json`
Expected: sem erros (arquivo ainda não é importado por ninguém, mas deve compilar isolado).

- [ ] **Step 3: Commit**

```bash
git add app/src/main/popupPosition.ts
git commit -m "feat: add popup position persistence and screen-bounds validation"
```

---

### Task 2: Cards no Histórico

**Files:**
- Modify: `app/src/renderer/src/tabs/Historico.tsx`

**Interfaces:**
- Consumes: `AggregatedUsage`, `UsageBucket` de `../../../shared/types` (já usado hoje, sem mudança).
- Produces: `Historico({ aggregated: AggregatedUsage }): JSX.Element` — mesma assinatura de hoje, usado por `App.tsx` (sem mudança de interface, só o conteúdo interno).

- [ ] **Step 1: Substituir `app/src/renderer/src/tabs/Historico.tsx`**

```tsx
import type { JSX } from 'react';
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

export function Historico({ aggregated }: { aggregated: AggregatedUsage }): JSX.Element {
  const byDayRows = Object.entries(aggregated.byDay).sort(([a], [b]) => a.localeCompare(b));
  const byModelRows = Object.entries(aggregated.byModel).sort(([, a], [, b]) => b.cost - a.cost);
  const byProjectRows = Object.entries(aggregated.byProject).sort(([, a], [, b]) => b.cost - a.cost);

  return (
    <div>
      <CardList title="Por dia" rows={byDayRows} />
      <CardList title="Por modelo" rows={byModelRows} />
      <CardList title="Por projeto" rows={byProjectRows} />
    </div>
  );
}
```

Cada card mostra a chave (dia/modelo/projeto) e o custo em destaque no cabeçalho, e os outros 5 valores (que antes eram colunas largas) numa grade de 2 colunas abaixo — nenhum dado é removido, só reorganizado verticalmente. A ordenação de cada lista (Por dia: crescente por data; Por modelo/Por projeto: decrescente por custo) continua igual a antes.

- [ ] **Step 2: Rodar o typecheck**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.web.json`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/src/tabs/Historico.tsx
git commit -m "feat: replace the wide Histórico tables with card lists"
```

---

### Task 3: Faixa de arrastar no popup

**Files:**
- Modify: `app/src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: nada novo.
- Produces: nada consumido por outra task.

- [ ] **Step 1: Adicionar a faixa de arrastar em `app/src/renderer/src/App.tsx`**

Adicionar, logo antes do `return` final da função `App` (dentro do componente, acima do `return`):

```tsx
const dragHandleStyle = {
  height: 24,
  display: 'flex',
  alignItems: 'center',
  paddingLeft: 12,
  fontSize: 12,
  color: '#999',
  WebkitAppRegion: 'drag',
} as const;
```

E adicionar `<div style={dragHandleStyle}>Prismly</div>` como o primeiro filho do `<div>` raiz retornado, antes do `<nav>`:

```tsx
  return (
    <div>
      <div style={dragHandleStyle}>Prismly</div>
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
      {tab === 'ao-vivo' ? <AoVivo blocks={payload.blocks} /> : <Historico aggregated={payload.aggregated} />}
    </div>
  );
```

Nota importante: passar `dragHandleStyle` como uma variável separada (não escrever o objeto direto dentro de `style={{ ... }}` no JSX) é proposital — `WebkitAppRegion` não é uma propriedade reconhecida pelo tipo `CSSProperties` do React (é uma extensão específica do Electron, não CSS padrão). Declarando o objeto como uma `const` separada com `as const`, o TypeScript não aplica a checagem de "propriedade excedente" que aplicaria se o objeto literal fosse escrito direto dentro do atributo `style={}` — só checa compatibilidade estrutural, que passa mesmo com a propriedade extra.

**Se o typecheck (Step 2) reclamar mesmo assim** ("Object literal may only specify known properties" ou similar), troque a declaração por uma com type assertion explícita:

```tsx
const dragHandleStyle: React.CSSProperties = {
  height: 24,
  display: 'flex',
  alignItems: 'center',
  paddingLeft: 12,
  fontSize: 12,
  color: '#999',
  WebkitAppRegion: 'drag',
} as React.CSSProperties;
```

(nesse caso, precisa `import type { CSSProperties } from 'react'` ou usar `React.CSSProperties` com `import * as React from 'react'` — ajuste o import conforme o que o typecheck pedir.) Use a primeira versão (sem anotação de tipo) como tentativa inicial; só troque pra essa segunda se o typecheck realmente falhar.

- [ ] **Step 2: Rodar o typecheck**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.web.json`
Expected: sem erros. Se der erro relacionado a `WebkitAppRegion`, aplicar o fallback do Step 1 antes de continuar.

- [ ] **Step 3: Commit**

```bash
git add app/src/renderer/src/App.tsx
git commit -m "feat: add a drag handle strip to the frameless popup"
```

---

### Task 4: Ligar a persistência de posição no processo principal

**Files:**
- Modify: `app/src/main/popupWindow.ts`
- Modify: `app/src/main/tray.ts`

**Interfaces:**
- Consumes: `savePosition`, `loadPosition`, `isPositionOnScreen`, `clearPosition` de `./popupPosition` (Task 1).
- Produces: nada novo exportado — `createPopupWindow`/`createTray` mantêm as mesmas assinaturas já usadas por `app/src/main/index.ts`.

- [ ] **Step 1: Adicionar o handler de `moved` em `app/src/main/popupWindow.ts`**

Substituir o conteúdo do arquivo por:

```ts
import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { savePosition } from './popupPosition';

export const POPUP_WIDTH = 380;
export const POPUP_HEIGHT = 500;

const SAVE_POSITION_DEBOUNCE_MS = 300;

export function createPopupWindow(): BrowserWindow {
  const popupWindow = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
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

  popupWindow.on('blur', () => {
    popupWindow.hide();
  });

  let saveTimeout: NodeJS.Timeout | null = null;
  popupWindow.on('moved', () => {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const [x, y] = popupWindow.getPosition();
      savePosition(x, y);
    }, SAVE_POSITION_DEBOUNCE_MS);
  });

  return popupWindow;
}
```

- [ ] **Step 2: Usar a posição salva e adicionar "Redefinir posição" em `app/src/main/tray.ts`**

Substituir o conteúdo do arquivo por:

```ts
import { app, BrowserWindow, Menu, Tray } from 'electron';
import { join } from 'node:path';
import { POPUP_HEIGHT, POPUP_WIDTH } from './popupWindow';
import { clearPosition, isPositionOnScreen, loadPosition } from './popupPosition';

function anchorAboveTray(popupWindow: BrowserWindow, tray: Tray): void {
  const trayBounds = tray.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - POPUP_WIDTH / 2);
  const y = Math.round(trayBounds.y - POPUP_HEIGHT);
  popupWindow.setPosition(x, y, false);
}

function positionPopup(popupWindow: BrowserWindow, tray: Tray): void {
  const saved = loadPosition();
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

function resetPosition(popupWindow: BrowserWindow, tray: Tray): void {
  clearPosition();
  if (popupWindow.isVisible()) {
    anchorAboveTray(popupWindow, tray);
  }
}

export function createTray(popupWindow: BrowserWindow): Tray {
  const tray = new Tray(join(__dirname, '../../resources/icon.png'));
  tray.setToolTip('Prismly');

  tray.on('click', () => togglePopup(popupWindow, tray));

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Redefinir posição', click: () => resetPosition(popupWindow, tray) },
    { label: 'Sair', click: () => app.quit() },
  ]);
  tray.setContextMenu(contextMenu);

  return tray;
}
```

`positionPopup` (chamada só dentro deste arquivo) troca a antiga lógica fixa por: usa a posição salva se existir e estiver dentro da tela atual, senão cai no `anchorAboveTray` (a mesma lógica de ancoragem de antes, só renomeada pra deixar claro que agora é o fallback, não o único caminho).

- [ ] **Step 3: Rodar o typecheck**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.node.json`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add app/src/main/popupWindow.ts app/src/main/tray.ts
git commit -m "feat: remember popup position between opens, with a reset option"
```

---

### Task 5: Verificação manual de ponta a ponta

**Files:** nenhum (só validação).

**Interfaces:** N/A.

- [ ] **Step 1: Rodar o typecheck completo**

Run (dentro de `app/`): `npx tsc --noEmit -p tsconfig.node.json && npx tsc --noEmit -p tsconfig.web.json`
Expected: sem erros em nenhum dos dois.

- [ ] **Step 2: Rodar o app em modo dev**

Run (dentro de `app/`, com `ELECTRON_RUN_AS_NODE` removido do ambiente se estiver setado): `npm run dev`
Expected: nenhuma janela abre sozinha; ícone aparece na bandeja (pode estar na área de ícones ocultos do Windows).

- [ ] **Step 3: Conferir os cards**

Clicar no ícone da bandeja pra abrir o popup, ir na aba "Histórico".
Expected: as três seções (Por dia, Por modelo, Por projeto) aparecem como listas de cards, sem nenhum corte horizontal — todo o conteúdo cabe dentro dos 380px de largura.

- [ ] **Step 4: Testar arrastar e lembrar posição**

Arrastar o popup pela faixa "Prismly" no topo pra outro canto da tela. Fechar o popup (clicar fora) e abrir de novo (clique no ícone).
Expected: o popup abre na mesma posição pra onde foi arrastado, não mais ancorado acima do ícone.

- [ ] **Step 5: Testar "Redefinir posição"**

Com o popup ainda numa posição arrastada, clicar com o botão direito no ícone da bandeja e escolher "Redefinir posição".
Expected: o popup volta a aparecer ancorado acima do ícone da bandeja. Fechar e abrir de novo confirma que continua ancorado (a posição salva foi mesmo apagada).

- [ ] **Step 6: Confirmar que "Sair" continua funcionando**

Clique direito no ícone, "Sair".
Expected: o processo do Electron encerra por completo.

- [ ] **Step 7: Commit final (se houver ajustes pendentes da verificação)**

```bash
git add -A
git commit -m "chore: final verification pass for the popup layout and positioning"
```
