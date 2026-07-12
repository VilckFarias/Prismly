# Design: Fase 2 — app de bandeja (tray app)

## Contexto e motivação

O Prismly hoje (Fase 1, concluída) é um app Electron com uma janela normal (1000x700), que aparece na barra de tarefas do Windows. A visão original do projeto (ver `project_prismly_roadmap` em memória) é um app que fica "no cantinho superior/bandeja do computador" — sempre disponível, sem ocupar espaço na barra de tarefas, seguindo o padrão de apps como Docker Desktop ou Rambox.

Esta fase transforma o "invólucro" do app (como a janela é criada e mostrada) num ícone de bandeja + popup. **O conteúdo não muda**: as abas "Ao vivo" e "Histórico", o IPC, o watcher de logs — tudo isso continua exatamente como está. Só a forma como o usuário abre/fecha a janela muda.

## Escopo desta fase

- Ícone na bandeja do sistema (Windows), usando o ícone já existente do app.
- Clique esquerdo no ícone mostra/esconde um popup pequeno (sem bordas, sem barra de tarefas).
- Clique direito no ícone mostra um menu nativo com a opção "Sair".
- Popup posicionado ancorado acima do ícone da bandeja.
- Popup esconde sozinho ao perder o foco (clicar fora dele).
- Sair do app só acontece pelo menu do clique direito — não há mais nenhuma forma de "fechar" a janela que encerre o app.

Fora de escopo (fases futuras ou não decidido ainda): iniciar automaticamente com o Windows (auto-start no login), empacotamento/distribuição do app (installer, ícone de produção, auto-update — o app continua rodando só via `npm run dev`), suporte a macOS/Linux (o projeto já é Windows-first; a API `Tray` do Electron é multiplataforma, mas o posicionamento do popup acima do ícone assume a bandeja do Windows, no canto inferior direito — comportamento em outros SOs não foi verificado).

## Arquitetura

`app/src/main/index.ts` muda de "cria uma `BrowserWindow` normal ao ficar pronto" para "cria um `Tray` + uma janela popup, ambos geridos pelo processo principal":

```
app.whenReady()
  → createTray()       // ícone na bandeja + menu de contexto
  → createPopupWindow() // BrowserWindow sem bordas, escondida por padrão
  → startWatcher(sendUpdate)
```

**`createTray()`:**
- Cria um `Tray` usando `app/resources/icon.png` (o mesmo ícone que já existe no scaffold do Electron, usado hoje só para empacotamento — passa a ser usado em runtime também).
- `tray.on('click', ...)` alterna a visibilidade do popup (mostra se estiver escondido, esconde se estiver visível), posicionando a janela antes de mostrar.
- `tray.setContextMenu(...)` com um item "Sair" que chama `app.quit()`.

**`createPopupWindow()`:**
- `BrowserWindow` com `frame: false`, `skipTaskbar: true`, `resizable: false`, tamanho fixo 380x500, `show: false` (começa escondida).
- Mesma `webPreferences` de hoje (`contextIsolation: true`, `nodeIntegration: false`, mesmo `preload`).
- Carrega o mesmo `index.html`/`ELECTRON_RENDERER_URL` de hoje — nenhuma mudança no lado do renderer.
- Evento `blur` esconde a janela (`popupWindow.hide()`) em vez de fechar/destruir — preserva o estado da UI entre uma abertura e outra (não recarrega a página toda vez).
- `sendUpdate()` (que já existe) continua sendo chamado a cada atualização do watcher, independentemente da janela estar visível ou escondida — os dados continuam atualizando em segundo plano.

**Posicionamento do popup:**
Antes de mostrar, calcula a posição a partir de `tray.getBounds()`: a janela é centralizada horizontalmente sobre o ícone e ancorada logo acima dele (`y = trayBounds.y - popupHeight`), assumindo bandeja no canto inferior direito (padrão Windows).

**Removido:** o handler `app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); })` — não faz mais sentido, já que a janela nunca é "fechada" pelo usuário (só escondida), e sair do app é sempre via menu do clique direito.

## Testes

Sem testes automatizados novos — esta fase é puramente sobre o "invólucro" Electron (Tray, janela, posicionamento), que já não tinha cobertura de teste antes (é infraestrutura de UI nativa, não lógica de negócio). A verificação é manual: abrir o app, confirmar que o ícone aparece na bandeja (sem ícone na barra de tarefas), clicar mostra/esconde o popup na posição certa, clique direito mostra "Sair" e realmente encerra o app.
