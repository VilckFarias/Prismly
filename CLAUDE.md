# Prismly

Ferramenta que lê os logs locais de uso de assistentes de IA de código (começando pelo Claude Code, com outros adaptadores futuros) e calcula tokens consumidos e custo em USD. Inspirada no `ccusage`, mas com código 100% autoral — não é fork nem depende do pacote `ccusage`.

## Fase atual

O produto principal é o app Electron (`app/`): ícone na bandeja do sistema, com abas "Ao vivo" (bloco de sessão de 5h em andamento) e "Histórico" (agregados por dia/semana/mês/modelo/projeto). A camada de dados (`core/`) está validada e estável.

O CLI (`npx prismly-cli` / `npm start`) é o modo alternativo "sem instalar nada": um TUI interativo (Ink/React) no próprio terminal, espelhando as mesmas abas do app gráfico. Não é o foco do projeto, é um complemento — quem quer a experiência completa usa o app de bandeja.

## Stack

- `core/` — TypeScript, roda nativamente no Node (v22.6+/24, via "type stripping" — sem build step, sem `ts-node`). Zero dependências externas em runtime; `@types/node` e `typescript` entram só como devDependencies, usadas exclusivamente para checagem de tipos (`npm run typecheck`).
- `cli/` + `index.ts` — o TUI do terminal. Mesma filosofia de zero build step do `core/` (por isso os componentes Ink usam `React.createElement` em vez de JSX — JSX exigiria um passo de tradução antes do `node index.ts` rodar). `ink` e `react` são as únicas dependências de runtime do pacote publicado (`prismly-cli` no npm), deliberadamente fora da regra de zero-dependência que vale só para `core/`.
- `app/` — Electron + React + TypeScript, empacotado com `electron-vite`. Dependências isoladas em `app/package.json`; não afetam `core/` nem `cli/`.

## Convenções

- Código (pastas, arquivos, funções, variáveis) em **inglês**, seguindo convenção padrão de programação.
- Texto voltado ao usuário final (labels, títulos, mensagens exibidas) em **português** — o público é brasileiro.

## Arquitetura

- `core/adapters/claude.ts`, `core/aggregator.ts`, `core/pricing.ts` — mesma responsabilidade de antes, agora em TypeScript dentro de `core/`.
- `core/blocks.ts` — agrupa registros normalizados em blocos de sessão de 5h (a janela de uso do Claude Code), expondo início/fim/status ativo e os totais acumulados de cada bloco. Usado pela aba "Ao vivo" do app e do CLI.
- `core/watcher.ts` — observa `~/.claude/projects/` com `fs.watch` (debounce de 1s) e dispara um callback a cada mudança. Compartilhado entre `app/` e `cli/` — só `node:fs`, sem dependência de Electron.
- `app/` — app Electron (processo principal + preload + renderer React/TS). O processo principal roda a pipeline de `core/`, usa `core/watcher.ts` e envia atualizações ao renderer via IPC.
- `cli/` — TUI do terminal (Ink/React, sem JSX). `index.ts` monta `<App/>` (`cli/App.ts`) direto — sem IPC, mesmo processo. Usa `core/watcher.ts` do mesmo jeito que o app, mas re-renderiza a árvore React em vez de mandar por IPC. A logo (`cli/logoRender.ts` + `cli/logoSource.ts`) é reamostrada em tempo real pra largura do terminal (`useStdout` do Ink), a partir de uma arte ASCII desenhada à mão (não de foto/dithering) empacotada em Braille.
- `core/types.ts` — fonte única dos tipos de domínio (`RawUsageRecord`, `UsageRecord`, `UsageBucket`, `AggregatedUsage`, `SessionBlock`). `app/src/shared/types.ts` importa daqui em vez de duplicar.

## Dedup e contagem de tokens (importante — bugs reais encontrados e corrigidos)

Validamos o pipeline comparando com o `ccusage` real rodado via `npx` sobre os mesmos logs. Dois bugs foram encontrados e corrigidos:

1. **Chave de dedup errada.** Uma mesma resposta da API pode gerar múltiplas linhas `assistant` no `.jsonl` (ex: um bloco de "thinking" e um bloco de texto, gravados separadamente), cada uma com `uuid` diferente mas o **mesmo `message.id`**. Deduplicar por `uuid` (como planejado inicialmente) contava a mesma resposta 2x. A chave correta é `message.id`.
2. **`output_tokens` é cumulativo entre linhas do mesmo `message.id`.** `input_tokens`, `cache_creation_input_tokens` e `cache_read_input_tokens` são idênticos em todas as linhas de uma mesma resposta, mas `output_tokens` cresce a cada linha (reflete o streaming). É preciso manter a **última ocorrência** de cada `message.id` (não a primeira) para pegar o total final.
3. **Cache write não é só 5 minutos.** `cache_creation_input_tokens` é um agregado; o preço real depende de qual fração foi TTL de 5min vs 1h (`usage.cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`), e o preço do 1h é bem mais caro. Ignorar essa divisão subestimava o custo total em ~9% nos nossos logs (74% do cache creation era 1h, não 5min).

Após essas correções, os totais bateram com o `ccusage` real na casa de <0.01% de diferença (tokens idênticos, custo com centavos de diferença por causa do tempo entre as duas medições).

## Formato do registro normalizado

```js
{
  source: "claude",
  timestamp,
  model,
  project,
  sessionId,
  inputTokens,
  outputTokens,
  cacheCreationTokens,     // agregado (5m + 1h), para exibição
  cacheCreation5mTokens,   // usado no cálculo de custo
  cacheCreation1hTokens,   // usado no cálculo de custo
  cacheReadTokens,
  cost,
}
```
