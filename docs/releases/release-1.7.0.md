# OpenCodexUI 1.7.0

This release focuses on first-run setup, Codex source compatibility, richer Git
workflows, project context folders, and thread cleanup.

## Highlights

- Added a first-run onboarding flow:
  - checks whether Codex CLI is available
  - checks whether Git is available
  - links to the user-friendly Codex CLI quickstart
  - supports a forced onboarding mode for development testing
- Added Codex CLI compatibility checks:
  - stores the last detected Codex version per source
  - requires Codex `0.137.0` by default
  - allows users to explicitly opt into using an outdated Codex version
  - disables Codex actions for unavailable sources while keeping cached data readable
- Added project context folders:
  - configure extra folders Codex may read from a project
  - sync managed filesystem permissions into the project `.codex/config.toml`
  - show context folders in a dedicated project side-panel tab
  - rename, enable/disable, and remove context folders from the UI
- Added archived chat management:
  - archive and unarchive threads through Codex app-server
  - hide archived chats from the active thread list
  - show the archived-chat view only when archived chats are available
- Added a paginated Git history browser:
  - open Git history from the Git panel
  - lazy-load commit pages
  - expand commits to load their message and changed files on demand
  - avoid loading full diffs by default

## Git

- Surface pending Git commit messages, such as revert or merge messages, in the
  commit message field
- Added branch and tag workflow refinements from previous Git panel work:
  - improved branch status handling
  - refreshed tags after relevant Git operations
  - kept reference tag preferences in project preferences
- Added tests for Git history parsing, commit details, pending commit messages,
  and context-sensitive Git behavior

## Chat and UI

- Centralized composer draft state in the chat store so drafts survive switching
  between chats
- Improved archived-thread controls in the thread list
- Added UI support for context folder names and full paths
- Kept thread list updates aligned with active vs archived views

## Internal

- Regenerated Codex app-server protocol types for newer Codex CLI capabilities,
  including remote-control and permission-profile related schemas
- Added backend services for managed project context permissions
- Extended the protocol with Git log, commit detail, archived thread, context
  folder, and source version fields
- Added SQLite migrations for source version status, archived threads, project
  preferences, and context folder metadata
- Added cache and core tests around the new project, source, Git, and thread
  behaviors

## Notes

This version bumps the application and workspace packages to `1.7.0`.

SQLite schema migrations are included in this release. Existing cache data is
preserved, but older app versions may not understand every new field added by
this version.
