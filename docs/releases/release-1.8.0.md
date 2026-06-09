# OpenCodexUI 1.8.0

This release adds local project task management, improves project command
workflows, hardens approval handling, and stabilizes chat turn rendering around
steering and final-answer ordering.

## Highlights

- Added a local project tasks panel:
  - create project-local tasks from the right side panel
  - store task title, description, and status in SQLite
  - edit task details in a modal with markdown-style description editing
  - update task status directly from the task detail modal
  - copy task descriptions from the task dialog
- Improved project command management:
  - persist a stable custom command order
  - reorder commands from the UI with compact up/down controls
  - keep command ordering across app restarts
- Improved Codex source detection:
  - detect multiple Codex command candidates for local sources
  - expose detected candidates and versions in source settings
  - better support Windows command shims and Volta-managed Codex installs

## Chat

- Preserved steering-message metadata in the turn cache so steered user messages
  keep their dashed visual style after reloading a chat.
- Inferred older cached steering messages when multiple user messages appear in
  the same Codex turn.
- Kept multiple final answers inside the same turn when a late steering message
  happens during final-answer streaming.
- Kept post-final activities, especially file diffs, associated with the same
  sub-turn so the final answer remains visually last.
- Improved turn structure tests around steering, final answers, and post-final
  activity ordering.

## Approvals

- Fixed permission approvals so `acceptForSession` is sent with the Codex
  permission response shape and a `session` scope.
- Fixed structured approval decisions crossing the Electron transport by cloning
  them into plain JSON before IPC.
- Added regression tests for structured approval decisions and permission
  approval responses.

## Usage and Sources

- Ignored usage updates for unknown rate-limit identifiers so unrelated limits,
  such as non-Codex model pools, do not pollute the Codex usage bars.
- Added Codex command candidates to local source data and settings display.

## Internal

- Added SQLite migration `14` for local project tasks.
- Added SQLite migration `15` for persistent project command ordering.
- Extended the protocol with project task requests and command reordering.
- Extended cache and UI stores for task persistence and command sort order.
- Added tests for task persistence, command ordering, approval mapping, and chat
  turn structuring.

## Notes

This version bumps the application and workspace packages to `1.8.0`.

SQLite schema migrations are included in this release. Existing cache data is
preserved, but older app versions may not understand the new project task and
command ordering fields.
