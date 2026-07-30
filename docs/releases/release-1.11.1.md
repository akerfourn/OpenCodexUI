# OpenCodexUI 1.11.1

This hotfix release restores remote project opening on Windows.

## Fixes

- Fixed WSL and SSH project paths being validated against the Windows host
  filesystem.
- Remote project paths are now validated, and created when requested, through
  their source filesystem.

## Notes

This version is intended as a patch update from `1.11.0` to `1.11.1`.

No SQLite schema migration is introduced by this release.
