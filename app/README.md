# Prismly (app)

Aplicativo Electron do Prismly — ícone na bandeja do sistema com uso e custo de assistentes de IA de código.

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Testes

```bash
$ npm test
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Linux

O pacote gerado para Linux é um `.AppImage`. Para rodar:

```bash
chmod +x prismly-*.AppImage
./prismly-*.AppImage
```

**GNOME:** por padrão, o GNOME não exibe nenhum ícone de bandeja do sistema. É preciso instalar a extensão [AppIndicator and KStatusNotifierItem Support](https://extensions.gnome.org/extension/615/appindicator-support/) pelo GNOME Extensions antes de abrir o Prismly, senão o ícone não vai aparecer em lugar nenhum (o app roda normalmente, só o ícone da bandeja fica invisível). Se você rodar o AppImage a partir de um terminal, o Prismly avisa isso no console.

**KDE/XFCE:** o suporte a bandeja é nativo, não precisa de nenhuma extensão.
