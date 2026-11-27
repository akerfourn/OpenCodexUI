# OpenCodexUI

OpenCodexUI is a local desktop client for Codex CLI.

OpenCodexUI is an independent community project. It is not affiliated with,
endorsed by, or sponsored by OpenAI or the official
[OpenAI Codex](https://github.com/openai/codex) project.

It runs as an Electron application, uses the local `codex app-server`, and keeps
the UI focused on projects, conversations, Git workflows, local tasks, plugins,
and commit message generation.

OpenCodexUI does not bundle Codex and does not replace Codex authentication.
You must already have Codex CLI installed and configured on your machine.

## Features

- Local Electron desktop application.
- Uses the existing local Codex CLI installation.
- Project and source management.
- Inline HTML visualizations in completed assistant replies.
- [Default Codex permissions](docs/source-permissions.md) per source.
- [Browser permissions](docs/browser-permissions.md) per local source and chat.
- [Codex instance status and controls](docs/source-instances.md) per source.
- [Codex standalone updates](docs/source-updates.md) for local and WSL sources.
- [Codex permissions](docs/thread-permissions.md) for an existing conversation.
- Codex conversation list with local SQLite caching.
- Conversation creation, opening, renaming, and last-message editing.
- [Chats outside projects](docs/discussions.md) in an icon tab beside Home,
  with a fixed source and a private working directory for each conversation.
- Stable per-chat model selection, including the first send and later refreshes.
  The composer separately shows the running turn's requested model; changing the
  selector prepares the next turn without changing a running turn's settings.
- Streaming assistant responses.
- Collapsible reasoning and activity blocks.
- Optional steering while Codex is reasoning.
- Markdown rendering with copy buttons on code blocks and Mermaid diagrams.
- File references with `@`.
- Skill references with `$`.
- Image display support in messages.
- Git panel with changed files, staging, commit, pull, and push.
- Home project rows show a gray Git icon for uncommitted edits and a blue one
  for outgoing commits in the main folder's current branch. Visible rows use
  bounded local checks and a short cache; entering Home or refreshing the list
  checks them again without fetching remote updates. Tooltips include the
  observation time, and failed checks appear separately in amber.
- Guided synchronization with a destination review, fresh commit counts, and a
  per-project rebase or merge preference. Conflicts expose file editing,
  explicit resolution staging, continuation, and abort controls.
- Git remote inventory with explicit addition, fetch URL editing, and confirmed
  removal. Separate push URLs remain visible and are preserved when editing.
- Assisted commit message generation.
- Cross-project workspace inventory on Home, with on-demand checks and dated
  disk measurements. Confirmed workspace switches appear in the chat timeline.
- Project tasks and commands panel, with persistent favorites and collapsible
  command groups. Compact cards reveal side actions on hover or keyboard focus.
  Create, rename, and delete groups directly in the panel, including empty groups.
  Choose a group in the command editor or move a command from its action menu;
  deleting a group keeps its commands. Favorites appear first, followed by
  initially collapsed groups, then ungrouped commands. Grouped favorites remain
  visible in their groups; ungrouped favorites appear only in Favorites. Long
  commands are truncated with their full text available on hover.
- Logs page with details and cleanup actions.
- Experimental plugins page.
- Compact quota usage indicators.
- Light, dark, and system themes.

## Requirements

- Codex CLI 0.148.0 or newer, installed locally and available as `codex`.
- A working Codex authentication for that CLI installation.

For development from source:

- Node.js 20 or newer.
- npm 10 or newer.
- Rust and the platform linker for desktop development and packaging.
  Rustup selects the toolchain pinned in `rust/rust-toolchain.toml`.

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

Packaged installations can check GitHub Releases from the application settings.
Stable updates are checked automatically after startup, but downloading and
installing always require an explicit action. Alpha, beta, and rc releases are
excluded by default and can be enabled separately. The portable Windows build
does not support automatic installation.

## Adding Projects

On **Projects**, use **+** to open an existing folder, create a blank project,
or clone a Git repository. The separate group button organizes the project list.

For a project already on GitHub or another Git server, choose **Clone a Git
repository**. Enter its HTTPS or SSH address, select the execution source, and
provide the full destination path in that source's filesystem. The destination
must be new or empty, and its parent directory must already exist. Host-visible
sources also offer a folder picker. Git uses the source's configured credentials.

Cloning opens the project only after Git succeeds. A failed import keeps its
inputs and diagnostic visible so you can correct the address, access, or path.

## Inline Visualizations

An assistant can save a self-contained HTML file in the conversation's
workspace and reference it on its own line of Markdown.

```text
visualize{"path":"output/chart.html","title":"Quota history","mode":"wide"}
```

`path` is required. `title` and `mode` are optional. Relative paths start at
the conversation's workspace root, and absolute paths for inline rendering
must stay inside that workspace on its own source. Inline styles, scripts
and data assets run in an isolated frame.
Embed dependencies in the HTML file. Remote assets and ChatGPT host APIs
are unavailable in this renderer.

The setting under **Settings → Message display defaults** is enabled by
default. Disabling it displays a link that opens the HTML file through the
usual file opener. The referenced file must remain available to reopen the
visualization.

## Git Synchronization

On Home, a gray Git indicator marks uncommitted changes in the main project
folder. Files and directories deferred in OpenCodexUI are excluded from this
indicator; staged changes still count. Deferring or restoring a path updates
the cached indicator without another Git scan. Outgoing commits keep their blue
indicator regardless of deferred files.

Use **Synchronize and push** in the Git panel to fetch and review the selected
remote and branch before sending commits. The review shows fresh local/remote
commit counts and offers rebase or merge when histories have diverged. Its
strategy can be saved as the project's default. Tracking is configured only
when the corresponding option is selected.

If integration pauses, open the listed files, resolve their contents and mark
each resolution before continuing. Git's own worktree metadata preserves this
state across application restarts; reopen the synchronization dialog to recover
it. Continuing finishes the Git operation and requires a fresh destination
review before pushing. Abort returns to the pre-integration state after an
explicit confirmation. Detailed Git diagnostics remain available separately.

The workflow keeps untracked/ignored files, refuses colliding paths and tracked
uncommitted edits, and never force-pushes or automatically stashes changes.
Rebase is refused when commits are already known on another remote. Mirroring
and multiple push endpoints require the ordinary Git workflow; custom tracking
rules are preserved unless standard tracking setup is explicitly supported.

## Development Setup

Install dependencies:

```bash
npm install
```

Start the Electron app in development mode:

```bash
npm run dev
```

The dev script builds the local Rust daemon, starts the Vite renderer, rebuilds
the monorepo packages used by the app, and restarts Electron when backend or
main-process code changes.

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

From the `rust/` directory, `cargo test --workspace --locked` runs the
daemon and Codex JSONL transport tests with synthetic messages.
Both transport suites replay the same synthetic fixture at
`tests/fixtures/codex-rpc/parallel-exchange.jsonl`.

Composer hook tests opt into a `jsdom` environment to exercise React effects,
keyboard handling and Lexical insertion with controlled source responses.
This development dependency stays on 26.x to support the project's Node.js
20 minimum without raising its minor-version requirement.

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

The desktop package embeds the Rust daemon for its target OS and architecture.
Run the packaged application with `--check-rust-daemon` to check that it can
launch the embedded executable, complete an IPC ping, and stop it on EOF.
The flag exits before loading the application profile or opening a window.

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

The streaming and renderer performance invariants are documented in
[docs/performance.md](docs/performance.md).

Workspace ownership, execution guards and recovery contracts are documented in
[docs/workspaces.md](docs/workspaces.md).

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
  "versioningVocabulary": "simple",
  "allowPrereleaseUpdates": false
}
```

## Notes And Limitations

- The plugins page is experimental and depends on Codex CLI support.
- Some historical Codex activity details may not be available from the CLI API.
- Local command execution is intended for user-defined project tasks; review
  commands before running them.
- Windows workspace commands use PowerShell 7 (`pwsh.exe`) when available on
  the source's `PATH`, falling back to Windows PowerShell (`powershell.exe`).
  Linux, macOS and WSL workspaces use `sh -lc`. Shell selection runs on the
  workspace's source before starting the task; failures never retry the task
  with another shell. PowerShell profiles are not loaded and the system's
  script execution policy is respected. If that policy blocks an npm `.ps1`
  shim, use `npm.cmd`. Existing CMD-specific commands need to be adapted or
  wrapped explicitly, for example `cmd.exe /d /s /c 'echo %USERPROFILE%'`.
  This affects the Commands module, not the shell selected by the Codex agent.
- Cross-platform support covers Linux and Windows, with macOS intended as a
  supported target once packaging is tested there.
- The renderer bundle is still a single large bundle, so Vite may report a
  chunk-size warning during production builds.
