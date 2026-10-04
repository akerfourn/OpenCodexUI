# OpenCodexUI 1.15.0

This feature release adds integrated file editing and document previews, along
with local JavaScript and TypeScript debugging. It also improves message
rendering, command execution, Docker Compose selection, and browser permissions.

## Highlights

- Browse workspace files and edit them with Monaco without leaving the chat app.
- Preview Markdown, images, and PDFs, and inspect Git changes in a diff viewer.
- Debug Node.js and Chrome applications without installing VS Code.
- Customize syntax highlighting and message rendering.
- Select the intended Docker Compose file before running service operations.
- Control command concurrency per project or workspace and use PowerShell on
  native Windows sources.

## Workspace files

- Add a Files tool with a workspace explorer and central document tabs. Load
  folders on expansion, include hidden and untracked files, and show Git status.
- Keep file navigation independent of the selected sidebar tool. Switching
  between files and conversations preserves drafts, running turns, unsaved
  edits, editor selection, scroll position, and undo history.
- Add Monaco editing with syntax highlighting, search and replacement, line
  navigation, light and dark themes, and explicit Ctrl/Cmd+S saving.
- Bind each document to its original source, project, workspace, and path.
  Files with the same relative path in different worktrees remain independent.
- Access files through their owning source, including supported WSL and SSH
  sources, without interpreting remote paths as host-local paths.
- Check disk revisions before saving, preserve UTF-8 BOM and LF/CRLF endings,
  and retain edits when a save fails. Reload clean documents after external
  changes and report conflicts without replacing local modifications.
- Offer save, discard, or cancel when closing modified documents, projects, or
  the application, including when restarting for an update.
- Add copy, paste, rename, and delete actions to the explorer context menu.
  Resolve affected unsaved documents before renaming or deleting. Deletion
  requires confirmation and permanently removes entries rather than using Trash.
- Follow internal symbolic links and show blocked, broken, or cyclic links.
  Manage external-link access from the context menu with workspace-specific
  blocked, read-only, and read/write permissions.
- Configure file links to open in the integrated viewer or the source's external
  application. Choose separately whether folder links use the source's folder
  command or the system file manager when the path is locally accessible.

## Document previews and syntax highlighting

- Open Git changes in an integrated diff viewer and navigate to their sources.
- Add Markdown Source and Preview modes, including previews of unsaved edits,
  tables, task lists, highlighted code, and heading links. Display YAML
  frontmatter separately from the document body.
- Display supported images in a read-only viewer with fit-to-window, actual
  size, zoom controls, and a transparency checkerboard.
- Add a read-only PDF viewer with continuous reading, an optional single-page
  mode, page navigation, zoom, and selectable text where available. Render
  visible pages progressively to limit the cost of long documents.
- Add a searchable, paginated Syntax highlighting section in Home. Enable or
  disable languages from the bundled catalogue, including TOML, Justfiles, and
  Dockerfiles, and override language detection for individual open documents.
- Bundle Monaco, syntax grammars, and PDF resources with the application. Load
  them on demand without requiring a CDN or an opening-time download.

## Debugging

- Add a Debug tool for local Node.js launch and attach, and external Chrome
  launch and attach. Use source maps to debug compiled TypeScript.
- Bundle the standalone `vscode-js-debug` adapter and its runtime integration;
  no VS Code installation is required.
- Persist configurations and breakpoints with their source/project/workspace
  context in SQLite, alongside watch expressions. Resolve relative paths from
  the configuration's captured workspace.
- Set breakpoints in the editor gutter, add conditions, enable or disable them,
  and distinguish verified, unresolved, and disabled markers.
- Pause, continue, step over, step into, and step out. Inspect stack frames,
  expand variables progressively, and evaluate watches and console expressions
  in the selected frame.
- Navigate to the current source and execution line in Monaco. Show generated
  or differing executed sources as separate read-only documents without
  replacing unsaved editor content.
- Keep sessions running when switching chats, documents, or tools. Show active
  session indicators and prevent closing a project that is still debugging.
  Stop programs launched by the debugger; detach from existing targets without
  terminating them.
