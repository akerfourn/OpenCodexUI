# OpenCodexUI 1.15.2

This patch release fixes project commands failing to start in the native
Windows sandbox.

## Fixes

- Use the default output capture limit when detecting PowerShell, avoiding the
  `custom outputBytesCap is not supported with windows sandbox` rejection.
- Add regression coverage for shell detection in the Windows sandbox.

## Notes

This version is intended as a patch update from `1.15.1` to `1.15.2`.

No SQLite schema migration is introduced by this release.
