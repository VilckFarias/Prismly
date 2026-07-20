# Prismly

Ferramenta que lê os logs locais de uso de assistentes de IA de código (começando pelo Claude Code) e calcula tokens consumidos e custo em dólar ou real.

Roda como um ícone na bandeja do sistema (Windows, com suporte planejado a Linux), com três abas:

- **Ao vivo** — o bloco de sessão de 5h em andamento, com barra de progresso e contagem regressiva.
- **Histórico** — uso agregado por dia, semana, mês, modelo e projeto (mais recente primeiro).
- **Configuração** — tema visual (com paleta personalizável), moeda de exibição (US$/R$, com cotação buscada automaticamente) e o comportamento da janela.

## Baixar e usar

**App de bandeja (gráfico), o jeito principal de usar o Prismly:** o instalador do Windows fica disponível na aba [Releases](https://github.com/VilckFarias/Prismly/releases) deste repositório.

**Modo terminal (sem instalar nada):**

```bash
npx prismly-cli
```

Abre um painel interativo no próprio terminal, com as mesmas abas Ao vivo/Histórico do app gráfico (`Tab` troca de aba, setas navegam o Histórico, `q` sai). Pensado pra quem quer conferir o uso rapidinho sem abrir o app de bandeja.

## Desenvolvimento

Duas partes independentes:

- **`core/`** (zero dependências) + **`cli/`** (usa Ink/React pra desenhar o terminal) — a camada de dados e o CLI interativo. TypeScript puro, roda nativamente no Node (v22.6+/24, sem build step).

  ```bash
  npm install
  npm test        # roda os testes de core/ e cli/
  npm run typecheck
  npm start        # abre o TUI interativo (mesmo que `npx prismly-cli`)
  ```

- **`app/`** — o app Electron (bandeja do sistema). Dependências próprias, isoladas de `core/`. Veja [`app/README.md`](app/README.md) para instruções de desenvolvimento, build e notas específicas de Linux.

## Licença

[MIT](LICENSE)
