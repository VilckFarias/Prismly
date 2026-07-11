# Design: migrar core/ e o CLI para TypeScript

## Contexto e motivação

Depois de terminar as Tasks 1-11 do plano do dashboard Electron (ver [`2026-07-09-electron-dashboard-design.md`](2026-07-09-electron-dashboard-design.md)), o usuário revisou o app rodando de verdade e trouxe duas coisas:

1. Um mal-entendido visual (não um bug): a aba ativa hoje só é sinalizada pelo estilo nativo de `disabled` do navegador, o que é confuso — não fica óbvio qual aba está selecionada.
2. Uma frustração maior com a fronteira entre `core/` (JavaScript puro) e `app/` (TypeScript): a integração exigiu, ao longo das Tasks 7-11, várias rodadas de ajuste de `tsconfig` (`composite`, `allowJs`/`checkJs`, `include`) e terminou em casts forçados como `computeBlocks(records) as unknown as SessionBlock[]` — um sinal de que o TypeScript não está de fato checando nada ali.

Essa conversa também revelou uma visão de produto mais ampla para o Prismly (documentada em memória, `project_prismly_roadmap.md`): o objetivo final é um app de bandeja (tray), com suporte a múltiplos assistentes de IA além do Claude Code, e visões de uso semanal/mensal/ranking. Essa spec cobre só a **Fase 1**: fechar o que já está em andamento, migrando `core/` e o CLI para TypeScript. As fases seguintes (tray app, múltiplos adapters, novas visões de tempo) ficam para specs futuras.

## Escopo desta fase

- Migrar `core/adapters/claude.js`, `core/aggregator.js`, `core/pricing.js`, `core/blocks.js` (e seus testes) para TypeScript.
- Criar `core/types.ts` como fonte única dos tipos (`UsageRecord`, `UsageBucket`, `AggregatedUsage`, `SessionBlock`), eliminando a duplicação manual que hoje existe em `app/src/shared/types.ts`.
- Migrar `index.js` (CLI) para `index.ts`.
- Remover os casts forçados em `app/src/main/index.ts` (`as AggregatedUsage`, `as unknown as SessionBlock[]`), já que deixam de ser necessários.
- Simplificar `app/tsconfig.node.json` e `app/tsconfig.web.json`: remover `allowJs`/`checkJs` (só existiam para tolerar `.js`), manter o padrão `composite: false` + `include` estendido (já validado nas Tasks 7 e 10), agora apontando para `.ts`.
- Corrigir o indicador visual de aba ativa em `app/src/renderer/src/App.tsx` (estilo próprio em vez de depender só de `disabled`).
- Re-executar a verificação de ponta a ponta (equivalente à Task 12 original) depois da migração.

Fora de escopo (fases futuras, não fazer agora): transformar o app em tray/menu bar, suportar outros assistentes de IA além do Claude Code, adicionar visões semanal/mensal/ranking.

## Por que dá para rodar `.ts` sem build

O Node instalado neste projeto é a v24, que roda arquivos `.ts` nativamente via "type stripping" (remove as anotações de tipo e executa o JavaScript resultante), sem precisar de `ts-node` ou de um passo de build — desde que o arquivo use só sintaxe de tipos "apagável" (anotações, interfaces, `as`, genéricos — sem `enum`, namespaces ou parameter properties, nenhum dos quais `core/` usa ou vai usar). Isso preserva a regra de "zero dependências externas" tanto em `core/` quanto no CLI.

**Detalhe importante:** como o Node executa o `.ts` diretamente (não um `.js` compilado), os imports relativos precisam da extensão `.ts` explícita — por exemplo `import { computeBlocks } from './blocks.ts'`, não `'./blocks.js'` nem `'./blocks'`. Isso é diferente da convenção TypeScript mais comum (escrever `.js` mesmo em fontes `.ts`, pensando no output compilado) porque aqui não existe output compilado — o `.ts` É o arquivo executado.

## Arquitetura

