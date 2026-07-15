# Relatório de lógica e cálculos do Prismly

Auditoria completa de toda a lógica de cálculo do projeto — pipeline de dados (`core/`), processo main do Electron (`app/src/main/`) e renderer (`app/src/renderer/`) — feita por três subagentes em paralelo, cada um lendo o código linha a linha e testando as hipóteses contra os testes existentes.

**Motivação:** o usuário relatou que a aba "Ao vivo" parecia "resetar a cada 4 horas", quando o bloco de sessão deveria durar 5h. Esse relatório investiga essa questão específica e, aproveitando a auditoria, mapeia toda a lógica matemática do projeto para servir de material de estudo.

## Resposta direta: por que parece resetar a cada ~4h

**Não é um bug de cálculo — é um efeito colateral esperado, mas não explicado na tela, de duas decisões de design corretas:**

1. **`core/blocks.ts` arredonda o início do bloco de 5h para a hora cheia (em UTC), não para o momento exato da primeira mensagem.** Isso replica o comportamento real e documentado publicamente do Claude Code (confirmado pelo comentário já existente no código e pelos testes). Se você começa a usar às 14:47, o bloco é contado a partir das 14:00 — você só tem **4h13min de janela útil**, não 5h completas. Dependendo do minuto exato em que você começa a usar, a janela útil real varia entre **pouco mais de 4h e quase 5h** (nunca os 5h "completos" que a intuição sugere). Isso é o Claude Code de verdade se comportando assim — o Prismly só está reproduzindo fielmente.
2. **A barra de progresso e o "reinicia em..." (`AoVivo.tsx`) são calculados em cima desse início arredondado**, então a barra literalmente "já nasce parcialmente preenchida" assim que você abre o app, e o timer conta pra baixo a partir de um ponto que já não é "quando você começou a usar de verdade".
3. Separadamente, mas relacionado: **o card "Hoje" vira à meia-noite UTC, que corresponde às 21h no horário de Brasília** — não à meia-noite local. Isso é um bug de UX real (não intencional para um público brasileiro) que pode reforçar a sensação de "as coisas resetam antes da hora".

Nenhuma correção foi aplicada ainda — isso é só o diagnóstico. Se quiser, dá pra: (a) mostrar na UI que o bloco começou arredondado pra hora cheia, deixando isso explícito; (b) trocar "Hoje" para usar o dia civil local do usuário em vez de UTC.

---

## Achados por severidade (visão executiva)

| # | Achado | Arquivo | Tipo | Prioridade sugerida |
|---|---|---|---|---|
| 1 | `fetchedAt` corrompido (string válida mas não é data parseável) faz `NaN > 24h` avaliar `false` pra sempre — a cotação de câmbio trava e nunca mais atualiza, silenciosamente | `app/src/main/currencySettings.ts` | **Bug real** | Alta |
| 2 | Cotação de câmbio só é buscada **uma vez**, no início do app — sessões longas (dias) nunca mais atualizam a taxa | `app/src/main/currencySettings.ts` / `index.ts` | Lacuna de design | Média |
| 3 | "Hoje" vira à meia-noite **UTC** (21h em Brasília), não à meia-noite local — o card pode "sumir"/zerar 3h antes do esperado | `app/src/renderer/src/App.tsx` | Bug de UX | Alta (dado o público ser brasileiro) |
| 4 | Modelo desconhecido retorna custo `0` silenciosamente, sem aviso — vai acontecer sempre que a Anthropic lançar um novo modelo/snapshot com data | `core/pricing.ts` | Risco real, recorrente | Média |
| 5 | `core/adapters/claude.ts` (parsing dos logs, dedup por `message.id`, split de cache 5m/1h) não tem nenhum teste encontrado, apesar de ser a lógica mais frágil (depende do formato do Claude Code) | `core/adapters/claude.ts` | Lacuna de teste | Média |
| 6 | `fs.watch` com `{recursive: true}` é conhecidamente pouco confiável no Linux; evento `'error'` do watcher não tem handler e pode derrubar o processo main se disparado | `app/src/main/watcher.ts` | Risco cross-platform | Média (relevante pro trabalho de Linux já feito) |
| 7 | Posicionamento do popup (`trayPositioning.ts`) não tem clamping contra bordas de tela nem trata o caso do macOS (bandeja no topo, não embaixo) | `app/src/main/trayPositioning.ts` | Lacuna de robustez | Baixa (Windows funciona bem hoje) |
| 8 | `isPositionOnScreen` testa só o canto superior-esquerdo da janela salva, não o retângulo inteiro — desconectar um monitor pode restaurar a janela parcialmente fora da tela | `app/src/main/popupGeometry.ts` | Edge case | Baixa |
| 9 | Validação de tema salvo (`preset`/cores) só confere que são strings, não que são valores válidos — um tema corrompido-mas-stringy passa direto e pode quebrar visualmente | `app/src/main/themeSettings.ts` | Validação rasa | Baixa |
| 10 | Rótulo de semana no Histórico (`"29/12 - 04/01"`) não mostra o ano — ambíguo em históricos com mais de 1 ano de dados | `app/src/renderer/src/tabs/Historico.tsx` | Cosmético | Baixa |
| 11 | `formatCost` não trata `rate` zero/inválido nem usa `fetchedAt` pra avisar que a cotação pode estar velha | `app/src/renderer/src/currency.ts` | Falta de validação defensiva | Baixa |
| 12 | Mistura de fuso (UTC-slice vs. `Date` local) em `mondayKey` (`core/aggregator.ts`) é auto-consistente hoje, mas frágil — não testado no limite (domingo, virada de ano) | `core/aggregator.ts` | Risco latente, não confirmado como bug | Baixa |

