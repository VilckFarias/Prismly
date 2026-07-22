# Contribuindo com o Prismly

Obrigado pelo interesse em contribuir! O modelo de contribuição é o padrão de projetos open source no GitHub: **fork + pull request**.

## Como contribuir

1. Faça um fork deste repositório.
2. Crie uma branch a partir de `main` com um nome descritivo (ex: `fix/tray-icon-linux`).
3. Faça suas alterações. Se estiver mexendo em `core/` ou `cli/`, rode `npm test` e `npm run typecheck` antes de abrir o PR — a CI roda os dois automaticamente, mas é mais rápido pegar erro localmente. Se estiver mexendo em `app/`, veja [`app/README.md`](app/README.md) para o setup específico do Electron.
4. Abra um Pull Request contra `main`, descrevendo o que mudou e por quê.

## Convenções do projeto

- Código (pastas, arquivos, funções, variáveis) em **inglês**.
- Texto voltado ao usuário final (labels, títulos, mensagens exibidas) em **português** — o público é brasileiro.
- `core/` mantém zero dependências de runtime — qualquer nova dependência aí precisa de justificativa forte.

## Dúvidas ou bugs

Abra uma [issue](../../issues) descrevendo o problema ou a ideia antes de investir tempo numa mudança grande, pra alinhar antes de codar.
