# Design: janela customizada, navegação e "Ao vivo" enriquecido

## Contexto

Depois de implementar cards + arrastar (spec/plano anteriores), testar o popup de verdade revelou mais três problemas e um pedido de melhoria:

1. **Esconder ao perder o foco é ruim.** O popup soma "esconde automaticamente ao clicar fora" com nenhum controle manual — fácil de fechar sem querer, sem jeito explícito de minimizar/fechar.
2. **Sem scroll visível no Histórico.** Quando o conteúdo não cabe na altura da janela, não há como rolar.
3. **A navegação Ao vivo/Histórico ficou confusa.** O usuário trouxe referências (página de Uso do Claude.ai, `ai-usagebar` do akitaonrails) — ambos mostram barras de progresso de uso e um cabeçalho de navegação mais claro, sem o padrão atual de dois botões `disabled`.
4. **Tamanho fixo é limitante.** O usuário quer redimensionar o popup livremente.

Essa spec resolve os quatro, mais aproveita pra desenhar a navegação já pensando na Fase 4 do roadmap (visões semanal/mensal) — sem implementar os dados ainda, só o espaço.

## Escopo

- Barra de título customizada (já que a janela é `frame: false`): rótulo "Prismly" arrastável + botão de minimizar + botão de fechar, os dois escondendo o popup (não encerram o app — sair continua só pelo menu do clique direito no ícone).
- Remover o comportamento de esconder ao perder o foco (`blur`) — só os botões escondem agora.
- Tornar o popup redimensionável, com tamanho mínimo (320x400) e tamanho lembrado entre uma abertura e outra (igual à posição já implementada).
- Trocar a navegação atual (dois botões `disabled`) por um cabeçalho com três itens: **Ao vivo**, **Histórico**, **Configuração** (desabilitado por enquanto — sem nada de configuração real ainda).
- Dentro de "Histórico", adicionar uma segunda linha de navegação: **Dia** (funcional, mostra o que já existe — Por dia/Por modelo/Por projeto, sem mudança), **Semana** e **Mensal** (visíveis mas desabilitados — a lógica de agregação semanal/mensal é da Fase 4, ainda não implementada).
- Enriquecer a aba "Ao vivo": adicionar contagem de registros do bloco atual, um resumo do dia inteiro ("Hoje: custo e registros"), e um botão de atualizar manual ao lado do "Atualizado às HH:MM".
- Scroll: só a lista de cards do Histórico rola (o cabeçalho e o bloco "Ao vivo" nunca saem de vista quando estão na tela ativa — cada tela de conteúdo tem sua própria área rolável quando não cabe).

Fora de escopo: implementar de verdade a agregação semanal/mensal (Fase 4), qualquer configuração real por trás do botão "Configuração", detalhamento de modelo dentro dos cards "Por dia" (o `ai-usagebar`/Claude.ai mostram % de limite do plano — o Prismly não tem acesso ao limite real da assinatura, só ao uso computado a partir dos logs, então a barra de "Ao vivo" continua representando "tempo decorrido da janela de 5h", não "% do limite").

## Barra de título e controles de janela

Como a `BrowserWindow` é `frame: false`, os controles de minimizar/fechar precisam ser desenhados no renderer e comunicados ao processo principal via IPC (o renderer não pode chamar `BrowserWindow.hide()` diretamente). Dois pontos novos:

- `app/src/preload/index.ts` ganha `hidePopup(): void`, que envia `ipcRenderer.send('popup:hide')`.
- `app/src/main/index.ts` (ou `popupWindow.ts`) registra `ipcMain.on('popup:hide', () => popupWindow?.hide())`.

Os dois botões (minimizar e fechar) chamam a mesma função `window.prismly.hidePopup()` — visualmente parecem dois controles distintos (familiar pra quem já usou qualquer app de janela), mas os dois só escondem o popup, igual ao que o clique no ícone da bandeja já faz.

O `blur` → `hide()` que existe hoje em `popupWindow.ts` é removido.

## Redimensionamento e geometria salva

O módulo `popupPosition.ts` (que hoje só guarda x/y) passa a se chamar **`popupGeometry.ts`** e guarda x, y, largura e altura juntos — faz sentido unificar já que os dois são "onde e do tamanho de quê está a janela", e o Electron já entrega os dois juntos via `BrowserWindow.getBounds()`.

```ts
interface SavedGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

- `saveGeometry(x, y, width, height)`, `loadGeometry()`, `isPositionOnScreen(x, y)` (mantém, só valida a posição — tamanho não fica "fora da tela" do mesmo jeito), `clearGeometry()`.
- `createPopupWindow()` usa `loadGeometry()` pra decidir a largura/altura iniciais da janela (cai no padrão 380x500 se não houver nada salvo) — isso já resolve o tamanho na criação, sem precisar de outro passo depois.
- A janela ganha `resizable: true`, `minWidth: 320`, `minHeight: 400`.
- Um único handler debounced (300ms), escutando tanto `moved` quanto `resize`, chama `popupWindow.getBounds()` e salva tudo de uma vez com `saveGeometry(...)`.
- O item "Redefinir posição" do menu do clique direito passa a se chamar **"Redefinir janela"** e limpa a geometria inteira (posição E tamanho), não só a posição.

## Navegação

Cabeçalho principal com três itens, abaixo da barra de título: **Ao vivo** / **Histórico** / **Configuração**. "Configuração" fica visualmente presente mas desabilitado (clicável no futuro, sem ação agora) — evita precisar redesenhar o cabeçalho quando a Fase 2 ganhar configurações de verdade.

Ao selecionar "Histórico", aparece uma segunda linha de navegação abaixo do cabeçalho principal: **Dia** / **Semana** / **Mensal**. Só "Dia" é clicável agora (mostra exatamente o que já existe: as três listas de cards Por dia/Por modelo/Por projeto, sem nenhuma mudança de conteúdo). "Semana" e "Mensal" ficam visíveis mas desabilitados — a estrutura já existe pronta pra quando a Fase 4 implementar a agregação de verdade.

## "Ao vivo" enriquecido

Além do que já existe (início/fim do bloco como barra de progresso do tempo decorrido na janela de 5h, custo e tokens do bloco), adiciona-se:

- **Registros do bloco atual** — `activeBlock.count`, já disponível no `SessionBlock`.
- **Resumo "Hoje"** — uma linha separada abaixo, usando `aggregated.byDay[hoje]` (já calculado e presente no payload) pra mostrar custo e registros do dia inteiro — dá contexto além da janela de 5h, que pode ter reiniciado mais de uma vez no dia.
- **"Atualizado às HH:MM" + botão "Atualizar"** — o botão dispara uma atualização imediata sob demanda, sem esperar o próximo evento do `fs.watch`. Precisa de mais uma ponta de IPC: `window.prismly.refresh(): void` → `ipcRenderer.send('usage:refresh')` no preload → `ipcMain.on('usage:refresh', () => sendUpdate())` no processo principal (reaproveita a função `sendUpdate()` que já existe).

## Testes

Sem testes automatizados novos — mesma justificativa das specs anteriores (infraestrutura de UI nativa/layout). Verificação manual cobre: os botões de minimizar/fechar escondem o popup (sem fechar sozinho ao clicar fora), redimensionar funciona e é lembrado, a navegação nova funciona (Ao vivo/Histórico/Configuração desabilitado, Dia/Semana desabilitado/Mensal desabilitado dentro de Histórico), e os dados novos do "Ao vivo" (registros, resumo do dia, atualizar manual) aparecem corretos.