---

## Pipeline de dados (core/)

### `core/adapters/claude.ts` — parsing e deduplicação dos logs JSONL

**O que faz.** `collectClaudeUsage()` varre todo `.jsonl` sob `~/.claude/projects`, faz parse de cada linha, e mantém só linhas `type: 'assistant'` com `message.id` e `message.usage`. Para cada uma, monta um `RawUsageRecord` e guarda num `Map<string, RawUsageRecord>` chaveado por `message.id`.

**Por que chaveado por `message.id`, mantendo a última escrita.** Uma resposta da API pode virar várias linhas no JSONL (ex.: um bloco de "thinking" e um bloco de texto, gravados separadamente) que compartilham o mesmo `message.id`. `usage.input_tokens` e os campos de cache são constantes entre essas linhas, mas `output_tokens` é **cumulativo** — cresce a cada linha. O `Map.set` na mesma chave simplesmente sobrescreve a entrada anterior, então quem processar por último vence. **Isso só é correto se as linhas aparecerem no arquivo na mesma ordem em que foram de fato escritas/streamed** — nada no código verifica essa premissa explicitamente, ela é implícita (mas razoável, já que é um log append-only).

**Dedup entre arquivos.** O `Map` é declarado fora do loop de arquivos, então o mesmo `message.id` visto em dois `.jsonl` diferentes (sessões retomadas/bifurcadas que carregam histórico de transcript anterior) também é deduplicado corretamente.

**Split de cache 5m/1h.**
```ts
const cacheCreation5mTokens = usage.cache_creation?.ephemeral_5m_input_tokens ?? usage.cache_creation_input_tokens ?? 0;
const cacheCreation1hTokens = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
```
Prefere o breakdown estruturado quando presente, caindo pro campo achatado como fallback. Lógica correta para os formatos de payload realistas testados.

**Riscos encontrados:**
- Linhas com `usage` mas sem `message.id` são descartadas silenciosamente (`if (!messageId || !usage) continue`) — se o Claude Code algum dia emitir uma linha de uso sem id, ela desaparece dos totais sem aviso.
- A premissa "output_tokens cresce, então a última linha lida sempre tem o maior valor" não é validada ativamente — um `Math.max` explícito seria mais robusto que confiar na ordem de leitura do arquivo.
- **Não há nenhum teste encontrado para este arquivo** — é a lógica mais frágil (depende de um formato semi-documentado de uma ferramenta externa) e a menos coberta.

### `core/pricing.ts` — tabela de preços e `calculateCost()`

**O que faz.** Tabela estática `MODEL_PRICING` (5 taxas por modelo) e uma fórmula de soma ponderada dividida por 1 milhão. Se o modelo não estiver na tabela, retorna `0` silenciosamente.

**Risco real:** qualquer modelo novo da Anthropic (comum ter sufixo de data, ex. `claude-sonnet-5-20260815`) que não bata exatamente com uma das 5 chaves na tabela vai reportar **custo $0**, sem erro nem aviso. Dado o ritmo de lançamento de snapshots datados da Anthropic, isso é um risco recorrente, não hipotético.

