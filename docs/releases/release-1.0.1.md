# OpenCodexUI 1.0.1 - First Desktop Release

## OpenCodexUI 1.0.1

First public release of OpenCodexUI.

OpenCodexUI is a local Electron desktop app for driving Codex CLI through `codex app-server`, with a dedicated interface for projects, conversations, local tasks, Git workflows, plugins, and commit message generation.

### Highlights

- Local Electron app built on top of Codex CLI
- React/MobX interface with light, dark, and system themes
- Project and local source management
- Codex conversation list with local SQLite caching
- Conversation creation, opening, renaming, and last-message editing
- Streaming assistant responses
- Collapsible reasoning and activity blocks
- Support for steering while Codex is reasoning
- Markdown rendering with copy buttons on code blocks
- File references with `@`
- Skill references with `$`
- Image display support in messages
- Git panel with changed files, staging, commits, pull, and push
- Assisted commit message generation
- Project tasks/commands panel
- Logs page with details and cleanup actions
- Experimental plugins page
- Compact quota usage indicators

### Notes

This release is the first functional desktop baseline for OpenCodexUI.  
It requires a working local Codex CLI installation and does not replace Codex authentication.

Version `1.0.0` was not published; `1.0.1` is the first distributed release.
