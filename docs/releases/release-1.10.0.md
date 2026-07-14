# OpenCodexUI 1.10.0

This feature release promotes the 1.10.0 preview to a stable release. It
consolidates the work delivered since 1.9.1 around source-aware Codex
installations, model capabilities, usage credits, project rules, Git
workflows, and chat performance.

## Highlights

- Added source-aware Codex installations:
  - support for local, custom, WSL, and SSH source kinds;
  - project identities scoped by source, so the same path can exist in
    different source environments without mixing their data;
  - source-specific command resolution and local-access handling;
  - default source selection directly from source cards.
- Added Codex update management:
  - cached GitHub release checks with a manual refresh action;
  - per-source update status and an action to apply an available update;
  - improved detection of standalone Codex binaries, including home-directory
    candidates and symlink resolution;
  - a home status banner for update checks, available releases, and failures.
- Added model-aware reasoning controls:
  - cache model catalogs per source for faster loading;
  - expose reasoning options advertised by the selected model;
  - reconcile the reasoning selector when model metadata changes;
  - use conservative fallbacks when a model does not expose capabilities.
- Added source-scoped usage reset credits:
  - list reset credits belonging to the selected Codex source;
  - show the individual expiration dates when the service provides them;
  - require confirmation before applying a reset credit;
  - handle credit consumption idempotently and preserve usage-limit
    identifiers across cached snapshots.
- Added managed project command rules:
  - create, edit, enable, disable, and delete project rules from the project
    interface;
  - choose `allow`, `prompt`, or `forbidden` decisions;
  - define command-prefix patterns, justifications, and optional examples;
  - use conservative presets for common test commands;
  - generate `.codex/rules/opencodex-ui.rules` without modifying user-authored
    rule files;
  - test generated rules and detect changes made outside OpenCodexUI;
  - show when a Codex restart is required before a rule change takes effect.

## Git and project workflows

- Added deferred Git paths:
  - set files or directories aside from the Git panel;
  - keep them visible in the working tree while excluding them from staging
    actions such as “stage all”;
  - restore deferred paths when they are ready to be included again.
- Improved tag synchronization:
  - show whether a local tag is present on the configured remote;
  - identify remote/local tag mismatches;
  - fetch tags on demand;
  - push an individual tag or all pending tags;
  - expose force-push for an individual tag behind an explicit confirmation.
- Improved project organization with optional custom project display names.

## Threads and chat

- Added permanent thread deletion with protocol and runtime synchronization.
- Added read-only inspection of sub-agent threads, including their ancestry
  metadata and roles where available.
- Preserved reading position when thread snapshots, window resizing, layout
  changes, or streamed content updates occur.
- Avoided moving the view to the end while the user is reading or selecting
  earlier content.
- Preserved the composer scroll position while editing long user messages.
- Retained layout, timeline, and scroll state when switching between views.
- Added expand/collapse controls for active reasoning history, with a compact
  recent window while a turn is running.

## Streaming performance and large messages

- Batched reasoning, process, and command-stream notifications before UI
  processing while preserving chunk, base64, and replacement semantics.
- Reduced cache churn by buffering streamed text and materializing it at
  snapshot or delta boundaries.
- Indexed live turn items so streaming updates can be applied without
  repeatedly scanning the complete turn.
- Added replace-mode handling for streamed file patches and turn diffs.
- Throttled streamed Markdown rendering and deferred syntax highlighting until
  content settles.
- Added advanced-mode Markdown render timing metrics and a content-free
  slowdown monitor for diagnosing renderer/backend throughput issues.
- Bounded command output and detail previews for large logs, including long
  command-output lines.
- Kept notification throughput metrics separate from processing cost and made
  event routing source-aware for multi-source sessions.

## Reliability and compatibility

- Preserved source identifiers through live thread, turn, approval, project,
  and chat event routing.
- Improved source-aware approval routing and cleanup of orphaned command
  output buffers.
- Preserved usage-limit IDs even when upstream payloads omit them, using the
  response key as a safe fallback.
- Added shared protocol DTOs and compatibility handling for the new source,
  model, usage, rules, and Git operations.
- Added documentation and type coverage for RPC process helpers, cache input
  normalization, backend services, UI stores, and message utilities.

## Release and build tooling

- Added a tag-driven GitHub release workflow:
  - validate the tag, package version, main-branch ancestry, and release notes;
  - build Linux and Windows distributions;
  - publish the generated artifacts to the corresponding GitHub release.
- Rebuild `better-sqlite3` for Electron before distribution builds so the
  native module matches the target runtime.

## Migrations

SQLite migrations 16 through 20 are applied automatically when the application
opens an existing cache. They cover source-scoped project identities, source
kinds, sub-agent thread metadata, per-source model catalogs, and managed
project command rules. Existing cache data is preserved; older application
versions do not understand the new fields and tables.

## Notes

This release promotes the `1.10.0-alpha.1` through `1.10.0-alpha.4` preview
series to stable `1.10.0`. It includes the changes delivered after `1.9.1`.
