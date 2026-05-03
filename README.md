# OpenCodexUI

OpenCodexUI is a local Electron app for driving Codex CLI through
`codex app-server`.

The app uses the machine's existing Codex installation. It does not bundle
Codex and does not replace Codex authentication.

## Requirements

- Node.js 20 or newer.
- npm 10 or newer.
- Codex CLI installed locally and available as `codex` in the `PATH`.

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

This script starts the Vite renderer in dev mode, automatically rebuilds the
monorepo packages used by the app, and restarts Electron when the backend or
main process changes. UI changes are picked up without restarting the app
manually.

By default, the app uses the directory where `npm run dev` was started as the
current project. To force another project:

```bash
OPENCODEX_PROJECT_PATH=/path/to/project npm run dev
```

## VSCode Debug

A `Debug Electron app` configuration is available in VSCode. It builds the app,
then starts Electron with the Node inspector attached to the main process.

## Build And Validation

```bash
npm run typecheck
npm test
npm run build
```

## Generate Codex App-Server Types

```bash
npm run generate:codex-types
```

Generated types are written to `packages/codex-rpc/src/generated`.

## Structure

```txt
apps/electron-app
  src/main      Electron integration, IPC, preload, lifecycle
  src/renderer  React mounting and Electron transport

packages/codex-rpc
  JSONL stdio client for codex app-server

packages/opencodex-protocol
  internal UI/backend contract independent from Electron

packages/opencodex-core
  backend services and Codex-to-OpenCodexUI mapping

packages/opencodex-ui
  React, MobX, markdown, chat, approvals, thread list
```

`packages/codex-rpc` does not depend on Electron. `opencodex-ui` also does not
depend on Electron: the renderer only provides a transport compatible with
`OpenCodexClientTransport`.

## Settings

Electron settings are stored in `settings.json` under the app's `userData`
directory.

```json
{
  "codexCommand": "codex",
  "defaultModel": null,
  "defaultReasoningEffort": "medium",
  "showActivityPanel": true,
  "experimentalApi": true,
  "language": "system"
}
```

## Known Limitations

- The list currently loads up to 2,000 threads.
- The main approval flows are handled; some more complex Codex prompts may need
  dedicated mapping.
- The renderer bundle is still a single bundle, and Vite reports one chunk
  larger than 500 kB.
