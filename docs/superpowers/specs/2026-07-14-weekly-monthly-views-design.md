# Views de uso semanal e mensal (Fase 4) — Design

## Contexto

A aba "Histórico" (Fase 2) já tem um sub-nav "Dia / Semana / Mensal" em [`app/src/renderer/src/tabs/Historico.tsx`](../../../app/src/renderer/src/tabs/Historico.tsx), com só "Dia" habilitado — "Semana" e "Mensal" existem como botões desabilitados, pré-cabeados desde a Fase 2 justamente para esta fase. `core/aggregator.ts` já agrupa registros por dia (`byDay`), modelo (`byModel`) e projeto (`byProject`) via uma função `groupBy` genérica.

Esta fase adiciona os agrupamentos por semana e mês, seguindo exatamente o padrão de `byDay`, e liga os dois botões que já existiam na UI.

## Decisões

- **Início da semana:** segunda-feira (convenção ISO 8601).
- **Label da semana:** intervalo de datas sem ano, ex: `"07/07 - 13/07"`.
- **Label do mês:** nome por extenso + ano, ex: `"Julho/2026"`.
- **"Por modelo" e "Por projeto" continuam globais** (todo o histórico, não escopados pelo período selecionado) — comportamento inalterado desde a Fase 2. Só a lista de cima (hoje "Por dia") passa a virar "Por semana"/"Por mês" conforme o toggle.
- **Ordenação:** sempre pela chave ISO interna (crescente, mais antigo primeiro), igual `byDay` hoje — o texto formatado é só para exibição, nunca usado para ordenar.

## 1. Camada de dados (`core/`)

`aggregateUsage()` em `core/aggregator.ts` ganha dois novos agrupamentos, usando a mesma função `groupBy` já existente, só trocando a `keyFn`:

```ts
function mondayKey(timestamp: string): string {
  const date = new Date(timestamp.slice(0, 10) + 'T00:00:00');
  const day = date.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diffToMonday);
  return date.toISOString().slice(0, 10);
}

export function aggregateUsage(records: UsageRecord[]): AggregatedUsage {
  const byDay = groupBy(records, (record) => record.timestamp.slice(0, 10));
  const byWeek = groupBy(records, (record) => mondayKey(record.timestamp));
  const byMonth = groupBy(records, (record) => record.timestamp.slice(0, 7));
  const byModel = groupBy(records, (record) => record.model);
  const byProject = groupBy(records, (record) => record.project);

  const totals = createEmptyBucket();
  for (const record of records) addRecord(totals, record);

  return { byDay, byWeek, byMonth, byModel, byProject, totals };
}
```

`byWeek` é chaveado pela data de segunda-feira da semana (`YYYY-MM-DD`) — a mesma semana sempre cai na mesma chave, independente de qual dia da semana o registro caiu. `byMonth` é chaveado por `YYYY-MM`, análogo a `byDay` (`timestamp.slice(0,10)` vira `timestamp.slice(0,7)`).

`core/types.ts` — `AggregatedUsage` ganha os dois campos:

```ts
export interface AggregatedUsage {
  byDay: Record<string, UsageBucket>;
  byWeek: Record<string, UsageBucket>;
  byMonth: Record<string, UsageBucket>;
  byModel: Record<string, UsageBucket>;
  byProject: Record<string, UsageBucket>;
  totals: UsageBucket;
}
```

`app/src/shared/types.ts` não precisa de nenhuma mudança — já reexporta `AggregatedUsage` direto de `core/types.ts`.

**Testes** (`core/aggregator.test.ts`), seguindo o padrão dos testes existentes de `byDay`:
- Registros na mesma semana (dias diferentes, mesma segunda-feira) caem no mesmo bucket de `byWeek`.
- Registros em semanas diferentes (incluindo uma virada de mês no meio da semana) caem em buckets diferentes de `byWeek`.
- Registros no mesmo mês caem no mesmo bucket de `byMonth`; registros em meses diferentes caem em buckets diferentes.

**Limitação aceita:** o label de semana não inclui o ano, então duas semanas com mesmas datas em anos diferentes (ex: primeira semana de janeiro de 2026 e de 2027) mostram o mesmo texto, apesar de serem períodos diferentes — a chave interna (`YYYY-MM-DD` da segunda-feira) resolve isso pra ordenação; só o texto exibido é ambíguo nesse caso. Aceitável para uma ferramenta de uso pessoal.

## 2. UI (`Historico.tsx`)

Habilita os dois botões que hoje são `disabled`:

```tsx
<button
  onClick={() => setGranularity('semana')}
  disabled={granularity === 'semana'}
  style={pillStyle(granularity === 'semana', false)}
>
  Semana
</button>
<button
  onClick={() => setGranularity('mensal')}
  disabled={granularity === 'mensal'}
  style={pillStyle(granularity === 'mensal', false)}
>
  Mensal
</button>
```

Duas funções novas de formatação, usadas só para exibição (nunca para ordenar):

```ts
function formatWeekLabel(mondayKey: string): string {
  const monday = new Date(mondayKey + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date): string =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${fmt(monday)} - ${fmt(sunday)}`;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  return `${MONTH_NAMES[Number(month) - 1]}/${year}`;
}
```

`byWeekRows`/`byMonthRows` computados do mesmo jeito que `byDayRows` hoje:

```ts
const byWeekRows = Object.entries(aggregated.byWeek).sort(([a], [b]) => a.localeCompare(b));
const byMonthRows = Object.entries(aggregated.byMonth).sort(([a], [b]) => a.localeCompare(b));
```

`CardList` já aceita `rows: [string, UsageBucket][]` — passamos as chaves já formatadas (não a chave ISO crua) na hora de montar o array que vai pro componente, ou adaptamos `CardList` para aceitar um `formatKey` opcional. Como `CardList` é usado também por "Por modelo"/"Por projeto" (que não precisam de formatação), a opção mais simples e sem quebrar nada existente é formatar a chave *antes* de montar as `rows`, mantendo `CardList` sem mudança:

```tsx
const byWeekRows: [string, UsageBucket][] = Object.entries(aggregated.byWeek)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, bucket]) => [formatWeekLabel(key), bucket]);

const byMonthRows: [string, UsageBucket][] = Object.entries(aggregated.byMonth)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, bucket]) => [formatMonthLabel(key), bucket]);
```

A renderização condicional por granularidade passa a ter três ramos:

```tsx
{granularity === 'dia' && <CardList title="Por dia" rows={byDayRows} />}
{granularity === 'semana' && <CardList title="Por semana" rows={byWeekRows} />}
{granularity === 'mensal' && <CardList title="Por mês" rows={byMonthRows} />}
<CardList title="Por modelo" rows={byModelRows} />
<CardList title="Por projeto" rows={byProjectRows} />
```

("Por modelo"/"Por projeto" saem do bloco condicional e ficam sempre visíveis, já que não mudam com a granularidade — hoje elas já são renderizadas assim, dentro do `{granularity === 'dia' && (...)}`, só que redundantemente coladas ao "Por dia"; com três ramos ao invés de um, elas precisam sair do condicional pra não precisar duplicar em três lugares.)

## Testes manuais

Depois da implementação: abrir a aba Histórico, alternar entre Dia/Semana/Mensal e confirmar visualmente que os labels aparecem formatados corretamente (`DD/MM - DD/MM` pra semana, `Mês/Ano` pra mês), que a soma de custo/tokens bate entre os três (o total geral não muda, só o agrupamento), e que "Por modelo"/"Por projeto" continuam aparecendo sempre, iguais nos três modos.
