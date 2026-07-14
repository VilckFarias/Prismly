# Tela de Configuração — Temas Personalizáveis (Design)

## Contexto

A aba "Configuração" existe como botão desabilitado em [`App.tsx`](../../../app/src/renderer/src/App.tsx), pré-cabeada desde a Fase 2. O fundo visual do app hoje ainda é o padrão do template `electron-vite` — `background-image: url('./wavy-lines.svg')` em [`main.css`](../../../app/src/renderer/src/assets/main.css) — e várias cores (fundo dos cards, texto) estão fixas em hex espalhado pelo código, junto com uma pilha de CSS morto herdado do scaffold original (`.logo`, `.creator`, `.text`, `.tip`, `.react`, `.ts`, `.actions`, `.action`, `.versions` — nenhum componente atual usa essas classes).

Esta feature implementa a primeira versão da tela de Configuração: escolha de tema visual, com presets prontos e um modo personalizado.

## Decisões

- **Cores personalizáveis:** fundo da tela, cor do texto, fundo dos cards/tabelas — 3 propriedades. A cor de destaque azul (`#4f9eff`) e os cinzas de texto secundário (`#999` etc.) ficam fixos, fora do escopo do tema.
- **Persistência:** arquivo JSON via processo main (`theme.json` em `app.getPath('userData')`), seguindo o mesmo padrão já usado por `popupGeometry.ts` para a posição da janela — não localStorage, para consistência com o resto do projeto e alinhado com a prática comum em apps Electron (VS Code, Discord, Slack etc. também guardam preferências via um store gerenciado pelo processo principal, não localStorage).
- **Aplicação:** ao vivo, sem botão "Salvar" separado — clicar num preset ou mexer num seletor de cor já aplica na tela e já persiste.
- **Presets** (8 no total, incluindo Personalizado):

| Nome | Fundo (`bg`) | Texto (`text`) | Fundo do card (`cardBg`) |
|---|---|---|---|
| Escuro (padrão) | `#1b1b1f` | `rgba(255,255,245,0.86)` | `#242424` |
| Escuro Azulado | `#10131c` | `#dce6f5` | `#1c2536` |
| Escuro Verde | `#0d1410` | `#b9f6ca` | `#16241a` |
| Meia-noite | `#14102a` | `#e4defa` | `#221c3d` |
| Claro | `#f5f5f5` | `#1b1b1f` | `#ffffff` |
| Claro Quente | `#fdf6e3` | `#3a3226` | `#fffaf0` |
| Alto Contraste | `#000000` | `#ffffff` | `#1a1a1a` |
| Personalizado | (escolhido pelo usuário via 3 seletores de cor) | | |

`Alto Contraste` usa `#1a1a1a` (não `#000000` puro) para o fundo do card, porque a UI existente já depende de fundo-vs-card terem cores diferentes para os cards se distinguirem visualmente do fundo (ver `CardList` em `Historico.tsx`, que hoje já é só uma diferença de tom de cinza) — usar preto puro nos dois deixaria os cards invisíveis.

## 1. Camada de dados e persistência (`app/src/main/`)

Novo arquivo `app/src/main/themeSettings.ts`, seguindo exatamente o padrão de `popupGeometry.ts`:

```ts
import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ThemeColors {
  bg: string;
  text: string;
  cardBg: string;
}

export interface SavedTheme {
  preset: string;
  colors: ThemeColors;
}

const DEFAULT_THEME: SavedTheme = {
  preset: 'escuro',
  colors: { bg: '#1b1b1f', text: 'rgba(255,255,245,0.86)', cardBg: '#242424' },
};

function getThemeFilePath(): string {
  return join(app.getPath('userData'), 'theme.json');
}

export function saveTheme(theme: SavedTheme): void {
  writeFileSync(getThemeFilePath(), JSON.stringify(theme));
}

export function loadTheme(): SavedTheme {
  const filePath = getThemeFilePath();
  if (!existsSync(filePath)) return DEFAULT_THEME;

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as SavedTheme;
    if (
      typeof parsed.preset !== 'string' ||
      typeof parsed.colors?.bg !== 'string' ||
      typeof parsed.colors?.text !== 'string' ||
      typeof parsed.colors?.cardBg !== 'string'
    ) {
      return DEFAULT_THEME;
    }
    return parsed;
  } catch {
    return DEFAULT_THEME;
  }
}
```

