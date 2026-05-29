# OpenCodexUI 1.2.1

## OpenCodexUI 1.2.1

This patch release focuses on project opening, chat composer stability, and Git
panel reliability.

### Fixes

- Persisted per-thread model and reasoning-effort composer settings to the
  thread cache
- Kept chat composer controls reactive by standardizing the MobX observer
  wrapper around the composer component
- Ensured folders opened as projects are associated with a usable Codex source
  instead of being cached as source-less active projects
- Fixed new chat and message submission failures caused by projects without a
  Codex source
- Made Git repository detection independent from localized Git error messages
- Added an `Initialize Git` action for project folders that are not Git
  repositories yet
- Added regression coverage for chat-local composer settings, non-Git project
  detection, and Git initialization

### Notes

This version bumps the application and workspace packages to `1.2.1`.

The local cache schema is unchanged from `1.2.0`.
