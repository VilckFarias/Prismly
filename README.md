# Prismly

Ferramenta que lê os logs locais de uso de assistentes de IA de código (começando pelo Claude Code) e calcula tokens consumidos e custo em dólar ou real. Inspirada no [ccusage](https://github.com/ryoppippi/ccusage), mas com código 100% autoral — não é fork nem depende do pacote `ccusage`.

Roda como um ícone na bandeja do sistema (Windows, com suporte planejado a Linux), com três abas:

- **Ao vivo** — o bloco de sessão de 5h em andamento, com barra de progresso e contagem regressiva.
- **Histórico** — uso agregado por dia, semana, mês, modelo e projeto (mais recente primeiro).
- **Configuração** — tema visual (com paleta personalizável), moeda de exibição (US$/R$, com cotação buscada automaticamente) e o comportamento da janela.

## Baixar e usar

O app empacotado (instalador do Windows) fica disponível na aba [Releases](https://github.com/VilckFarias/Prismly/releases) deste repositório.

## Desenvolvimento

Duas partes independentes:

- **`core/`** — a camada de dados (parsing dos logs, cálculo de custo, agregações). TypeScript puro, roda nativamente no Node (v22.6+/24, sem build step), zero dependências externas em runtime.

  ```bash
  npm install
  npm test        # roda os testes de core/
  npm run typecheck
  npm start        # relatório em modo terminal (CLI)
  ```

- **`app/`** — o app Electron (bandeja do sistema). Dependências próprias, isoladas de `core/`. Veja [`app/README.md`](app/README.md) para instruções de desenvolvimento, build e notas específicas de Linux.

## Licença

[MIT](LICENSE)
