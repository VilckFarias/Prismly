# Suporte cross-platform (Windows + Linux) para o tray app — Design

## Contexto

O tray app (Fase 2) foi construído e testado só no Windows. `tray.getBounds()` — usado por `anchorAboveTray()` em [`app/src/main/tray.ts`](../../../app/src/main/tray.ts) para posicionar o popup acima do ícone da bandeja — é conhecido por retornar bounds zerados em várias configurações de Linux, o que quebraria o posicionamento. Além disso, GNOME não mostra nenhum ícone de bandeja sem uma extensão (AppIndicator/KStatusNotifierItem) instalada — algo que não dá pra detectar via API do Electron.

O usuário decidiu (2026-07-13) priorizar isso à frente da Fase 3 (mais adaptadores de IA). Não há máquina Linux disponível nesta sessão; a verificação final vai acontecer em hardware real (do usuário ou de um amigo). GNOME e KDE devem ser cobertos, sem assumir só um dos dois.

## Decisões

- **Fallback de posição quando os bounds da bandeja forem inválidos:** canto inferior direito da tela primária (`screen.getPrimaryDisplay().workArea`), não o centro.
- **Empacotamento Linux:** só `AppImage`. `snap` e `deb` saem da lista de targets do `electron-builder.yml` — não são gerenciáveis/buildáveis com confiança a partir do Windows nesta fase.
- **Aviso sobre extensão do GNOME:** `console.warn` no startup (só quando `process.platform === 'linux'`) + nova seção no `README.md` explicando a extensão necessária e como rodar o AppImage (`chmod +x` + executar).

## 1. Validação de bounds + posição de fallback

`anchorAboveTray()` hoje confia cegamente em `tray.getBounds()`:

```ts
function anchorAboveTray(popupWindow: BrowserWindow, tray: Tray): void {
  const trayBounds = tray.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - POPUP_WIDTH / 2);
  const y = Math.round(trayBounds.y - POPUP_HEIGHT);
  popupWindow.setPosition(x, y, false);
}
```

Nova versão, em `app/src/main/tray.ts`:

```ts
import { screen } from 'electron';

const EDGE_MARGIN = 12;

function isValidTrayBounds(bounds: Electron.Rectangle): boolean {
  return bounds.width > 0 && bounds.height > 0;
}

function fallbackPosition(): { x: number; y: number } {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  return {
    x: x + width - POPUP_WIDTH - EDGE_MARGIN,
    y: y + height - POPUP_HEIGHT - EDGE_MARGIN,
  };
}

function anchorAboveTray(popupWindow: BrowserWindow, tray: Tray): void {
  const trayBounds = tray.getBounds();
  const { x, y } = isValidTrayBounds(trayBounds)
    ? {
        x: Math.round(trayBounds.x + trayBounds.width / 2 - POPUP_WIDTH / 2),
        y: Math.round(trayBounds.y - POPUP_HEIGHT),
      }
    : fallbackPosition();
  popupWindow.setPosition(x, y, false);
}
```

`width > 0 && height > 0` cobre zero, negativo e `NaN` num único check (qualquer comparação com `NaN` é `false` em JS — não precisa de tratamento especial). `resetWindow()` já chama `anchorAboveTray()`, então ganha o fix automaticamente; não precisa de mudança separada.

## 2. Aviso sobre a extensão do GNOME

Sem API do Electron pra detectar se a extensão AppIndicator/KStatusNotifierItem está instalada no GNOME. Não existe hoje nenhum texto de onboarding no app sobre isso (a orientação de "clicar na seta escondida" foi dada verbalmente nesta conversa, não é conteúdo do app) — então não há nada quebrado pra corrigir na UI, só a adicionar:

- `console.warn` em `app/src/main/index.ts`, condicional a `process.platform === 'linux'`, impresso uma vez no startup, algo como:
  `"No GNOME, o ícone da bandeja só aparece com a extensão AppIndicator/KStatusNotifierItem instalada. Veja o README."`
- Nova seção "Linux" em `app/README.md` explicando a extensão necessária (nome + onde encontrar) e como rodar o AppImage (`chmod +x prismly-*.AppImage` e executar).

## 3. Empacotamento Linux — só AppImage

`app/electron-builder.yml` hoje:

```yaml
linux:
  target:
    - AppImage
    - snap
    - deb
  maintainer: electronjs.org
  category: Utility
```

Novo:

```yaml
linux:
  target:
    - AppImage
  maintainer: Vilck Farias
  category: Utility
```

`snap` exige `snapcraft` (ferramenta só de Linux) e `deb` tem exigências próprias — nenhum dos dois é confiável de gerar a partir do Windows nesta fase. `maintainer: electronjs.org` é resíduo do scaffold do electron-vite (mesma classe de placeholder já corrigida antes pro `appId`/`productName`), substituído pelo nome real do autor.

O script `npm run build:linux` já existe ([`app/package.json`](../../../app/package.json)) — nenhuma mudança de script necessária, só o ajuste da lista de targets.

## 4. Plano de testes

**Automatizável nesta sessão (Windows):**
- `npm run typecheck`
- Suíte de testes existente, se cobrir `tray.ts`/`popupGeometry.ts`
- `npm run build:linux` — confirma que o AppImage é gerado sem erro a partir do Windows

**Manual, adiado para hardware Linux real (usuário ou amigo):**
- Rodar o AppImage no GNOME: confirmar que o ícone aparece (com a extensão) ou que o aviso no console + README explicam por que não aparece (sem a extensão)
- Rodar o AppImage no KDE: confirmar que o ícone aparece nativamente
- Em ambos: forçar (ou observar) bounds inválidos da bandeja e confirmar que o popup aparece no canto inferior direito da tela, não fora da tela

O plano de implementação deve marcar claramente quais passos de verificação são automatizáveis agora vs. quais ficam pendentes para quem testar em Linux.
