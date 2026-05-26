# OpenCodexUI 1.2.0

## OpenCodexUI 1.2.0

This release focuses on conversation stability, per-thread composer settings,
and safer commit message generation workflows.

### Highlights

- Fixed opening and syncing newly created threads before their first user
  message is materialized by Codex
- Prevented empty cached thread snapshots from being treated as failed loads
- Kept model and reasoning-effort selections local to the active conversation
- Stopped background thread synchronization from overwriting composer settings
  when no new turns were found
- Avoided unnecessary thread metadata updates when synchronized turn content did
  not change
- Improved commit message generation so the options dialog closes immediately
  and generation continues in the Git panel
- Prevented duplicate commit message generation requests while one is already
  running
- Locked the commit message field while a generated message is in flight
- Added regression coverage for unmaterialized thread handling and chat-local
  model settings

### Notes

This version bumps the application and workspace packages to `1.2.0`.

The local cache schema is unchanged from `1.1.0`.
