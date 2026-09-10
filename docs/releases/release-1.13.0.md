# OpenCodexUI 1.13.0

This feature release adds Git worktree-backed workspaces, persistent project
and chat goals, Docker and Compose management, expanded Git workflows, and
richer activity and diagnostic views.

## Highlights

- Added named workspaces with conversations grouped by checkout, configurable
  storage locations, and verified conversation switching.
- Added native chat goals and a persistent project goal catalogue with explicit
  start, pause, resume, and execution tracking.
- Added local Docker container management and source-aware project Compose
  controls, service details, and logs.
- Added branch protection for UI commits and directional local-branch merges.
- Added project activity indicators, close confirmation, and shutdown progress.
- Added developer turn diagnostics, log filtering, and opt-in filesystem search
  for project references.

## Workspaces and project context

- Keep each existing project's directory as its primary workspace, including
  projects that do not use Git.
- Create named secondary workspaces from a new branch, an existing local
  branch, or a detached revision, and import existing repository worktrees.
- Group conversations by workspace and create a new chat directly inside the
  desired checkout.
- Rename secondary workspaces independently of their directory names; keep the
  primary workspace's properties fixed.
- Move an existing conversation between workspaces through its chat menu, with
  explicit confirmation and verification of the destination context.
- Preserve the workspace and directory recorded for each guarded turn instead
  of rewriting historical context when a conversation changes workspace.
- Keep Git, Compose, commands, searches, rules, and folder/terminal/IDE openings
  aligned with the effective workspace and its source.
- Configure storage locations per source in the Workspaces section, with one
  default location per configured source and an optional custom destination.
- Initialize local storage under the application's data directory, using
  `workspaces/<project-id>/<workspace-id>` for automatic checkouts.
- Preserve existing storage preferences and the destinations of interrupted
  creations when storage settings change.
- Recover confirmed worktree creations and interrupted conversation
  transitions without blindly repeating operations with uncertain results.
- Configure shared context folders with filesystem and `.env` permissions,
  and validate supported permission profiles before switching checkouts.

## Goals and execution tracking

- Define a chat goal separately from starting it, with project references and
  an optional token budget.
- Start, pause, and resume native Codex goals while displaying their status,
  consumed tokens, and elapsed duration in readable time units.
- Preserve goal definitions and started state across UI sessions, and resume
  restored goals without resetting their lifecycle.
- Create and edit persistent project goals, launch them in a conversation, and
  track their source, workspace, execution status, and usage.
- Archive or delete project goals through lifecycle-aware actions.
- Import native chat goals into the project catalogue and preserve them when
  other loaded chats are synchronized.
- Group the catalogue into current-chat goals, unassigned goals, and collapsed
  sections for other conversations.

## Docker and Docker Compose

- Inspect containers from the host's local Docker engine in Home, including
  images, state, and published ports.
- Start, stop, and restart existing containers, and inspect bounded stdout and
  stderr logs with explicit truncation indicators.
- Detect project Compose services and manage them through the project's source.
- Inspect service containers, health, exit codes, published ports, and logs in
  a dedicated service dialog.
- Refresh Compose state while its panel is visible, with more frequent polling
  during transient service states.
- Use distinct stable Compose project names for secondary workspaces while
  preserving the primary workspace's existing naming behavior.

## Git workflows

- Select local branches for checkout and merge operations.
- Merge a selected local branch into the current branch, or merge the current
  branch into a selected target that remains active afterwards.
- Require explicit confirmation before proceeding with a merge-to-target
  operation when uncommitted changes are present.
- Configure project-local protected branches to block commits initiated from
  OpenCodexUI while keeping merge and push operations available.
- Validate the workspace context before committing to avoid acting on a stale
  or contradictory checkout selection.

## Chat and application experience

- Resize the chat composer using the pointer or keyboard and access native
  editing actions through its context menu.
- Require modifier-clicks to open Markdown links and show localized tooltips
  with the destination and the expected interaction.
- Search ignored project files explicitly with the `@!` reference marker,
  using a source-aware recursive filesystem search and cached indexes.
- Keep historical plans in the activity timeline and live plans in the latest
  sub-turn, with progress indicators for in-progress steps.
- Navigate project tools through a vertical tab rail with indicators for draft
  commits, active commands, and running containers.
- Surface pending project work in project tabs and warn before quitting while
  Codex turns or project operations remain active.
- Show shutdown progress while application cleanup runs, with a native close
  confirmation fallback when the renderer is unavailable.
- Browse source-scoped installed plugins and bounded, paginated search results,
  with refreshed list layouts and hover behavior.

## Diagnostics and reliability

- Inspect source-aware outgoing turn requests, responses, events, and anomalies
  in a dedicated developer-mode diagnostic dialog with redacted input details.
- Filter turn diagnostics by event type and export copyable chat event traces.
- Filter persisted application logs by severity before pagination.
- Track renderer request counts and durations for diagnostic inspection.
- Correct usage-history baselines by selecting the latest snapshot before the
  requested range and resolving equal timestamps deterministically.
- Improve live event correlation, thread synchronization race handling, and
  timeline observability without losing updates to turn structure.
- Reduce unnecessary chat and project rerenders by isolating activity observers.
- Finalize stale project command runs when their Codex source disconnects.
- Preserve source ownership, historical identities, and compatibility with
  existing primary-directory workflows throughout workspace operations.

## Internal architecture and release tooling

- Add a typed, injectable Docker and Compose CLI client package.
- Separate workspace execution, permission preparation, storage, creation, and
  recovery into dedicated backend services with persistent operation journals.
- Consolidate workspace contributor documentation around ownership, execution
  guards, compatibility constraints, and recovery contracts.
- Check repository paths and relative imports for casing mismatches and
  case-only collisions in standard validation and CI.
- Automate prereleases from version bumps on main and dev, prevent duplicate
  version releases, and enrich prerelease metadata and platform build reporting.

## Migrations

SQLite migrations 28 through 38 are applied automatically when the application
starts:

- Migrations 28 and 29 add primary workspaces, stable associations, historical
  path aliases, and durable execution reservations.
- Migration 30 records immutable per-turn workspace context.
- Migration 31 scopes generated rule-file synchronization state by physical
  file path.
- Migrations 32 through 34 add conversation transition journals and extend
  execution guards to maintenance and thread catalogue operations.
- Migration 35 adds recoverable worktree creation records.
- Migration 36 adds persistent workspace names.
- Migration 37 preserves the storage root of interrupted worktree creations.
- Migration 38 adds the persistent project goal catalogue and execution data.

Existing project, source, thread, chat, and usage data is preserved. Historical
project IDs remain valid; older turns do not receive inferred workspace
history. Storage location preferences are kept in `settings.json`.

## Notes

This release includes the changes delivered after `1.12.0`, including the
`1.13.0-alpha.0` through `1.13.0-alpha.12` development series.

Workspace creation requires a trusted Git repository. Switching requires a
supported source permission policy and verified inactivity; unsupported or
uncertain transitions are refused explicitly. Empty conversations are created
directly in their destination rather than resumed before their first turn.

Worktree removal, physical movement, public relocation, automatic preparation
hooks, and a dedicated worktree per sub-agent are not included. Workspaces do
not automatically copy untracked files or install dependencies. Distinct
Compose project names do not resolve fixed-port or explicitly named resource
collisions.
