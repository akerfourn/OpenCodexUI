# OpenCodexUI

OpenCodexUI is a local desktop client for Codex CLI.

It runs as an Electron application, uses the local `codex app-server`, and keeps
the UI focused on projects, conversations, Git workflows, local tasks, plugins,
and commit message generation.

OpenCodexUI does not bundle Codex and does not replace Codex authentication.
You must already have Codex CLI installed and configured on your machine.

## Features

- Local Electron desktop application.
- Uses the existing local Codex CLI installation.
- Project and source management.
- Codex conversation list with local SQLite caching.
- Conversation creation, opening, renaming, and last-message editing.
- Streaming assistant responses.
- Collapsible reasoning and activity blocks.
- Optional steering while Codex is reasoning.
- Markdown rendering with copy buttons on code blocks.
- File references with `@`.
- Skill references with `$`.
- Image display support in messages.
- Git panel with changed files, staging, commit, pull, and push.
- Assisted commit message generation.
- Project tasks and commands panel.
- Logs page with details and cleanup actions.
- Experimental plugins page.
- Compact quota usage indicators.
- Light, dark, and system themes.

## Requirements

- Codex CLI installed locally and available as `codex`.
- A working Codex authentication for that CLI installation.

For development from source:

- Node.js 20 or newer.
- npm 10 or newer.

## Install From A Release

Download the latest release from:

<https://github.com/akerfourn/OpenCodexUI/releases>

Linux builds currently include:

- `OpenCodexUI-<version>.AppImage`
- `open-codex-ui_<version>_amd64.deb`

Windows builds currently include:

- `OpenCodexUI Setup <version>.exe`
- `OpenCodexUI Portable <version>.exe`

The application stores its own settings and cache in the operating system's
application data directory. It does not store Codex credentials.

## Development Setup

Install dependencies:

```bash
npm install
```

Start the Electron app in development mode:

```bash
npm run dev
```

The dev script starts the Vite renderer, rebuilds monorepo packages used by the
app, and restarts Electron when backend or main-process code changes.

UI changes are picked up by Vite without manually restarting the app.

By default, opening the app does not create a project from the process working
directory. To force an initial project for development:

```bash
OPENCODEX_PROJECT_PATH=/path/to/project npm run dev
```

## Build And Validate

Run type checking:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Build the app without packaging:

```bash
npm run build
```

Build distributable packages:

```bash
npm run dist
```

Build an unpacked local distribution:

```bash
npm run dist:dir
```

`npm test` rebuilds `better-sqlite3` for Node.js.
`npm run dev` rebuilds it for Electron.

## Generate Icons

Application icons are generated from the reference icon asset:

```bash
npm run icons
```

Generated icons are written under `apps/electron-app/build`.

## Generate Codex App-Server Types

Generated Codex app-server types live in
`packages/codex-rpc/src/generated`.

Regenerate them with:

```bash
npm run generate:codex-types
```

This command requires a Codex CLI version that supports app-server type
generation.

## Project Structure

```txt
apps/electron-app
  Electron main process, preload, renderer bootstrap, packaging

packages/codex-rpc
  JSONL stdio client for codex app-server

packages/opencodex-protocol
  UI/backend protocol shared by the renderer and backend

packages/opencodex-cache
  SQLite persistence, migrations, and cache normalization

packages/opencodex-core
  Backend orchestration, sources, cache, and Codex mapping

packages/opencodex-ui
  React components, MobX stores, Markdown rendering, UI state
```

Important boundaries:

- `codex-rpc` does not depend on Electron.
- `opencodex-protocol` does not depend on Electron, React, or Codex internals.
- `opencodex-core` does not depend on React.
- `opencodex-ui` does not import Electron directly.
- `apps/electron-app` provides the Electron transport and native integration.

## Local Data

OpenCodexUI stores local application data in Electron's `userData` directory.

This includes:

- `settings.json`
- the SQLite cache database
- optional local command logs

The settings file is merged with application defaults. Current defaults include:

```json
{
  "codexCommand": "codex",
  "defaultSourceId": null,
  "defaultModel": null,
  "defaultReasoningEffort": "medium",
  "commitMessageModel": null,
  "commitMessageReasoningEffort": "medium",
  "commitMessageLanguage": "en",
  "showActivityPanel": true,
  "experimentalApi": true,
  "allowTurnSteering": false,
  "language": "system",
  "colorScheme": "system",
  "enterKeyBehavior": "newline",
  "versioningVocabulary": "simple"
}
```

## Notes And Limitations

- The plugins page is experimental and depends on Codex CLI support.
- Some historical Codex activity details may not be available from the CLI API.
- Local command execution is intended for user-defined project tasks; review
  commands before running them.
- Cross-platform support covers Linux and Windows, with macOS intended as a
  supported target once packaging is tested there.
- The renderer bundle is still a single large bundle, so Vite may report a
  chunk-size warning during production builds.
