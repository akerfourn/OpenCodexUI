# OpenCodexUI 1.11.0

This feature release improves project organization, source setup, desktop
notifications, diagnostics, usage statistics, and chat activity rendering.

## Highlights

- Added persistent, color-coded project groups to organize the home screen.
- Added guided source creation for local, custom, WSL, and SSH environments.
- Added native desktop notifications for completed responses and approval
  requests.
- Added cached token usage statistics across a project's active and archived
  chats.
- Added a bounded, metadata-only event log for diagnosing individual chats.

## Project organization and local workflows

- Create, rename, color, collapse, and delete project groups from the home
  screen.
- Assign projects to a group or return them to the root project list.
- Preserve group membership, display order, colors, and collapsed state across
  application restarts.
- Keep existing projects visible when initializing the new project tree, with
  recently active projects shown first.
- Consolidate project actions into an overflow menu for a more compact project
  list.
- Open a local project's folder or launch a terminal directly from its project
  actions.

## Sources and remote environments

- Configure a source before it is persisted, preventing incomplete source
  entries from being added.
- Create local, custom-command, WSL, and SSH sources from a shared guided
  dialog.
- Validate required commands, SSH hosts, and SSH port ranges before creating a
  source.
- Select detected Codex commands and inspect resolved symbolic-link targets.
- Configure folder and file opener commands for sources with local filesystem
  access, including a Visual Studio Code preset.

## Notifications and project statistics

- Enable or disable completion and approval notifications independently in the
  application settings.
- Open and focus the relevant chat by clicking its desktop notification.
- Deduplicate completion notifications and close approval notifications after
  the request is resolved.
- Keep notification handling local without recording message content.
- Display total, input, cached input, output, and reasoning token usage for a
  project.
- Report statistics coverage and exclude chats whose usage data is unavailable
  instead of treating them as zero.

## Threads, chat, and activity rendering

- Inspect a bounded in-memory trace of received and UI-emitted events for an
  individual chat.
- Keep the diagnostic trace metadata-only, coalesce adjacent high-frequency
  events, and display the newest entries first.
- Render file-change activities as readable unified diffs, with distinct
  metadata, hunk, added, and removed lines.
- Allow switching from the visual diff viewer to the original raw activity
  data.
- Surface completed-turn errors directly in the chat instead of leaving a
  failed response without an explanation.
- Allow failed and interrupted terminal turns to be edited and retried.
- Preserve the latest activity metadata while incremental updates are applied.
- Add translated tooltips to activity icons and improve Markdown table styling.
- Keep the scroll-to-bottom control aligned with the chat content and constrain
  sub-agent dialogs to a bounded, scrollable layout.

## Reliability and compatibility

- Repair cleanup of empty, unsynchronized thread shells.
- Preserve thread source associations so cached and orphaned projects remain
  correctly scoped.
- Improve compatibility diagnostics for evolving Codex usage-limit payloads
  while avoiding duplicate warning logs.
- Extend cache, source, notification, project-tree, event-log, and activity
  rendering regression coverage.
- Update the release workflow to current major versions of the GitHub checkout,
  Node setup, and artifact actions.

## Migrations

SQLite migrations 21 and 22 are applied automatically when the application
starts:

- Migration 21 creates the persistent project-group and mixed project-tree
  structures, then adds existing projects without changing their source
  associations.
- Migration 22 preserves group colors for databases created before color
  persistence was finalized.

Existing project, source, thread, and chat data is preserved.

## Notes

This version is intended as a feature update from `1.10.0` to `1.11.0`.
