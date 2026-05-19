# OpenCodexUI 1.1.0

## OpenCodexUI 1.1.0

This release improves the conversation timeline, runtime diagnostics, and
developer ergonomics while keeping the desktop app compatible with the existing
local cache.

### Highlights

- Added a compact context-window usage indicator in the conversation header
- Persisted context usage in the local SQLite cache when Codex reports it
- Added detailed tooltip information for current context usage and thread total
- Improved reasoning/activity grouping when late activities arrive after the
  final assistant message
- Rendered turn diffs as compact file-change activities instead of dumping
  full diffs into the conversation flow
- Added a details modal for file-change diffs
- Prevented file-change status updates from being concatenated as text
- Sanitized terminal control sequences from project command logs and persisted
  log files

### Notes

Context usage depends on Codex CLI emitting `thread/tokenUsage/updated`
notifications. Threads without a reported usage snapshot simply hide the
indicator until data becomes available.