```
prismly/
  core/
    adapters/claude.ts
    adapters/claude.test.ts
    aggregator.ts
    aggregator.test.ts
    pricing.ts
    pricing.test.ts
    blocks.ts
    blocks.test.ts
    types.ts                # NOVO — UsageRecord, UsageBucket, AggregatedUsage, SessionBlock
  index.ts                  # CLI, renomeado de index.js
  tsconfig.json              # NOVO — typecheck de core/ + index.ts (noEmit, não usado em runtime)
  app/
    src/shared/types.ts      # passa a importar/reexportar de ../../../core/types.ts, não duplica
    ...                      # resto sem mudança estrutural
```

`core/types.ts` se torna a fonte única da verdade. `app/src/shared/types.ts` deixa de declarar as interfaces manualmente — importa (ou reexporta) de `core/types.ts`, então qualquer mudança de formato em `core/` aparece automaticamente como erro de tipo em `app/` se `app/` não acompanhar, em vez de silenciosamente divergir.

O novo `tsconfig.json` na raiz existe só para checagem de tipos (`tsc --noEmit`, rodado via um script `typecheck` novo em `package.json`) — nunca gera arquivos, já que o Node executa o `.ts` original diretamente. Ele precisa de `"noEmit": true` e `"allowImportingTsExtensions": true` (essa segunda opção só é permitida quando `noEmit` está ligado) para aceitar a extensão `.ts` explícita nos imports sem reclamar. Se essa combinação não resolver de primeira (esse projeto já teve várias rodadas de ajuste fino de `tsconfig` nas Tasks 7 e 10), a validação de referência é sempre `node index.ts` e `node --test core/**/*.test.ts` rodando de verdade — o `tsc` aqui é auxiliar de editor/lint, não a fonte de verdade sobre o que funciona.

## Migração de `core/`

Como a lógica atual é pequena (~225 linhas de código, fora testes) e já validada por 10 testes passando, a migração é mecânica: renomear `.js` → `.ts` preservando histórico (`git mv`), adicionar anotações de tipo sem mudar comportamento, e rodar os testes depois de cada arquivo para confirmar que nada mudou. Nenhuma lógica muda — só ganha tipos.

## Simplificação em `app/`

Com `core/` tipado de verdade, três coisas em `app/` deixam de ser necessárias:

1. `allowJs`/`checkJs` em `app/tsconfig.node.json` — só existiam para o TypeScript tolerar arquivos `.js` sem tipo.
2. Os casts `as AggregatedUsage` e `as unknown as SessionBlock[]` em `app/src/main/index.ts` — `aggregateUsage`/`computeBlocks` passam a ter tipos de retorno reais que já batem com `AggregatedUsage`/`SessionBlock[]`.
3. A duplicação de tipos em `app/src/shared/types.ts`.

O padrão `composite: false` + `include` estendido (que já validamos funcionar nas Tasks 7 e 10) continua — só troca de apontar para `../core/**/*.js` para `../core/**/*.ts`.

## Correção do indicador de aba ativa

Hoje `App.tsx` usa só `disabled={tab === '...'}` nos botões de aba, o que estiliza a aba ativa com a aparência nativa de "desabilitado" — sem nenhum sinal visual claro de "esta é a aba selecionada" (foi exatamente essa ambiguidade que gerou a dúvida do usuário ao ver o print). A correção mantém `disabled` (não faz sentido reclicar na aba já ativa) mas adiciona um estilo explícito de "ativo" (ex: `aria-pressed` + uma classe/estilo com destaque de cor/borda), para que a aba selecionada fique visualmente óbvia independentemente do tema nativo do SO.

## Testes

`core/*.test.ts` continuam rodando via `node --test` (o mesmo runner nativo já usado, que também executa `.test.ts` diretamente). O script `test` em `package.json` muda de `node --test core/**/*.test.js` para `node --test core/**/*.test.ts`. Nenhum teste novo é necessário — a suíte atual (10 testes) já cobre o comportamento, e a migração não muda comportamento, só tipos.

## Verificação final

Depois da migração, repetir a verificação de ponta a ponta: `npm test` (raiz), `npm start` (CLI), `npm run typecheck` (novo, raiz), `npx tsc --noEmit` em `app/` (ambos os configs), e abrir o app Electron de verdade para confirmar visualmente as duas abas — incluindo o novo indicador de aba ativa.