**Cobertura de teste:** boa para a aritmética (soma das 5 dimensões de preço, divisão por 1M), mas só testa 1 dos 5 modelos da tabela e não testa o cenário de "nome de modelo quase certo".

### `core/aggregator.ts` — `aggregateUsage()`

Agrupa por dia/semana/mês/modelo/projeto. Chaves de dia/mês são fatias diretas da string ISO UTC (`slice(0,10)`/`slice(0,7)`). A chave de semana (`mondayKey`) reconstrói a data local (sem `Z`) a partir da mesma fatia UTC — isso é auto-consistente hoje (o dia da semana calculado bate), mas mistura duas abordagens de fuso horário no mesmo arquivo, o que é frágil mesmo sem um bug confirmado.

**Cobertura de teste:** boa para os casos "normais" (mesma semana em meses diferentes, semanas diferentes, meses diferentes) mas **nunca testa** um registro caindo num domingo (o branch `day === 0` do cálculo de segunda-feira nunca é exercitado), nem uma virada de ano.

### `core/blocks.ts` — `computeBlocks()` (blocos de sessão de 5h)

Já detalhado na resposta direta acima. Resumo técnico: um bloco novo começa se (a) o gap de inatividade for ≥5h desde a última atividade, OU (b) o próprio bloco já passou de 5h desde seu início, mesmo com uso contínuo. `floorToHour` arredonda o início para a hora cheia em UTC — **isso é intencional e correto**, replica o comportamento real documentado do Claude Code.

**Achado de fronteira não testado:** dois registros com gap de **exatamente** 5h (`>=`, não `>`) abrem um bloco novo — comportamento defensável, mas não há teste no limite exato (5h à milissegundo), nem teste de um bloco começando perto do fim de uma hora (ex.: `:59`), que é justamente o cenário de "pior caso" (quase 1h perdida).

---

## Processo main (app/src/main/)

### `trayPositioning.ts` — posicionamento do popup

`isValidTrayBounds` só confere `width`/`height` > 0, não `x`/`y` — o nome da função promete mais do que valida. `computeAboveTrayPosition` e `computeFallbackPosition` fazem a aritmética certa (confirmada por teste), mas **nenhuma das duas faz clamping contra a borda da tela** — um popup pode ficar parcialmente fora da tela se a bandeja estiver perto da borda, e a função é "cega" pra macOS (bandeja fica no topo, não embaixo — "acima da bandeja" colocaria o popup pra fora da tela pra cima).

### `popupGeometry.ts` — `isPositionOnScreen()`

Testa só o canto superior-esquerdo da janela salva, não o retângulo inteiro. Desconectar um monitor externo pode restaurar a janela com a maior parte fora da tela, mesmo que o canto testado ainda "passe" no teste.

### `themeSettings.ts` — validação do tema salvo

Só confere que `preset`/cores são *strings*, não que são valores válidos. Um tema salvo como `{preset: "xyz123", colors: {bg: "banana", text: "42", cardBg: ""}}` passa na validação inteira e pode gerar uma tela quebrada visualmente, em vez de cair no padrão seguro.

### `currencySettings.ts` — `refreshExchangeRateIfNeeded()` — **bug real encontrado aqui**

```ts
const shouldFetch =
  current.rate === null ||
  current.fetchedAt === null ||
  Date.now() - new Date(current.fetchedAt).getTime() > ONE_DAY_MS;
```

A validação de `loadCurrencySettings()` só confere `typeof parsed.fetchedAt === 'string'` — **não confere que a string é uma data válida**. Se `fetchedAt` for uma string corrompida-mas-ainda-string (ex.: `"not-a-date"`), `new Date(...).getTime()` vira `NaN`, e `Date.now() - NaN > ONE_DAY_MS` é **sempre `false`** em JavaScript (qualquer comparação com `NaN` é `false`). Resultado: **o refresh da cotação trava pra sempre**, silenciosamente, sem nenhum log ou aviso, até o usuário apagar `currency.json` manualmente.

Além disso: `refreshExchangeRateIfNeeded()` só é chamada **uma vez**, no `app.whenReady()` — não existe nenhum `setInterval` re-checando isso periodicamente. Uma sessão do app aberta por vários dias seguidos nunca mais atualiza a cotação depois da primeira janela de 24h, até o usuário fechar e reabrir o app.

### `watcher.ts` — o quanto "ao vivo" a aba realmente é