`app/src/main/index.ts` ganha dois handlers IPC:

```ts
ipcMain.handle('theme:get', () => loadTheme());
ipcMain.on('theme:set', (_event, theme: SavedTheme) => saveTheme(theme));
```

## 2. Preload e tipos compartilhados

`app/src/preload/index.ts` ganha duas entradas na API exposta:

```ts
getTheme(): Promise<SavedTheme> {
  return ipcRenderer.invoke('theme:get');
},
setTheme(theme: SavedTheme): void {
  ipcRenderer.send('theme:set', theme);
},
```

`SavedTheme`/`ThemeColors` viram tipos compartilhados em `app/src/shared/types.ts` (não em `core/`, já que isso é puramente uma preferência de UI do app Electron, sem relação com a camada de dados de uso/custo).

## 3. Presets e aplicação de tema (renderer)

Novo arquivo `app/src/renderer/src/themes.ts`, com a tabela de presets (a mesma da tabela acima) e uma função `applyTheme(colors: ThemeColors): void` que seta as 3 variáveis CSS na raiz:

```ts
export function applyTheme(colors: ThemeColors): void {
  document.documentElement.style.setProperty('--theme-bg', colors.bg);
  document.documentElement.style.setProperty('--theme-text', colors.text);
  document.documentElement.style.setProperty('--theme-card-bg', colors.cardBg);
}
```

`App.tsx` carrega o tema salvo (`window.prismly.getTheme()`) uma vez ao montar, aplica via `applyTheme`, e guarda o tema atual em estado (`useState`) pra passar pra tela de Configuração.

`main.css`/`base.css`: `body` passa a usar `background: var(--theme-bg)` e `color: var(--theme-text)` no lugar dos valores fixos atuais, e a `background-image: url('./wavy-lines.svg')` é removida. O CSS morto do scaffold (`.logo`, `.creator`, `.text`, `.tip`, `.react`, `.ts`, `.actions`, `.action`, `.versions`) é removido junto, já que nenhum componente usa.

`Historico.tsx`: o `CardList` troca `background: '#242424'` fixo por `background: 'var(--theme-card-bg)'`.

A cor de destaque azul (`#4f9eff`) e os textos secundários cinza (`#999`, `#555` etc.) permanecem fixos em todo o código — fora do escopo desta feature.

## 4. Tela de Configuração (`Configuracao.tsx`)

Nova aba, recebendo o tema atual e um callback de mudança como props (`currentTheme: SavedTheme`, `onThemeChange: (theme: SavedTheme) => void` — o `App.tsx` é quem chama `applyTheme` e `window.prismly.setTheme` dentro desse callback, mantendo `Configuracao.tsx` sem conhecimento de IPC, só de props, no mesmo espírito dos outros componentes de aba).

Mostra uma grade de 8 "swatches" clicáveis (os 7 presets fixos + "Personalizado"), cada um exibindo uma pequena prévia das 3 cores daquele tema e destacando visualmente qual está ativo. Clicar em um preset fixo chama `onThemeChange({ preset: <nome>, colors: <cores do preset> })` imediatamente. Clicar em "Personalizado" revela 3 `<input type="color">` (fundo, texto, fundo do card) inicializados com as cores do tema atual; mexer em qualquer um deles chama `onThemeChange({ preset: 'personalizado', colors: {...} })` com o valor atualizado.

`App.tsx` habilita o botão "Configuração" no nav (hoje `disabled`) e passa a renderizar `<Configuracao currentTheme={theme} onThemeChange={handleThemeChange} />` quando `view === 'configuracao'`.

## Testes manuais

Depois da implementação: abrir a aba Configuração, clicar em cada um dos 7 presets e confirmar que fundo/texto/cards mudam imediatamente em todas as abas (Ao vivo, Histórico, Configuração). Testar "Personalizado": mudar cada seletor de cor e confirmar aplicação ao vivo. Fechar e reabrir o app (ou usar "Redefinir janela") e confirmar que o tema escolhido persiste. Confirmar que a cor de destaque azul dos botões ativos não muda com nenhum tema.
