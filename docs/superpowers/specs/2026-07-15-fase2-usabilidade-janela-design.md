# Fase 2 — Usabilidade e Comportamento da Janela — Design

## Contexto

Segunda de três fases de melhoria pedidas pelo usuário (Fase 1: correções críticas, já implementada; Fase 3: defesa contra falhas de preço, ainda pendente). Esta fase cobre três itens relacionados a usabilidade:

1. Inverter a ordenação das listas do Histórico (mais recente no topo).
2. Reorganizar a tela de Configuração em sub-abas, já que ela vai ganhar um terceiro grupo de configurações.
3. Adicionar um toggle "Sempre no topo" pra resolver um problema real relatado: quando o Prismly está aberto e o usuário clica em outro app (ex: VS Code), a janela do Prismly não fecha nem esconde — ela cai pra trás na pilha de janelas do Windows (sobreposição/z-order), parecendo ter "sumido" mesmo continuando tecnicamente aberta.

## Decisões

- **Ordenação**: inverte nos três modos do Histórico (Dia, Semana, Mês) — mais recente primeiro. "Por modelo"/"Por projeto" não mudam (já ordenam por custo).
- **Organização da Configuração**: sub-abas dentro da tela, no mesmo estilo visual de pílulas do sub-nav Dia/Semana/Mês do Histórico. Dois grupos: **Aparência** (Tema + Moeda, o que já existe hoje) e **Comportamento** (Janela — o item novo). "Aparência" selecionado por padrão.
- **Toggle "Sempre no topo"**: desligado por padrão (preserva o comportamento atual de flyout de bandeja). Aplica ao vivo, sem botão "Salvar", mesmo padrão de tema/moeda. Não afeta arrastar/redimensionar a janela — só a posição na pilha de janelas (z-order) em relação a outros apps.

## 1. Ordenação invertida no Histórico

`app/src/renderer/src/tabs/Historico.tsx` — as três linhas de ordenação:

```ts
const byDayRows = Object.entries(aggregated.byDay).sort(([a], [b]) => a.localeCompare(b));
const byWeekRows = Object.entries(aggregated.byWeek).sort(([a], [b]) => a.localeCompare(b)).map(...)
const byMonthRows = Object.entries(aggregated.byMonth).sort(([a], [b]) => a.localeCompare(b)).map(...)
```

Trocam `a.localeCompare(b)` por `b.localeCompare(a)` nas três. Como a ordenação já acontece sobre a chave ISO crua (antes de formatar o rótulo de exibição), inverter o comparador basta — não precisa mexer em mais nada.

## 2. Toggle "Sempre no topo" (processo main)

Novo arquivo `app/src/main/windowSettings.ts`, mesmo padrão de `themeSettings.ts`/`currencySettings.ts`:

```ts
export interface WindowSettings {
  alwaysOnTop: boolean;
}
```

Persistido em `window.json` (`app.getPath('userData')`), com `loadWindowSettings()`/`saveWindowSettings()` no formato validado-com-fallback já estabelecido, padrão `{ alwaysOnTop: false }`.

`app/src/main/popupWindow.ts`: `createPopupWindow()` lê essa configuração e passa `alwaysOnTop: saved.alwaysOnTop` já na criação da `BrowserWindow`, junto com os outros parâmetros existentes.

`app/src/main/index.ts`: dois canais IPC — `window:getSettings` (`ipcMain.handle`, retorna o objeto) e `window:setAlwaysOnTop` (`ipcMain.on`, recebe o boolean, salva, e chama `popupWindow.setAlwaysOnTop(valor)` imediatamente — método nativo do `BrowserWindow` do Electron que aplica em tempo real, sem precisar recriar a janela).

## 3. Renderer — sub-abas na Configuração + toggle

`app/src/shared/types.ts` ganha `WindowSettings` (espelhando o do main). `app/src/preload/index.ts`/`prismly.d.ts` ganham `getWindowSettings()`/`setAlwaysOnTop(value)`, no mesmo padrão de `getTheme`/`setTheme`.

`Configuracao.tsx` ganha um sub-nav no topo (pílulas, mesmo estilo do Histórico): "Aparência" / "Comportamento", com estado local (`useState`) controlando qual sub-aba está visível — não precisa vir de fora, é só um detalhe de apresentação interno do componente. O conteúdo de "Tema" e "Moeda" que já existe hoje fica dentro do bloco `{subView === 'aparencia' && (...)}`, sem nenhuma mudança de lógica — só entra num condicional novo. Uma seção "Janela" nova, com um único toggle "Sempre no topo" (checkbox estilizado ou botão de dois estados, mesmo espírito visual dos outros toggles), fica dentro de `{subView === 'comportamento' && (...)}`.

`App.tsx` carrega `windowSettings` no mount (mesmo padrão de tema/moeda), guarda em estado, e passa `windowSettings`/`onAlwaysOnTopChange` como novas props pra `Configuracao`. `handleAlwaysOnTopChange` chama `window.prismly.setAlwaysOnTop(valor)` e atualiza o estado local, aplicando ao vivo.

## Testes manuais

Depois da implementação: no Histórico, confirmar que os três modos mostram o mais recente no topo. Na Configuração, confirmar que as sub-abas "Aparência"/"Comportamento" aparecem e alternam corretamente, com Tema/Moeda intactos dentro de "Aparência". Ligar "Sempre no topo", abrir o VS Code (ou outro app) em foco, e confirmar que o Prismly continua visível por cima. Desligar o toggle e confirmar que volta a cair atrás normalmente. Fechar e reabrir o app e confirmar que a preferência persiste.
