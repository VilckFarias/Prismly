# Prismly

Ferramenta que lê os logs locais de uso de assistentes de IA de código (começando pelo Claude Code, com outros adaptadores futuros) e calcula tokens consumidos e custo em USD. Inspirada no `ccusage`, mas com código 100% autoral — não é fork nem depende do pacote `ccusage`.

## Fase atual: base de dados

Só a camada de dados: encontrar logs, processar, deduplicar e calcular custo corretamente. Sem dashboard ou interface ainda.

## Stack

Node.js puro (v20+), ESM, zero dependências externas.

## Convenções

- Código (pastas, arquivos, funções, variáveis) em **inglês**, seguindo convenção padrão de programação.
- Texto voltado ao usuário final (labels, títulos, mensagens exibidas) em **português** — o público é brasileiro.

## Arquitetura

- `adapters/claude.js` — varre recursivamente `~/.claude/projects/` procurando `.jsonl`, filtra entradas `type: "assistant"` (únicas com `usage`). Extrai `timestamp`, `model`, `sessionId` (vem no próprio JSON da linha) e os contadores de `usage`. O nome do projeto é derivado do nome da pasta em `~/.claude/projects/`, que é o path original "achatado" (`/` virou `-`). Essa codificação é **lossy** (caracteres acentuados são removidos, ex: "Área" vira dashes duplicados), então por enquanto usamos o nome da pasta como identificador bruto do projeto — decodificação bonita fica para depois.
- `pricing.js` — tabela de preços por modelo (USD por 1M tokens: input/output/cache write 5m/cache write 1h/cache read) e função de cálculo de custo por registro.
- `aggregator.js` — agrupa registros normalizados por dia, modelo e projeto, somando tokens e custo, mais totais gerais.
- `index.js` — roda o pipeline completo e imprime no terminal para validação manual.

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
