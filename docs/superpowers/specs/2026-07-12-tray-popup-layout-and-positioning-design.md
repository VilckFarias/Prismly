# Design: layout em cards + posicionamento livre do popup

## Contexto e motivação

Depois de implementar e revisar as Tasks 1-3 do plano de app de bandeja (`docs/superpowers/plans/2026-07-12-tray-app.md`) — popup sem bordas, ícone na bandeja, ancoragem acima do ícone — a verificação manual (Task 4) revelou dois problemas reais ao testar o popup de verdade num tamanho de 380x500:

1. **As tabelas do "Histórico" não cabem.** Cada tabela tem 6 colunas (Chave, Tokens entrada, Tokens saída, Cache escrita, Cache leitura, Custo, Registros) — pensadas para a janela de 1000px, não para um popup de 380px. O conteúdo vaza pra fora, exigindo rolagem horizontal.
2. **A ancoragem fixa acima do ícone é rígida demais.** O usuário quer poder colocar o popup em qualquer lugar da tela, não só acima do ícone da bandeja.

Essa spec resolve os dois, sem tocar nas Tasks 1-3 já implementadas (a criação do popup, do ícone e a lógica de ancoragem continuam existindo — a ancoragem vira o comportamento *padrão*, usado como ponto de partida e como fallback).

## Escopo

- Trocar as tabelas do "Histórico" por listas de cards (uma por linha de dado).
- Adicionar uma faixa de arrastar no topo do popup (já que ele não tem barra de título nativa).
- Salvar a posição do popup depois de arrastado, e usá-la nas próximas vezes que abrir.
- Se não houver posição salva, ou se a posição salva cair fora da tela atual (ex: monitor desconectado), volta a ancorar acima do ícone da bandeja.
- Item "Redefinir posição" no menu do clique direito, que limpa a posição salva e reancora imediatamente.

Fora de escopo: mudar o conteúdo da aba "Ao vivo" (já é compacta, cabe bem em 380px sem ajuste — só um bloco de texto, não uma tabela).

## Layout em cards (Histórico)

As três seções (Por dia, Por modelo, Por projeto) passam a usar um componente `CardList` em vez do `Table` atual. Cada item vira um card:

- **Cabeçalho do card:** a chave (dia/modelo/projeto) à esquerda, o custo em destaque (azul, negrito) à direita — replica o que já funcionou bem no mockup aprovado.
- **Corpo do card:** os outros 5 valores (Tokens entrada, Tokens saída, Cache escrita, Cache leitura, Registros) em pares label:valor pequenos, dispostos em duas colunas — nada de dado é perdido, só reorganizado verticalmente em vez de em colunas largas.

A ordenação de cada lista continua igual à de hoje (Por dia: crescente por data; Por modelo/Por projeto: decrescente por custo).

## Arrastar o popup

Como o popup é `frame: false` (sem barra de título nativa), uma janela Electron frameless só pode ser arrastada por uma área explicitamente marcada como arrastável via CSS (`-webkit-app-region: drag`). Adiciona-se uma faixa fina (~24px) no topo do `App.tsx`, acima das abas, com o texto "Prismly" — essa faixa é a única área arrastável; todo o resto do popup (abas, cards, botões) continua clicável normalmente, sem precisar de nenhuma marcação extra (o padrão do Electron já é "não arrastável" em tudo que não for explicitamente marcado).

## Persistência e fallback de posição

**Novo módulo `app/src/main/popupPosition.ts`**, responsável só por isso:
- `savePosition(x, y)` — grava `{ x, y }` num arquivo JSON dentro de `app.getPath('userData')`.
- `loadPosition()` — lê o arquivo; retorna `null` se não existir ou estiver corrompido.
- `isPositionOnScreen(x, y)` — usa o módulo `screen` do Electron para checar se o ponto cai dentro de algum monitor conectado no momento.
- `clearPosition()` — apaga o arquivo salvo.

**Fluxo ao mostrar o popup** (em `tray.ts`, na função que já decide mostrar/esconder): se existe posição salva e ela está dentro da tela atual, usa `setPosition(x, y)`; senão, usa a lógica de ancoragem acima do ícone que já existe (Task 2 do plano anterior) — vira o fallback, não é removida.

**Salvando a posição:** o evento `moved` da janela (disparado continuamente durante o arraste) dispara `savePosition` com debounce (só grava de fato ~300ms depois que o usuário para de arrastar) — evita gravar no disco a cada pixel de movimento.

**"Redefinir posição"** no menu do clique direito: chama `clearPosition()` e, se o popup estiver visível no momento, reposiciona ele na hora usando a lógica de ancoragem; se estiver escondido, só limpa o arquivo (a próxima vez que abrir já usa a ancoragem, por não haver mais posição salva).

## Testes

Sem testes automatizados novos (mesma justificativa da spec anterior — é infraestrutura de UI nativa/layout, sem lógica de negócio testável isoladamente). Verificação manual: arrastar o popup, fechar e abrir de novo (confirma que lembrou a posição), clicar em "Redefinir posição" (confirma que volta a ancorar), e conferir visualmente que os cards cabem sem cortar conteúdo.
