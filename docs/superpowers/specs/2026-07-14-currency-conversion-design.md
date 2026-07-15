# Conversão USD→BRL na tela de Configuração — Design

## Contexto

Hoje o Prismly só exibe custo em US$, com `formatCost` duplicado em [`AoVivo.tsx`](../../../app/src/renderer/src/tabs/AoVivo.tsx) e [`Historico.tsx`](../../../app/src/renderer/src/tabs/Historico.tsx), cada um fixo em `` `US$ ${n.toFixed(2)}` ``. Não existe nenhuma cotação de moeda no projeto.

Pesquisamos como o `ccusage` lida com isso: por padrão ele também usa uma tabela de preços de token fixa/embutida (buscar da LiteLLM ao vivo é opcional, não padrão) e **não tem nenhuma conversão de moeda** — só US$. Ou seja, a tabela de preços do Claude que o Prismly já tem hoje (`core/pricing.ts`) já segue a mesma prática padrão do próprio ccusage; não é uma lacuna a corrigir agora. A conversão USD→BRL, por outro lado, é uma feature original do Prismly, sem equivalente no ccusage — e faz sentido ser "ao vivo" porque câmbio muda de verdade dia a dia (ao contrário do preço por token, que quase nunca muda).

Esta feature adiciona: busca automática da cotação USD→BRL, uma escolha de moeda (Dólar/Real) na tela de Configuração, e centraliza a formatação de custo hoje duplicada.

## Decisões

- **Fonte da cotação:** [AwesomeAPI](https://docs.awesomeapi.com.br/api-de-moedas) (`https://economia.awesomeapi.com.br/json/last/USD-BRL`) — API brasileira gratuita, sem chave/cadastro. Usa o campo `bid` da resposta como taxa de conversão.
- **Frequência de busca:** automática, no `app.whenReady()`. Busca se `rate === null` (nunca conseguiu buscar ainda, ou toda tentativa anterior falhou — tenta de novo a cada abertura do app) OU se a última busca bem-sucedida tiver mais de 24h. Busca via `fetch()` nativo do Node (disponível desde Node 18, sem dependência nova).
- **Padrão do sistema:** Dólar (US$).
- **Aplicação:** ao vivo, sem botão "Salvar" — igual ao padrão já estabelecido pelo tema.
- **Fallback quando não há cotação:** se "Real" estiver selecionado mas `rate` for `null` (busca nunca funcionou), o app mostra em US$ silenciosamente em todo lugar de custo, com um único aviso na tela de Configuração (não repetido em cada número) avisando que a cotação está indisponível.
- **`core/` não muda** — conversão é só uma questão de apresentação no app Electron; o cálculo de custo em USD continua exatamente como está hoje.

## 1. Dados e persistência (processo main)

Novo arquivo `app/src/main/currencySettings.ts`, seguindo o mesmo padrão de `themeSettings.ts`/`popupGeometry.ts`:

```ts
export interface CurrencySettings {
  selected: 'usd' | 'brl';
  rate: number | null;
  fetchedAt: string | null;
}
```

Persistido em `currency.json` (em `app.getPath('userData')`), com `loadCurrencySettings()`/`saveCurrencySettings()` no mesmo formato validado-com-fallback dos outros dois módulos.

No `app.whenReady()` de `app/src/main/index.ts`, uma função `refreshExchangeRateIfNeeded()` roda uma vez: carrega o `currency.json` atual, decide se precisa buscar (regra acima), e se precisar, faz `fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')`, extrai `data.USDBRL.bid` (convertido pra `number`), e salva `{ ...atual, rate, fetchedAt: new Date().toISOString() }`. Qualquer erro (rede fora, resposta inesperada) é capturado e ignorado — o app segue com o que já tinha salvo.

Dois canais IPC: `currency:get` (`ipcMain.handle`, retorna o `CurrencySettings` completo) e `currency:set` (`ipcMain.on`, recebe só o novo `selected` e regrava o arquivo mantendo `rate`/`fetchedAt` como estavam).

## 2. Renderer — `formatCost` centralizado

Novo arquivo `app/src/renderer/src/currency.ts`:

```ts
import type { CurrencySettings } from '../../shared/types';

export function formatCost(usdAmount: number, currency: CurrencySettings): string {
  if (currency.selected === 'brl' && currency.rate !== null) {
    return `R$ ${(usdAmount * currency.rate).toFixed(2)}`;
  }
  return `US$ ${usdAmount.toFixed(2)}`;
}
```

`AoVivo.tsx` e `Historico.tsx` removem sua própria função `formatCost` local e passam a importar esta, chamando `formatCost(bucket.cost, currency)` em vez de `formatCost(bucket.cost)`. Ambos os componentes ganham uma prop nova `currency: CurrencySettings`.

`App.tsx` carrega a moeda salva (`window.prismly.getCurrency()`) uma vez ao montar — mesmo padrão já usado pro tema — guarda em estado, e repassa como prop pras duas abas e pra `Configuracao`.

`CurrencySettings` vira um tipo compartilhado em `app/src/shared/types.ts`, ao lado de `SavedTheme`.

## 3. UI na tela de Configuração

Nova seção "Moeda" em `Configuracao.tsx`, abaixo da seção "Tema": dois botões pílula, "Dólar (US$)" e "Real (R$)", no mesmo estilo visual dos botões Dia/Semana/Mensal do Histórico (`pillStyle`-like). Clicar chama `window.prismly.setCurrency(novaSelecao)` e atualiza o estado local de `currency` em `App.tsx`, aplicando imediatamente em toda a tela (nenhum outro texto muda, só o próximo render usa a nova moeda).

Se `currency.selected === 'brl' && currency.rate === null`, aparece um texto de aviso logo abaixo dos botões: "Cotação indisponível no momento — exibindo em US$ até conseguir buscar."

## Testes manuais

Depois da implementação: abrir Configuração, trocar pra "Real" e confirmar que os custos em Ao vivo e Histórico passam a mostrar `R$` com o valor convertido (comparar contra a cotação atual do dólar pra conferir a conta). Trocar de volta pra "Dólar" e confirmar retorno ao `US$`. Simular ausência de cotação (ex: deletar `currency.json`, ou testar offline na primeira abertura) e confirmar que "Real" cai pro fallback em US$ com o aviso aparecendo na Configuração.
