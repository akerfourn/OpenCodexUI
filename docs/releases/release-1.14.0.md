# OpenCodexUI 1.14.0

This feature release adds voice dictation, generic file attachments, emoji
composition tools, configurable log retention, and in-app update installation.
It also improves conversation recovery, project permissions, and responsiveness.

## Highlights

- Dictate messages with a downloadable local multilingual model.
- Attach files through the picker, clipboard, or drag and drop.
- Insert emojis with a picker, inline suggestions, and an editable catalogue.
- Keep message drafts until sending succeeds and create Codex threads lazily.
- Configure information and performance log storage independently.
- Download and install application updates from supported desktop builds.

## Chat composition and attachments

- Replace the image-only picker with a general file picker. Keep thumbnails
  for images and show file names and type indicators for other attachments.
- Paste files copied from a file manager and drop files into the current chat.
- Add an emoji picker and inline emoji suggestions, with a dedicated section
  for customizing the emoji catalogue.
- Create new chats locally and defer Codex thread creation until submission.
- Keep the draft and attachments while a send request is pending, disable
  editing, grey the text, and show progress on the send button.
- Clear the composer only after successful submission; preserve its content
  when sending fails.

## Voice dictation

- Add a dedicated settings section with local and experimental Codex backends.
  Dictation is disabled by default.
- Offer multilingual Whisper Tiny, Base, and Small models with explicit
  downloads and a single installed model at a time.
- Run local transcription in an isolated process, offline after model
  installation, without writing recorded audio to disk.
- Limit recordings to two minutes and append recognized text to the draft
  without submitting it automatically.
- Show a pulsing red microphone and circular recording progress, followed by
  an indeterminate transcription indicator. Keep status text in tooltips and
  retain an explicit cancellation action.
- Preserve the draft on failure and discard late results after cancellation
  or navigation away from the original composer.

## Application updates

- Add update checks, download progress, and install-and-restart controls for
  supported packaged builds.
- Replace raw update errors with a dismissible message, retry action, and
  copyable technical details in a dialog.
- Show installation progress before handing off to the installer.
- Install Debian packages and replace AppImages asynchronously so the main
  application process remains responsive during installation.
- Stage AppImage replacements before replacing the existing executable and
  keep the application open when installation or launching fails.
- Keep development builds isolated from packaged update installation and
  handle missing prerelease feeds without reporting a spurious failure.

## Log storage

- Configure information logs and performance slowdown warnings separately
  from a settings dialog next to the cleanup action.
- Choose disabled logging, a bounded session-only buffer, age-based retention,
  or unlimited persisted history.
- Identify session-only entries and keep them available alongside persisted
  history while the application is running.
- Preserve existing disk history when switching to disabled or session-only
  storage until the user cleans it up. Age-based retention removes expired
  entries in the affected category.

## Project context and conversation reliability

- Configure the project's general access scope: inherit the global Codex
  configuration, use global read access, or restrict access to the project
  and authorized context folders.
- Add explicit denied context paths alongside read-only and writable folders.
- Edit conversations in place using the thread revert API, including
  conversations with paginated turn history.
- Resume unloaded threads before workspace execution checks and allow new
  turns after confirmed terminal system errors.
- Deduplicate overlapping thread results to avoid repeated conversations.
- Isolate host-local command environments from Electron-specific variables.
- Reduce repeated parsing and rendering work for large Markdown messages.
- Prevent outside clicks from dismissing task dialogs and losing form input.

## Migrations

SQLite migration 39 adds an indexed application-log category and classifies
historical performance slowdown warnings. The migration preserves existing
log entries; configured retention policies may subsequently remove expired
entries.

## Notes

This release includes the changes delivered after `1.13.0`, including the
`1.14.0-alpha` development series.

The Codex dictation backend remains experimental and depends on the installed
Codex version and authentication. It may require API-key authentication and
is not guaranteed to work with a ChatGPT subscription. There is no automatic
fallback to a paid API; local transcription is available independently.

Unsent local chats and drafts are not persisted across application restarts.
Windows portable builds do not support in-app update installation. The new
installation feedback takes effect once a build containing it is installed.
