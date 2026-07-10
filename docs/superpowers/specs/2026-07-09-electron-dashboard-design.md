# Design: dashboard Electron para o Prismly

## Contexto e motivação

O Prismly hoje roda só via terminal (`npm start`), imprimindo tabelas com `console.table`. O código da camada de dados (`adapters/claude.js`, `aggregator.js`, `pricing.js`) está pequeno, organizado e já validado byte a byte contra o `ccusage` real.

O objetivo desta mudança é sair do terminal e ganhar uma interface gráfica nativa (Electron, "fingindo ser um app"), inspirada — não copiada — em ideias do `ccusage` (como a visão de blocos de sessão de 5h), com uma visão ao vivo além da visão histórica que já existe hoje.

Isso marca a saída da fase "só base de dados" descrita no `CLAUDE.md`. O `CLAUDE.md` será atualizado como parte desta mudança para refletir a nova fase e a nova stack.

## Escopo da v1

- App Electron com duas abas:
  - **Ao vivo**: bloco de sessão de 5h atual (início, tempo restante, tokens/custo acumulado no bloco, projeção de fechamento).
  - **Histórico**: os mesmos agregados que o terminal já mostra hoje (por dia, por modelo, por projeto, totais gerais).
- Atualização automática: o app observa os arquivos `.jsonl` de `~/.claude/projects/` e atualiza a UI conforme novo uso é registrado, sem precisar reiniciar o app.
- O modo CLI atual (`npm start`, saída em `console.table`) continua existindo e funcionando.

Fora de escopo da v1 (não fazer agora): filtros interativos, ordenação clicável nas tabelas, suporte a outros adaptadores além do Claude Code, empacotamento/distribuição do app (installer), múltiplas janelas.

## Arquitetura

Um repositório só, duas áreas isoladas por pasta:

```
prismly/
  core/                    # camada de dados, JS puro (ESM), zero dependências externas
    adapters/claude.js      # (movido de adapters/claude.js)
    aggregator.js
    pricing.js
    blocks.js               # NOVO — agrupa registros em blocos de sessão de 5h
  app/                      # Electron + React + TypeScript, com suas próprias dependências
    electron.vite.config.ts
    src/
      main/                 # processo principal: roda o core/, observa logs, fala via IPC
        index.ts
        watcher.ts
      preload/
        index.ts
      renderer/             # React + TS
        App.tsx
        tabs/AoVivo.tsx
        tabs/Historico.tsx
  index.js                  # CLI atual, agora importando de core/
  package.json
```

`core/` continua JS puro (decisão explícita: já validado contra o `ccusage` real, migrar pra TS agora seria risco sem ganho prático nesta fase). `app/` usa TypeScript porque Electron + React já traz um pipeline de build (`electron-vite`), então o custo de adotar TS ali é baixo e o ganho de segurança de tipos na UI é real. Os tipos usados no lado do `app/` para os dados vindos do `core/` (record, bloco, totais) são declarados localmente em `app/` (ex: `app/src/shared/types.ts`) espelhando o formato já documentado no `CLAUDE.md`, sem depender de tipos gerados a partir do JS.

## Algoritmo de blocos de sessão (`core/blocks.js`)

Conceito (é como o rate-limit de uso do Claude Code funciona publicamente, não é código copiado do `ccusage`): o uso é limitado em janelas rolantes de 5 horas. `computeBlocks(records)`:

1. Ordena os `records` por `timestamp`.
2. Um bloco novo começa no primeiro registro após um gap de inatividade (sem uso por tempo >= duração do bloco desde o último registro), com o início arredondado para a hora cheia.
3. O bloco permanece aberto enquanto `agora < inicio + 5h`; ao ultrapassar, fecha e o próximo registro abre um novo bloco.
4. Cada bloco expõe: `start`, `end` (real, se fechado, ou projetado = `start + 5h`, se aberto), `isActive`, tokens agregados (mesmos campos do `aggregator.js`), `cost`.

Reaproveita o mesmo formato de registro normalizado já usado por `aggregator.js` — não introduz um novo formato de entrada.

## Fluxo de dados ao vivo

1. `app/src/main/index.ts` importa e roda a pipeline do `core/` (`collectClaudeUsage` → `calculateCost` → `aggregateUsage` + `computeBlocks`) na inicialização, e envia o resultado inicial pro renderer via IPC.
2. `app/src/main/watcher.ts` usa `fs.watch` (nativo do Node, sem dependência extra) no diretório `~/.claude/projects/`, recursivo, para detectar mudanças nos `.jsonl`.
3. Mudanças disparam um debounce (ex: 1s) antes de re-rodar a pipeline completa — evita recalcular a cada byte escrito durante o streaming de uma resposta.
4. O resultado recalculado é enviado ao renderer via `webContents.send`; o renderer atualiza o estado React e re-renderiza as abas.

## Tratamento de erros

- Linhas `.jsonl` malformadas: já ignoradas hoje em `adapters/claude.js` (`parseLine` retorna `null` em erro de parse) — mantém esse comportamento.
- Diretório `~/.claude/projects/` inexistente ou sem permissão de leitura: a pipeline deve retornar lista vazia em vez de derrubar o processo principal do Electron; a UI mostra um estado vazio ("Nenhum uso encontrado ainda") em vez de erro.
- Falha ao iniciar o `fs.watch` (ex: permissão): loga o erro no processo principal e a UI continua funcional com os dados já carregados (sem atualização automática), em vez de travar o app.

## Testes

Sem testes automatizados hoje. Introduzir testes com `node:test` (nativo, zero deps) cobrindo `core/blocks.js` (limites de janela de 5h, gaps, bloco ativo vs. fechado) e reforçando `core/aggregator.js`. Testes de UI/Electron ficam fora do escopo da v1.

## Mudanças no `CLAUDE.md`

- Atualizar "Fase atual" para refletir a introdução do app gráfico.
- Atualizar "Stack": `core/` continua "Node.js puro, zero dependências externas"; `app/` passa a usar Electron + React + TypeScript + `electron-vite`, dependências isoladas naquela pasta.
- Documentar a existência de `core/blocks.js` e o conceito de blocos de sessão na seção de arquitetura.