Não há polling — é 100% baseado em eventos de sistema de arquivos (`fs.watch`), com debounce de 1s. Dois riscos:
- `{recursive: true}` do `fs.watch` é **pouco confiável no Linux** (suporte histórico inconsistente) — pode silenciosamente não observar mudanças em subpastas de projeto, sem gerar erro nenhum.
- O watcher não tem handler pro evento `'error'` — se ele disparar depois de configurado (ex.: a pasta observada for apagada em runtime), isso é um evento `'error'` não tratado num `EventEmitter`, que **derruba o processo main inteiro** por padrão no Node.js.

---

## Cálculos no renderer (app/src/renderer/)

### `App.tsx` — `todayKey` — **bug de UX confirmado aqui**

```ts
const todayKey = new Date().toISOString().slice(0, 10);
```

`toISOString()` sempre serializa em UTC. A chave gerada aqui bate exatamente com a chave usada em `core/aggregator.ts` (`timestamp.slice(0,10)`, também UTC) — **não há inconsistência entre as duas pontas**. O problema é de percepção: pra alguém no horário de Brasília (UTC-3), o "dia" que o app considera "Hoje" vira à meia-noite UTC, que corresponde às **21h no horário local**. Às 21h, o card "Hoje" começa a acumular um bucket novo (vazio ou pequeno) — na prática, o usuário vê o total do dia cair/sumir 3h antes da meia-noite local, o que é bem contraintuitivo. Correção sugerida: usar o dia civil local (`getFullYear()`/`getMonth()`/`getDate()`) em vez de `toISOString()`.

Efeito colateral relacionado: se o payload não for atualizado logo depois da virada UTC, `todayKey` pode apontar pra uma chave que ainda não existe em `payload.aggregated.byDay`, e o card "Hoje" **desaparece da tela** (em vez de mostrar um estado "0") até o próximo refresh.

### `AoVivo.tsx` — barra de progresso e contagem regressiva

Já coberto na resposta direta — a barra "nasce parcialmente preenchida" porque `block.start` já vem arredondado pra hora cheia (em UTC) do `core/blocks.ts`, então o `percentElapsed`/`formatRemaining` medem a partir desse ponto arredondado, não do momento real em que o uso começou. Isso explica tecnicamente a sensação de "reseta a cada ~4h": a janela útil real (do primeiro uso até o fim do bloco) varia entre pouco mais de 4h e quase 5h, dependendo do minuto exato do início.

### `Historico.tsx` — rótulos de semana/mês e ordenação

`formatWeekLabel` (segunda + 6 dias = domingo) usa a API nativa `setDate`, que lida corretamente com estouro de mês/ano — testado manualmente contra uma virada de ano (29/12 → 04/01) e confirmado correto. O único ponto fraco real é cosmético: o rótulo não mostra o ano, então "29/12 - 04/01" é ambíguo em históricos de mais de 1 ano. A ordenação (`byWeekRows`/`byMonthRows`/`byDayRows`) é feita corretamente sobre a chave ISO crua, antes de aplicar o rótulo formatado — a ordem cronológica está garantida.

### `currency.ts` — conversão USD→BRL

Matemática correta (`usd * rate`, formatado em pt-BR com vírgula decimal). Faltam apenas validações defensivas: não trata `rate` zero/inválido como um caso de erro (mostraria "R$ 0,00" silenciosamente), e não usa o campo `fetchedAt` pra avisar visualmente que a cotação pode estar desatualizada.

### `themes.ts` — `applyTheme()`

Nenhuma lógica de cálculo — só atribuição de 3 variáveis CSS. Nenhum achado.

---

## O que eu recomendaria priorizar (se/quando quiser corrigir)

1. **Corrigir o bug real do `fetchedAt`** em `currencySettings.ts` — validar que a string é uma data parseável (`!Number.isNaN(Date.parse(...))`), não só que é uma string.
2. **Trocar "Hoje" pra usar o dia civil local** em vez de UTC — impacto direto na experiência do público brasileiro.
3. **Deixar explícito na UI do "Ao vivo"** que o bloco começou arredondado pra hora cheia (algo tipo uma nota discreta), pra tirar a sensação de "bug" de um comportamento que é, na verdade, fiel ao Claude Code real.
4. Adicionar testes pro `core/adapters/claude.ts` (a lógica mais frágil e menos coberta hoje).

Nenhuma dessas correções foi implementada — isso é só o diagnóstico, como pedido.
