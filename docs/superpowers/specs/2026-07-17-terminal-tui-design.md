# TUI interativo no terminal (`npx prismly-cli`)

## Motivação

Hoje `npx prismly-cli` roda, imprime um relatório com tabelas ASCII e sai. A intenção sempre foi outra: uma experiência interativa e bonita tanto no app Electron quanto no terminal — não um comando que só despeja texto e morre. Este design substitui o modo relatório por um TUI (terminal UI) que espelha as abas do app gráfico.

## Arquitetura

- **`index.ts`** (raiz) deixa de imprimir tabelas e passa a ser o entry point do TUI: monta a árvore de componentes Ink e chama `render()`. Não existe flag/fallback para o relatório antigo — o pacote publicado continua sendo `prismly-cli`, só muda o que ele faz por dentro.
- **`cli/`** (pasta nova) contém os componentes do TUI (App, Header, abas, listas). Importam funções de `core/` diretamente — mesmo processo, sem IPC (diferente do Electron, que fala main↔renderer por IPC).
- **`core/watcher.ts`** (movido de `app/src/main/watcher.ts`): o watcher já é só `node:fs`, zero dependência de Electron. Migra para `core/` e passa a ser compartilhado entre `app/` e `cli/`, em vez de duplicado. `app/src/main/index.ts` atualiza o import.
- **Sem JSX.** Componentes usam `React.createElement` diretamente em vez de `<Box>...</Box>`. Decisão consciente: o projeto roda `npm start` como `node index.ts`, sem build step (type-stripping nativo do Node, que remove tipos TS mas não entende JSX). Usar JSX exigiria um tradutor rodando no dev local, quebrando essa convenção. `React.createElement` é mais verboso mas não precisa de nada além do que já existe.
- **`ink` e `react` viram dependências de runtime** do pacote raiz (não mais zero-dependency — essa regra hoje só vale pra `core/`, como o `app/` já demonstra ao ter suas próprias dependências isoladas). O build de publicação (`esbuild`) já bundla tudo; sem JSX não precisa de loader especial.

## Dados e atualização ao vivo

`buildPayload()` do Electron já é o formato certo:
```ts
{ aggregated: aggregateUsage(records), blocks: computeBlocks(records) }
```
O TUI usa a mesma função. Um único `startWatcher()` (de `core/watcher.ts`) dispara recomputação e re-render do `<App/>` inteiro a cada mudança nos logs — todas as abas (incluindo os sub-views de Histórico: Dia/Semana/Mês/Modelo/Projeto) atualizam automaticamente, sem lógica extra, porque todas derivam do mesmo objeto `aggregated` recomputado.

## Navegação

Três abas, iguais ao app Electron:
- **Ao vivo** (padrão ao abrir) — bloco de sessão de 5h: progresso, contagem regressiva, custo.
- **Histórico** — sub-abas Dia/Semana/Mês/Modelo/Projeto, navegáveis por seta.
- **Baixar o app** — link do instalador (`github.com/VilckFarias/Prismly/releases`) pra quem quer a versão gráfica.

Teclas: `Tab` alterna as 3 abas · setas/números navegam dentro de Histórico · `q` / `Ctrl+C` sai.

## Visual

- Header: logo Prismly em Braille (já gerada, [docs/assets/prismly-logo.txt](../../assets/prismly-logo.txt), 55×81) + linha de info (nome, versão) abaixo dela, abas embaixo disso.
- Paleta: cores nativas do terminal (sem tema fixo tipo o Electron) — texto na cor padrão do terminal, um único tom de destaque (roxo/violeta, remetendo ao cristal/prisma) pra aba ativa e cabeçalhos, sem esquema de cores customizável nessa primeira versão.

## Erros

Se `~/.claude/projects/` não existir ou estiver vazio, o TUI abre mesmo assim mostrando estado vazio (0 registros) em vez de travar — mesmo comportamento que o relatório antigo já tinha implicitamente ao rodar `collectClaudeUsage()` sobre um diretório vazio.

## Testes

Sem testes de componente Ink (o app Electron também não testa componentes de UI — só lógica em `main/`, ver `currencySettings.test.ts`, `trayPositioning.test.ts`). A cobertura de `core/*.test.ts` já garante que os dados exibidos estão corretos; o TUI é só apresentação.

## Fora de escopo desta versão

- Temas customizáveis (fica só o Electron).
- Conversão de moeda BRL (fica só o Electron).
- Redimensionamento dinâmico da logo pro tamanho do terminal (a logo é fixa em 81 colunas; terminais menores que isso vão quebrar linha).
