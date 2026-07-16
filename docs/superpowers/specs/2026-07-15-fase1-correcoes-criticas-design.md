# Fase 1 — Correções críticas (auditoria de lógica) — Design

## Contexto

O relatório de auditoria (`docs/relatorio-logica-calculos-2026-07-15.md`) encontrou dois bugs reais e uma lacuna de UX que valem correção imediata:

1. `app/src/main/currencySettings.ts`: um `fetchedAt` corrompido-mas-string trava o refresh da cotação de câmbio pra sempre, silenciosamente (`NaN > qualquer coisa` é sempre `false` em JS).
2. O card "Hoje" (`App.tsx`) vira à meia-noite **UTC**, que corresponde às 21h no horário de Brasília — não à meia-noite local.
3. A barra de progresso do "Ao vivo" nasce parcialmente preenchida porque o bloco de 5h é ancorado na hora cheia (comportamento real e intencional do Claude Code, já validado por teste em `core/blocks.ts`), mas isso não é explicado em lugar nenhum da UI.

Esta é a primeira de três fases de melhoria (Fase 2: usabilidade/comportamento de janela; Fase 3: defesa contra falhas de preço) — cada fase recebe seu próprio ciclo de design → plano → implementação.

## 1. Corrigir a validação de `fetchedAt` em `currencySettings.ts`

`refreshExchangeRateIfNeeded()` hoje decide buscar uma cotação nova assim:

```ts
const shouldFetch =
  current.rate === null ||
  current.fetchedAt === null ||
  Date.now() - new Date(current.fetchedAt).getTime() > ONE_DAY_MS;
```

`loadCurrencySettings()` só valida que `fetchedAt` é uma `string` (`typeof parsed.fetchedAt === 'string'`), não que é uma data válida. Se o arquivo `currency.json` tiver `fetchedAt: "not-a-date"` (corrompido de qualquer forma, mas ainda uma string), `new Date("not-a-date").getTime()` retorna `NaN`, e `Date.now() - NaN > ONE_DAY_MS` é **sempre `false`** — o refresh nunca mais acontece, sem nenhum erro visível.

**Correção:** adicionar uma checagem explícita de "data parseável" à condição:

```ts
const shouldFetch =
  current.rate === null ||
  current.fetchedAt === null ||
  Number.isNaN(Date.parse(current.fetchedAt)) ||
  Date.now() - new Date(current.fetchedAt).getTime() > ONE_DAY_MS;
```

Um `fetchedAt` corrompido agora força uma busca nova (comportamento seguro: "na dúvida, busca de novo"), em vez de travar silenciosamente.

## 2. "Hoje" no fuso horário local, não UTC

**O problema de raiz:** `App.tsx` gera `todayKey` via `new Date().toISOString().slice(0, 10)` — sempre UTC. `core/aggregator.ts` gera as chaves de `byDay` via `record.timestamp.slice(0, 10)` — também UTC (os timestamps do Claude Code já vêm em UTC). As duas pontas batem entre si hoje (por isso o app "funciona", sem erro de busca) — o problema é que "hoje" segundo o UTC não é "hoje" para um usuário no Brasil (UTC-3): a virada acontece às 21h local, não à meia-noite local.

**Por que as duas pontas precisam mudar juntas:** se só o `App.tsx` mudasse pra fuso local, a chave gerada ali deixaria de bater com as chaves UTC que `byDay` continua gerando — o card "Hoje" ficaria vazio/sumido na maior parte do dia, um bug pior que o atual.

**Correção — `core/aggregator.ts`:** nova função `localDayKey`, usada só por `byDay`:

```ts
function localDayKey(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

Diferença chave em relação a `timestamp.slice(0, 10)`: aqui o `Date` é construído a partir do **timestamp completo** (com hora e `Z`), representando o instante real; `getFullYear`/`getMonth`/`getDate` então leem esse instante **no fuso horário local da máquina** (que é a mesma máquina do usuário, já que é um app desktop rodando localmente — não há descompasso cliente/servidor aqui). `aggregateUsage()` passa a usar `localDayKey` só para `byDay`; `byWeek`/`byMonth` **não mudam nesta fase** — o relatório não confirmou bug ali, e mexer neles está fora do escopo desta correção pontual.

**Correção — `app/src/renderer/src/App.tsx`:** `todayKey` passa a usar a mesma lógica local:

```ts
const now = new Date();
const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
```

**Testes existentes:** `core/aggregator.test.ts` usa timestamps como `'2026-07-09T10:00:00.000Z'` (10h UTC = 7h no horário de Brasília, sem virada de dia) — os valores de asserção continuam batendo sem alteração. Será adicionado um teste novo que define `process.env.TZ` explicitamente (ex. `'America/Sao_Paulo'`) antes de rodar, com um timestamp próximo da meia-noite UTC (ex. `23:30 UTC`, que é `20:30` em Brasília — ainda o mesmo dia civil local, mas dia diferente em UTC), pra comprovar que `localDayKey` bucketiza pelo dia civil local de forma determinística, não só "por coincidência" do fuso de quem roda o teste.

## 3. Tooltip explicando o arredondamento de hora no "Ao vivo"

`AoVivo.tsx` ganha um ícone "?" pequeno ao lado do texto "Sessão atual", com um atributo `title` (tooltip nativo do navegador — Electron roda em cima de Chromium, então isso funciona sem nenhuma biblioteca nova):

```tsx
<span
  title="O bloco de 5h começa a contar a partir do início da hora cheia em que você usou o Claude Code pela primeira vez, não do minuto exato — por isso a barra pode já nascer parcialmente preenchida."
  style={{ cursor: 'help', fontSize: 11, color: '#777' }}
>
  ⓘ
</span>
```

Posicionado logo depois do texto "Sessão atual", antes do "reinicia em Xh Ymin".

## Testes manuais

Depois da implementação: verificar que a cotação de câmbio ainda persiste normalmente (regressão da Fase de moeda); corromper manualmente `fetchedAt` em `currency.json` pra um valor não-data e confirmar que o próximo `app.whenReady()` busca uma cotação nova em vez de travar; abrir o app perto das 21h (horário de Brasília) e confirmar que "Hoje" não zera até a meia-noite local; passar o mouse sobre o ícone "?" no "Ao vivo" e confirmar que o tooltip aparece com o texto certo.
