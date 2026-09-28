# Debug module

The Debug tool runs one local JavaScript/TypeScript target at a time. It uses
Microsoft's standalone `vscode-js-debug` adapter over DAP; VS Code is not
required. Node.js programs need a Node executable, and browser targets need
Chrome installed on the host.

## Supported workflows

- Launch Node with a program, arguments, working directory and optional runtime.
- Attach to a Node Inspector port on `127.0.0.1`.
- Launch Chrome with a temporary dedicated profile and an application URL.
- Attach to an existing debugging-enabled Chrome using a port and explicit URL
  filter. Discovery rejects filters matching zero or multiple pages.
- Debug compiled TypeScript when its source maps are available. Workspace
  scripts use js-debug's internal source-map entry pauses so initial breakpoints
  can be installed before the first compiled statements execute.

Configurations, breakpoints and watches live in the application's SQLite
database. Profiles and breakpoints retain their full source, project and
workspace context (including the captured path); watches remain application-wide.
Records are updated individually or per workspace, independently of global
settings. Legacy `settings.json` debug data is imported once in a transaction;
the JSON section is removed only after successful import and loading. A retry
cannot overwrite database changes or restore deleted profiles.
Relative paths are resolved against the configuration's captured workspace.
Neither opening a project nor loading settings starts a program.

### Importing VS Code profiles

The panel detects `.vscode/launch.json` with a source-aware file stat. An explicit
import reads the file, previews individual configurations and opens the normal
editor before saving an independent profile in SQLite. It never modifies the
source file, executes substitutions, runs tasks or starts a debug session.

The importer accepts `node`, `pwa-node`, `chrome` and `pwa-chrome`, and copies
only fields supported by the current configuration form. It expands
`${workspaceFolder}`, `${workspaceFolderBasename}`, `${pathSeparator}` and
`${/}` using the captured workspace, and applies the current host's platform
override. Other variables and unsupported fields are reported in both the
preview and the editor. Explicit remote or process-id attachment targets are
rejected rather than replaced with a local default. Compounds, tasks, environment
overrides and custom source-map settings are not imported.

JSON5 is a direct core dependency for safe parsing of comments and trailing
commas (a superset of VS Code's JSONC syntax), without evaluating JavaScript.
Preview input is bounded to 512 KiB and 100 profiles. This is a partial import,
not general compatibility with VS Code launch configurations or extensions.

### Breakpoints and sources

Set breakpoints in the Monaco gutter. Requested, verified, unresolved and
disabled points have distinct markers. The panel also supports conditions,
enable/disable, individual removal and clearing the workspace's breakpoints.
Save edits before debugging: breakpoint line numbers describe the saved source,
and are not automatically relocated when editing the buffer.

The stack and variables belong to the selected paused frame. Objects load on
expansion, with pages capped at 100 values and a depth limit. Watches and console
expressions use that frame. The console retains 300 entries of at most 4 KiB
each, supports copying/clearing, and is not a terminal input stream.

Sources reuse an unchanged open file when its text matches the executed source.
Otherwise the Files document catalogue receives a distinct, read-only `(Debug)`
snapshot. This also handles generated sources and dependencies without granting
filesystem write access or replacing unsaved edits. Reopening identical executed
content reuses its snapshot. Sources larger than 2 MiB are rejected by the viewer
boundary; the DAP transport also bounds individual messages.

## Lifecycle and boundaries

- The application owns the session; changing chat, document or sidebar tool does
  not stop it. Closing a project with an active session is blocked with an
  explanation. Stop/disconnect first.
- Stop terminates a launched target. Disconnect leaves an attached target
  running. Application shutdown applies the same ownership distinction and
  releases adapter connections/processes.
- Every execution request identifies its session. Suspended queries additionally
  identify an epoch; continue, stop and a new pause invalidate old references.
  The UI also guards changes of frame and rejects older snapshot revisions.
- Core validates the source/project/workspace/path tuple before local access.
  WSL, custom, SSH and Docker execution environments are not supported here.
- One root DAP launcher plus **one required target channel** constitute the
  user-visible session. js-debug requests that second channel with
  `startDebugging`, even for a single Node program. Further targets are rejected
  with console feedback. General workers, child processes and compound launches
  are outside this version's scope.
- No terminal reverse request, hot reload, agent control,
  embedded browser or integration with Commands is provided.

The protocol DTOs are in `opencodex-protocol/src/debug.ts`. Core separates
`DapConnection`, `DebugSession`, `DebugService` and the `DebugAdapter` interface
from `JavaScriptDebugAdapter` and its configuration resolver. A future adapter
can implement that interface and add its own configuration form. Files exposes
viewer-neutral gutter markers instead of importing adapter-specific concepts.

## Distribution

`apps/electron-app/scripts/prepare-debug-adapter.mjs` downloads the official
[js-debug v1.140.0 standalone archive][release] during development setup or the
Electron build. It verifies SHA-256:

```text
27dab92937ec1ab35821ae955aac867544fe06a1b6307229049f2d789af10968
```

The build cache is ignored by Git. An optional archive path lets offline builds
prepare the same verified distribution:

```sh
node apps/electron-app/scripts/prepare-debug-adapter.mjs /path/to/archive.tar.gz
```

Build hosts need `tar` (available on current Windows, Linux and macOS). A small
package manifest isolates the archive's CommonJS bundles from our ESM package
scope. The adapter is copied outside ASAR through `extraResources`, including
its MIT `LICENSE`, README and bundled third-party license comments. Keep these
notices when changing the distribution. The application launches it with its
own Electron executable and `ELECTRON_RUN_AS_NODE=1`; nothing is downloaded when
users open the Debug panel. Target Node processes do not inherit that flag.

## Validation

Normal tests include deterministic DAP framing/timeouts, session ownership,
late replies, refused breakpoints, workspace isolation, persistence failures,
dirty/generated documents, close protection and panel rendering in both themes.

After preparing the adapter, opt-in integration tests start only temporary
programs and loopback servers, with no LLM calls or external service:

```sh
DEBUG_ADAPTER_INTEGRATION=1 \
DEBUG_CHROME_EXECUTABLE=/path/to/google-chrome \
npx vitest run packages/opencodex-core/test/Debug*.integration.test.ts
```

Set `DEBUG_ADAPTER_RUNTIME` to the Electron binary to run target integration
tests with the distributed runtime. These tests cover initial JS/TS breakpoints,
variables, source content, resume, Node attach, Chrome launch/attach, ambiguous
browser selection and launch failure. Node and Chrome attach tests verify that
the existing target survives disconnect. Test-only headless Chrome flags are
not applied to normal user configurations.

Validated here on Linux with Node 22, Electron 32 and local Google Chrome.
Windows/macOS, a packaged installer, and interactive GUI navigation/keyboard
checks require follow-up validation on those environments. Theme render tests
are not a substitute for interactive visual review.

[release]: https://github.com/microsoft/vscode-js-debug/releases/tag/v1.140.0
