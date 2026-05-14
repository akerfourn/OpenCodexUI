# OpenCodexUI Project Guidelines

This file applies to the whole repository.

## Global guidelines

- Follow the global `AGENTS.md` guidelines first; this project file only adds
  project-specific constraints.
- Make a best effort to keep files below roughly 400-500 lines.
- Exceeding that range is allowed when there is a strong reason, but it should
  remain exceptional and the file should still have a single clear
  responsibility.

## Package boundaries

- Keep package responsibilities explicit:
  - `packages/opencodex-protocol`: shared UI/backend contracts.
  - `packages/codex-rpc`: Codex app-server RPC client and generated RPC types.
  - `packages/opencodex-cache`: SQLite persistence, migrations, and cache
    normalization.
  - `packages/opencodex-core`: backend orchestration, sources, cache, and Codex
    app-server coordination.
  - `packages/opencodex-ui`: UI state and React components.
  - `apps/electron-app`: native Electron integration.
- Avoid imports that bypass those boundaries. Shared contracts should go
  through `opencodex-protocol`.

## MobX and transport boundaries

- Keep MobX observable objects inside UI state and rendering code.
- Before sending data through `RootStore.request`, Electron IPC, or any backend
  transport, convert it to plain structured-clone-compatible data.
- Do not pass observable arrays, observable objects, class instances, reactions,
  functions, DOM objects, or other non-JSON values across the UI/backend
  boundary.
- Clone nested payloads explicitly when they come from stores or observable
  turn/message data, especially attachments, thread items, and settings patches.
- Prefer protocol DTOs from `opencodex-protocol` as the shape that crosses
  process boundaries.

## Sources and projects

- Preserve `sourceId` in project, thread, and chat flows.
- Do not introduce backend business logic that depends on a global active
  source, thread, turn, or project.
- Active selections are acceptable for UI display state, but backend operations
  should receive the source/thread/project they operate on explicitly.
- Orphan projects should remain readable. Actions that require Codex must use
  an explicit source.

## Cross-platform support

- Design filesystem and process logic for Windows, WSL, Linux, and macOS.
- Do not assume a path returned by a source is valid on the Electron host OS.
- Treat native Windows paths, POSIX paths, WSL paths, and future remote paths as
  distinct filesystem spaces.
- Avoid aggressive path-conversion heuristics without explicit validation.
- Custom source commands may run in an environment different from the host
  Electron process.

## SQLite and migrations

- Any SQLite schema change must be implemented through an idempotent migration.
- Migrations must preserve existing user data.
- When practical, add regression tests that cover old-schema or existing-data
  behavior.
- Do not automatically rewrite project/source associations without an explicit
  synchronization or a strongly justified migration.

## Codex app-server boundary

- Treat the Codex app-server API as an external boundary.
- Keep RPC mapping and compatibility adaptations in `codex-rpc` or
  `opencodex-core`, not in React components.
- Do not hand-edit generated Codex RPC types. Regenerate them with
  `npm run generate:codex-types` when needed.

## Validation

- Run `npm run typecheck` after changes that touch protocol, cache, core, UI, or
  Electron integration.
- Run `npm test` after changes that touch SQLite, cache behavior, migrations, or
  shared mapping logic.
- Remember that `npm test` rebuilds `better-sqlite3` for Node, while
  `npm run dev` rebuilds it for Electron.
