# OpenCodexUI 1.4.0

## OpenCodexUI 1.4.0

This release focuses on making OpenCodexUI safer to use across configured
sources, improving Git workflows, and adding optional desktop integration while
polishing long-running chat interactions.

### Highlights

- Added Codex availability checks per source:
  - detect the configured Codex command and version
  - show warnings for sources that cannot run Codex
  - keep affected projects readable from cache while disabling Codex actions
- Added Git version detection in the commit configuration page so missing Git
  installations are visible before using Git features
- Added local-branch merge support from the Git panel:
  - open a merge dialog from the branch header
  - search local branches
  - merge a selected branch into the current branch
  - refresh Git status after merge attempts, including conflict cases
- Added remote tag synchronization from the tag selector dialog
- Persisted the selected Git reference tag in project preferences so the
  commits-since-tag context survives restarts
- Added optional Discord Rich Presence integration for active OpenCodexUI work
- Added a scroll-to-bottom control for chat history when the user has scrolled
  away from the live stream

### Improvements

- The commit message generation dialog now shows the model and reasoning effort
  that will be used for the generation
- Codex client metadata now uses the application version instead of a fixed or
  unknown client version
- Plugin and project actions now respect unavailable Codex sources and degrade
  to read-only cache access when needed
- Chat and composer controls now avoid Codex actions when a project source is
  unavailable
- The chat scroll lock is easier to break manually while streaming, and the
  return-to-bottom action is more visible

### Internal

- Extended the OpenCodex protocol with Git merge, tag fetch, tool availability,
  and project preference requests
- Added source-level Codex command resolution and version detection in the
  backend
- Added SQLite project preference storage for Git-related project settings
- Added backend tests for Git merge and Codex client info behavior
- Added cache tests for project preference persistence

### Notes

This version bumps the application and workspace packages to `1.4.0`.

The local cache schema is upgraded to store optional project preferences. The
migration is additive and preserves existing project data.