- Detect and partially import supported `.vscode/launch.json` configurations.
  Preview imported values and unsupported options before saving a profile,
  without modifying the original file or running tasks.
- Add contextual help and advanced settings for environment variables, runtime
  arguments, entry pauses, source maps, and stepping. Validate supported JSON
  options rather than passing arbitrary configuration through to the adapter.
- Group configuration actions in an overflow menu, make inspection sections
  collapsible, and give the console more room. Open the same console in a
  separate window with shared output, frame selection, and expression input.
  Closing or docking that window does not stop the session.

## Chat rendering and approval feedback

- Add global Markdown and equation-rendering defaults for user and assistant
  messages, with persistent overrides in each message's settings menu.
- Disable equation rendering for user messages by default while keeping it
  enabled for assistant messages. This avoids interpreting pasted shell output
  as equations unless the user explicitly enables that rendering.
- Keep rendering preferences separate from the original text sent to the model,
  copied from messages, or stored in conversation history.
- Render recognized Codex file citations as navigable links and follow-up
  suggestions as buttons that insert text into the composer without sending it.
- Improve Markdown heading hierarchy in messages and document previews, and
  prevent the running reasoning timeline from overlapping its content.
- Show automatic approval-review notifications in the reasoning timeline with
  concise status and accessible completion details. These reports reflect
  Codex decisions and do not create a manual approval request.

## Commands and Docker Compose

- Choose one execution per project, one per workspace, or multiple executions
  for each project command. Apply the selected scope in both backend checks and
  the interface.
- Run project commands on native Windows sources with PowerShell 7 when
  available, falling back to Windows PowerShell. Preserve quoting and native
  command exit status. Linux, macOS, and WSL sources continue to use `sh -lc`.
- Detect named Compose variants such as `docker-compose.local.yaml` and
  `compose.dev.yml`, alongside the standard `.yaml` and `.yml` filenames.
- Require an explicit choice when several Compose files are present, retain
  that choice per workspace while the application is open, and pass it to
  service operations instead of relying on Docker's automatic file discovery.
- Keep the Compose tool visible while a file selection is required and show
  the selected file alongside the service context.

## Browser permissions

- Add source-level and chat-level browser permission management for sources
  with supported local access.
- Inspect, allow, block, or reset site, download, upload, and CDP permissions.
  Show inherited source rules in the chat view and preserve deny precedence.
- Respect the source's Codex configuration directory, preserve unrelated
  configuration fields, back up the previous file, and detect stale edits.
- Offer an explicit Codex connection reload after saving permissions, while
  preventing a reload during active turns.

## Migrations

SQLite migration 40 adds command execution modes. Existing commands keep their
previous behavior: exclusive commands use project scope, and commands allowing
parallel execution retain that mode.

Migration 41 adds debug configuration, breakpoint, watch, and import records.
Legacy debug preferences from `settings.json` are imported once; the old section
is removed only after successful import and loading.

Migration 42 adds per-message rendering preferences. Global display defaults
remain in `settings.json`.

## Notes

This release includes the changes delivered after `1.14.0`, including the
`1.15.0-alpha` development series.

Open documents and unsaved edits remain in memory and are not restored after an
application restart. Text editing supports UTF-8; unsupported encodings, mixed
line endings, oversized files, and unsupported binary content produce explicit
limits rather than unsafe edits. Remote file access requires the source's
process API and Node.js. PDF editing, OCR, printing, and password-protected PDF
opening are not supported by the integrated viewer.

Debugging currently supports one local target at a time. General subprocess,
worker, WSL, Docker, and remote debugging are not included. Node.js or Chrome
must be installed for the corresponding target, and TypeScript requires source
maps. The console is not an interactive terminal, and VS Code configuration
import supports only a documented subset of options.

Existing Windows project commands using CMD-specific syntax, such as `%VAR%`
or `set`, must be adapted to PowerShell or explicitly invoke `cmd.exe`.
PowerShell execution policies remain in effect. This change applies to project
commands, not to the shell independently selected by Codex.

Browser permission editing depends on the installed Browser plugin's internal
configuration format and remains version-dependent. It does not override Codex
policies. Sources without supported local filesystem access are not included.
