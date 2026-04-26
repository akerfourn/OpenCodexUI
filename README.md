# OpenCodexUI

OpenCodexUI est une application Electron locale pour piloter Codex CLI via
`codex app-server`.

L'application utilise l'installation Codex existante de la machine. Elle
n'embarque pas Codex et ne remplace pas son authentification.

## Prérequis

- Node.js 20 ou plus récent.
- npm 10 ou plus récent.
- Codex CLI installé localement et accessible via `codex` dans le `PATH`.

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

Ce script compile les packages, build l'application Electron, puis démarre
Electron. Les logs du main process sont visibles dans le terminal.

Par défaut, l'application utilise le dossier depuis lequel `npm run dev` a été
lancé comme projet courant. Pour forcer un autre projet :

```bash
OPENCODEX_PROJECT_PATH=/chemin/vers/projet npm run dev
```

## Debug VSCode

Une configuration `Debug Electron app` est disponible dans VSCode. Elle build
l'application, puis démarre Electron avec l'inspecteur Node attaché au main
process.

## Build et validation

```bash
npm run typecheck
npm test
npm run build
```

## Générer les types Codex app-server

```bash
npm run generate:codex-types
```

Les types générés sont placés dans `packages/codex-rpc/src/generated`.

## Structure

```txt
apps/electron-app
  src/main      intégration Electron, IPC, preload, lifecycle
  src/renderer  montage React et transport Electron

packages/codex-rpc
  client stdio JSONL pour codex app-server

packages/opencodex-protocol
  contrat interne UI/backend indépendant d'Electron

packages/opencodex-core
  services backend et mapping Codex vers OpenCodexUI

packages/opencodex-ui
  React, MobX, markdown, chat, approvals, liste des threads
```

`packages/codex-rpc` ne dépend pas d'Electron. `opencodex-ui` ne dépend pas
d'Electron non plus : le renderer lui fournit seulement un transport conforme à
`OpenCodexClientTransport`.

## Paramètres

Les paramètres Electron sont stockés dans `settings.json` sous le dossier
`userData` de l'application.

```json
{
  "codexCommand": "codex",
  "defaultModel": null,
  "defaultReasoningEffort": "medium",
  "showActivityPanel": true,
  "experimentalApi": true
}
```

## Limitations connues

- Le mode dev rebuild l'app avant lancement ; le hot reload renderer complet
  n'est pas encore branché.
- La liste charge actuellement jusqu'à 2000 threads.
- Les approvals principales sont gérées ; certains prompts Codex plus complexes
  peuvent nécessiter un mapping dédié.
- Le bundle renderer est encore unique et Vite signale un chunk supérieur à
  500 kB.
