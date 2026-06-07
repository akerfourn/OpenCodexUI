# OpenCodexUI 1.7.1

This patch release fixes Windows Codex CLI detection when multiple local Codex
installations are present.

## Fixes

- Prefer Volta-installed Codex commands over the older OpenAI app-local Codex
  binary during automatic source detection on Windows.
- Support Windows `.cmd` and `.bat` Codex shims when checking versions and
  launching the Codex app-server.
- Show detected Codex command candidates in source settings with their version,
  so a source can be explicitly pointed at the intended installation.

## Notes

No SQLite migration is included in this release.
