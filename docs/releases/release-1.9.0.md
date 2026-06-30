# OpenCodexUI 1.9.0

This release improves project workspace ergonomics, adds a dedicated usage
overview, expands Git remote management, and hardens active-turn recovery.

## Highlights

- Added a collapsible project tools panel:
  - collapse the right project panel into a compact icon rail
  - keep project tools available on narrower screens
  - preserve the current project workspace layout while freeing chat space
- Added a dedicated Usage section in Home:
  - display the selected Codex limit first
  - show additional usage limits reported by Codex separately
  - refresh usage periodically and from the UI
  - show clearer reset timing with relative and exact reset labels
- Improved Git workflows:
  - moved secondary Git actions behind a compact overflow menu
  - added remote configuration and management from the Git panel
  - expose configured remotes in Git state
  - refresh Git state when an active Codex turn completes
- Improved project context folders:
  - added a dialog for adding context folders
  - support both local folder selection and manual path entry
  - sanitize project preferences before persistence to avoid MobX/IPC payload
    issues

## Chat

- Recovered active turn state from Codex runtime status so the UI does not
  prematurely lose the working/loading state.
- Improved active-turn restoration after thread snapshots and synchronization.
- Kept rollback/edit availability aligned with the recovered active turn state.

## Settings and Debugging

- Added a developer mode setting.
- Allowed opening Chromium DevTools from the app when developer mode is enabled.
- Kept production defaults quiet while still allowing explicit debug access.

## Reliability

- Ignored expected app-server close events during intentional shutdown so closing
  the app is less likely to surface noisy shutdown errors.
- Avoided sending IPC events to destroyed Electron windows.
- Improved popup placement for compact chat setting menus.
- Tuned project side-panel tab sizing and spacing.

## Internal

- Extended the protocol with usage snapshots, Git remote requests, and
  active-turn recovery data.
- Added project preference DTO sanitization before persistence.
- Added tests for:
  - active-turn recovery
  - usage mapping
  - Git remote parsing and management
  - project preference serialization
  - Codex app-server shutdown handling

## Notes

This version bumps the application and workspace packages from `1.8.0` to
`1.9.0`.

No SQLite schema migration is introduced by this release.
