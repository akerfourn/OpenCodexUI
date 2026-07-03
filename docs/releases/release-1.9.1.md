# OpenCodexUI 1.9.1

This patch release improves project command execution and makes Git tag
synchronization more tolerant of remote fetch issues.

## Fixes

- Fixed project commands so they are launched through the platform shell:
  - POSIX projects now run commands through `sh -lc`
  - Windows projects now run commands through `cmd.exe /d /s /c`
  - shell features such as npm scripts, quoting, and chained commands behave
    closer to a regular terminal
- Improved Git tag refresh behavior:
  - try `git fetch --tags --prune-tags` first
  - fall back to `git fetch --tags` when prune-tag fetch fails
  - keep local tag listing usable even when the remote fetch emits a warning
- Routed Git tag fetch warnings through the global notification and log system
  instead of leaving them only inside the Git panel.

## Internal

- Added a protocol result shape for tag fetches with an optional warning.
- Added a backend log creation request so UI flows can persist warning logs.

## Notes

This version is intended as a patch update from `1.9.0` to `1.9.1`.

No SQLite schema migration is introduced by this release.
