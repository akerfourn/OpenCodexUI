# OpenCodexUI 1.6.0

This release focuses on first-run setup, Codex CLI compatibility checks, workflow
polish around Git, command tasks, composer actions, project synchronization
feedback, and Discord Rich Presence reconnects.

## Highlights

- Added a Git branch publish action:
  - detects local branches without an upstream
  - shows a compact publish icon near the branch actions
  - runs `git push --set-upstream <remote> <branch>`
  - refreshes Git status, branches, and tags after publishing
- Added a manual Discord Rich Presence reconnect action in settings
- Preserved the known active-turn state across Discord reconnects, so reconnecting
  during active work keeps the `Burning tokens` presence instead of falling back
  to idle
- Added a first-run onboarding flow that checks the local Codex and Git
  installations before entering the app
- Added Codex CLI version detection per source, with source-level warnings when
  Codex is missing or outdated
- Added a guarded setting to allow using an outdated Codex CLI version when the
  user explicitly accepts the risk
- Moved image attachment into the composer advanced-actions menu
- Added icons to all composer advanced actions

## Improvements

- Moved chat synchronization feedback out of the message stream and into the
  project sidebar, above the token usage bars
- Removed the top chat synchronization progress bar and inline syncing row from
  the chat content
- Made composer action buttons more compact to match the model, reasoning, and
  speed controls
- Tightened composer vertical spacing around the action bar
- Reworked the project Commands panel header to use a compact filled add button
- Made command run rows denser by displaying status and elapsed time on one line
- Made successful onboarding checks quieter while keeping re-check actions
  available
- Added a README notice clarifying that OpenCodexUI is not affiliated with
  OpenAI or the official Codex project

## Internal

- Added a `discord.reconnect` protocol request handled by the Electron bridge
- Added source cache fields for the last detected Codex version and detection
  timestamp
- Added an idempotent SQLite migration for persisted source tool-detection
  metadata
- Added the `allowOutdatedCodex` setting and backend availability mapping for
  `ready`, `outdated`, and `unavailable` Codex states
- Added project-level computed synchronization state for loaded chats
- Added Git service support and tests for publishing a local branch upstream
- Kept Discord activity tracking independent from Discord RPC connection state

## Notes

This version bumps the application and workspace packages to `1.6.0`.

This release includes a SQLite migration for persisted source tool-detection
metadata.
