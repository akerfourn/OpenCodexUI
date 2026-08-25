# OpenCodexUI 1.12.0

This feature release adds source-scoped usage history, richer turn details,
multi-agent collaboration views, structured plans, and mathematical Markdown
rendering.

## Highlights

- Added source-scoped usage history with persisted rate-limit and token
  snapshots.
- Added a dedicated history window with selectable sources, date ranges,
  automatic or explicit aggregation, and usage charts.
- Added per-turn execution details for requested and effective models,
  reasoning levels, service tiers, and token breakdowns.
- Added persisted collaboration events and sub-agent timeline views.
- Added structured plan snapshots rendered as checklists with pending,
  in-progress, and completed steps.
- Added KaTeX rendering for inline and display mathematical notation in
  Markdown messages.

## Usage and turn details

- Display rate-limit windows and token usage over 24-hour, 7-day, 30-day, or
  custom periods.
- Support raw, minute, hour, and day history aggregation, with automatic
  granularity selected for longer periods.
- Show instant and cumulative input, cached-input, and output token curves.
- Warn when the beginning of a token history has incomplete baseline data.
- Open a turn details dialog from the chat to inspect execution settings and
  the latest token usage breakdown.
- Preserve requested settings separately when Codex applies an effective model
  or reasoning level different from the requested one.

## Collaboration and chat rendering

- Show delegation, inter-agent messages, follow-ups, interruptions, waits,
  resumptions, closures, and delivered results in the chat timeline.
- Correlate collaboration events with their source, parent thread, child
  threads, agent paths, and turn activities.
- Open a related sub-agent chat from a collaboration event.
- Display sub-agent ancestry and roles in the sub-agent thread tree.
- Preserve spawn model and reasoning metadata when a child turn starts or is
  synchronized later.
- Render the latest structured plan as a persistent checklist while a turn is
  running or while an incomplete plan remains after a terminal turn.
- Keep collaboration events aligned with the surrounding reasoning timeline
  while showing the latest plan separately from transient activities.
- Support dollar-delimited and LaTeX-style math delimiters while preserving
  inline code content.

## Git and project workflows

- Choose a one-shot model and reasoning override when generating a commit
  message, without changing the configured default settings.
- Surface commit-message generation failures directly in the project Git flow.
- Compact the staged context used for commit-message generation.

## Reliability and compatibility

- Align the generated app-server protocol with Codex `0.147` contracts.
- Raise the minimum supported Codex CLI version to `0.147.0`; existing Codex
  installations must be updated to `0.147.0` or newer.
- Preserve active-turn state while thread renames are serialized.
- Prefer the event source when synchronizing completed turns across sources.
- Deduplicate persisted token-usage snapshots and apply updates atomically.
- Correct usage-limit identifiers for active-model notifications and refresh
  diagnostics when reset credits change.
- Use plural-aware translations across the UI and constrain the usage history
  layout on smaller windows.
- Extend regression coverage for usage history, collaboration, plans, turn
  details, Markdown rendering, and Git commit generation.

## Internal architecture

- Organize backend services, cache repositories, protocol messages, UI stores,
  mappings, styles, and RPC transport into focused domain modules.
- Split SQLite migrations into versioned modules while preserving their
  existing application order and idempotent behavior.

## Migrations

SQLite migrations 23 through 27 are applied automatically when the application
starts:

- Migration 23 adds historical thread token-usage snapshots and per-turn
  execution metadata.
- Migration 24 adds source-scoped historical Codex rate-limit snapshots.
- Migration 25 adds the source/time index used by token-usage history queries.
- Migration 26 adds normalized, source-aware collaboration event persistence.
- Migration 27 adds structured sub-agent source metadata to thread summaries.

Existing project, source, thread, chat, and usage data is preserved. Usage
history starts accumulating new snapshots after the upgrade; the migrations
do not reconstruct measurements from before `1.12.0`.

## Notes

This release includes the changes delivered after `1.11.1`.

It promotes the code developed through the `1.12.0-alpha.0` to
`1.12.0-alpha.5` previews and the `1.12.0-rc.0` candidate to stable `1.12.0`.
