# OpenCodexUI 1.16.0

This release expands workspace management from creation and chat switching to
movement, preparation, activity review and controlled removal. It also adds
guided Git synchronization, command groups and favorites, richer media previews,
source and conversation permission settings, and local CPU controls. Windows
command execution and Docker availability reporting receive substantial fixes.

## Highlights

- Manage workspaces across projects from Home, inspect activity and measure
  disk usage on demand.
- Move secondary workspaces and entire project directories, reconnect manually
  moved folders, and recover interrupted maintenance operations.
- Review and schedule workspace deletion, with explicit confirmation and
  controls for local files, active processes and pending operations.
- Manage Git remotes, review synchronization destinations, and resolve paused
  rebase or merge operations from the interface.
- Organize project commands into persistent groups and favorites.
- Preview audio and interactive local HTML, render Mermaid diagrams, and zoom,
  pan and navigate images within a chat message.
- Configure Codex permissions and source instances, including optional local
  CPU priority and usage limits.
- Keep application errors in one journal and show unavailable Docker tooling
  as an actionable module state.

## Requirements and upgrading

**Codex CLI 0.148.0 or newer is required.** The compatibility check now enforces
this minimum because paginated conversation editing depends on `thread/revert`.
Upgrade the Codex installation used by each source if it is older.

This version promotes the `1.16.0-alpha.0` through `1.16.0-alpha.23` development
series to stable. It includes the changes delivered after stable `1.15.2`.
Existing projects, source associations and conversation history are retained.

## Workspace lifecycle and maintenance

### Removing workspaces

- Delete secondary workspaces created by OpenCodexUI through a confirmation
  that identifies the workspace and requires typing its name. Removal deletes
  the checkout directory while preserving Git branches and conversation history.
- Inspect modified, untracked and ignored files before confirming deletion.
  Their presence can block removal even when the workspace has no conversations.
- Allow explicit consent to discard local files with a single forced Git
  worktree removal. This does not bypass Git locks, active work, repository
  identity checks or pending operations.
- Optionally schedule deletion for when the source is already running and idle.
  Pending deletion survives application restarts, prevents new work in that
  workspace and keeps open files read-only until cancelled or completed.
- Show waiting or blocked deletion through a compact warning icon and a details
  dialog with retry and cancellation controls. Cancellation remains available
  offline; the sidebar no longer keeps a large permanent warning banner.
- Recheck source activity, commands, debug sessions, Compose services, terminals
  and filesystem state before removal. Work elsewhere on the same source can
  require waiting even when the target workspace itself is idle.
- Retain durable operation records when a reply is lost or the result is
  uncertain. Recovery verifies source and Git state instead of blindly
  repeating deletion. A blocked file-loss decision requires a fresh review.

### Moving and reconnecting folders

- Add **Relocate workspace** for a directory already moved manually within its
  source. This updates the registered location without moving files itself.
  The previous directory must be absent and the new location must be verified.
- Add **Move workspace** for managed and explicitly imported secondary Git
  worktrees. Prefer configured source storage locations, show the resulting
  destination, and keep custom absolute paths behind an advanced option.
- Preserve checkout contents, branches, workspace identity and conversation
  associations during secondary movement. Imported workspaces retain their
  external ownership and do not become eligible for application-managed
  deletion.
- Add **Move project directory** for the permanent primary workspace, including
  non-Git projects. Choose the destination parent and final folder name; using
  workspace storage is an optional shortcut rather than the default.
- Move nested workspaces with the primary directory, retain external worktree
  locations, and verify and repair Git links before publishing the new paths.
  Movement uses a same-filesystem rename, without a copy-and-delete fallback.
- Keep pending moves visible and recoverable after interruption. Preserve
  historical execution paths while recording aliases and reloading affected
  conversation permissions before their next message.
- Keep the primary workspace permanent: it cannot be completed or removed
  through the secondary workspace lifecycle.

### Locks and preparation

- Lock and unlock registered secondary worktrees using Git's native lock state.
  Show the lock reason and require confirmation before unlocking. A Git lock
  protects movement, removal and pruning; it does not make files read-only or
  prevent conversations from continuing.
- Add explicit workspace preparation using a selected project command. Review
  the source, destination and complete script before starting it, then follow
  its output and stop controls in the existing command interface. Preparation
  uses the source user's command permissions, independently of a chat sandbox.
- Save preparation preferences independently of execution. Creating a workspace
  or changing its settings never runs a preparation script automatically.

## Workspace activity and cleanup

- Add a Home **Workspaces** inventory spanning projects, with search, source,
  work-progress and cleanup filters, pending operations and dated size
  estimates. Opening it reads cached data without opening project tabs or
  connecting sources.
- Add a project activity inventory showing workspace paths, conversation counts,
  last known Codex activity, pending maintenance and observed local changes.
- Mark secondary workspaces **In progress** or **Completed**, with a completion
  date. This annotation does not archive conversations, stop programs or lock
  files; returning to in progress remains an explicit action.
- Configure cleanup suggestions per project, with a default retention period
  of 30 days, an adjustable delay or disabled suggestions. Completion, later
  activity and detected changes postpone the recommendation.
- Suggest only sufficiently checked, completed, inactive, unlocked managed
  secondaries. Imported, primary, offline, busy and uncertain workspaces are
  excluded. Suggestions open the normal removal review; they are not automatic
  cleanup or bulk deletion.
- Perform bounded Git and file-metadata checks when refreshing workspace
  management. These checks can observe changes made by external tools without
  introducing continuous filesystem surveillance or reading file contents.
- Keep complete observation baselines across restarts. The first check does not
  invent an edit date, and partial or failed checks do not replace a valid
  baseline.
- Measure disk usage explicitly, including ignored files while excluding `.git`
  and avoiding symbolic-link targets. Display the measurement date and whether
  the estimate is partial. Opening the inventory does not trigger a disk scan.

## Git and project management

- Replace the single remote editor with a repository inventory. Add remotes,
  edit fetch URLs and confirm removal. Existing separate push URLs remain
  visible and are preserved when editing fetch addresses.
- Prefill `origin` when adding the first remote. Choose a favorite publication
  repository and optional branch-specific exceptions using native repository
  Git settings rather than a global application destination.
- Add an explicit remote-update check in the Git actions menu. Fetching updates
  remote references without merging changes into the current branch.
- Keep ordinary **Send** and **Receive** actions separate. Sending publishes
  committed work; receiving updates only when a fast-forward is possible.
  Divergent histories lead to the guided synchronization workflow.
- Add **Advanced synchronization** with a destination and branch review, fresh
  local/remote commit counts, rebase or merge selection, optional tracking setup
  and a saved project strategy preference.
- Show conflicts with file navigation and explicit resolution staging. Continue
  or abort paused integration from the interface, including after reopening the
  application. A completed integration requires a fresh review before pushing.
- Preserve untracked and ignored files, refuse tracked uncommitted changes and
  colliding paths, and avoid implicit stashing or force-pushing. Unsupported
  multi-endpoint and mirroring configurations remain explicit limitations.
- Adapt synchronization labels to the action actually available, including
  cases where there are no commits to send. Improve detached-HEAD handling,
  action availability and destination revalidation.
- Add a prominent synchronization button with an outgoing-commit indicator and
  progress integrated into the button border. Refine tag rows, publication
  controls and reference-selection behavior.
- Show a gray Git indicator on Home project rows for uncommitted changes and
  blue for outgoing commits. Exclude files deferred in OpenCodexUI from the
  uncommitted indicator while still counting staged changes.
- Bound and cache visible-row Git checks, show their observation time, and keep
  failed checks distinct in amber. These checks do not fetch remote changes.
- Offer Git initialization only after a successful status read establishes that
  a folder is not a repository. A command-launch failure leaves the state
  unknown.
- Keep commit message generation available for staged files during a slow
  read-only refresh. Real index changes still block generation, with an
  explanatory tooltip, and stale replies cannot undo a newer accepted status.
- Add repository cloning from Home alongside opening an existing folder or
  creating a blank project. Clone through the chosen source with its existing
  credentials and open the project only after Git succeeds.

## Files, audio and HTML

- Resolve images in Markdown file previews through their captured workspace
  and source, including local-access checks and external-link permissions.
- Add **Open folder** and **Copy link** to file-reference context menus across
  chats, Git, Markdown previews and dialogs. Opening a file's folder uses its
  containing directory; copying retains the reference and line/column suffix.
- Respect source filesystem boundaries for these actions. Opening a host file
  manager requires host-accessible paths; remote links remain copyable.
- Add read-only audio playback with native Chromium controls for playback,
  seeking and volume. Codec support depends on the Electron build, and external
  opening remains available without installing a transcoder.
- Add HTML **Preview** and **Source** modes sharing the current document buffer,
  including unsaved edits. Local pages can use scripts, audio playback and Web
  Audio, with relative assets resolved from their captured workspace.
- Serve preview resources through temporary local capabilities with bounded
  reads and audio byte ranges. The sandboxed page cannot use application IPC,
  Electron APIs, arbitrary host paths or external network resources.
- Improve explorer visibility of ignored files and folders, and distinguish
  directories containing modified or added descendants with Git badges and
  clearer status presentation.
- Improve external editor and folder launching on Windows, including batch
  shims, executable detection and argument handling. Missing launchers produce
  application feedback instead of an uncaught Electron process error.

## Images and Markdown in conversations

- Display source-aware Markdown images, generated image artifacts and typed
  tool image results inline, including results outside the conversation's
  workspace when the source's image-read rules permit them.
- Add a message-scoped image gallery with previous/next chevrons and arrow-key
  navigation. Images from another message are not mixed into that gallery.
- Add wheel and button zoom, drag-to-pan, fit and actual-size controls, and
  double-click detail zoom. Each newly selected image starts fitted.
- Keep tool image results accessible when reasoning history is collapsed.
- Show unavailable images as red source links with an explanatory icon and
  tooltip. Missing temporary artifacts and ordinary image-load failures do not
  create journal entries or snackbars every time a chat is reopened. Restored
  files can still be retried; source and permission failures remain reportable.
- Support sanitized embedded HTML in Markdown file previews, including useful
  document formatting while filtering scripts and unsafe attributes.
- Render fenced Mermaid diagrams in completed chat responses and Markdown file
  previews. Switch between source and diagram, copy the original source, and
  retain source fallback when a diagram cannot be rendered.
- Bundle Mermaid locally, load it on demand and follow the light/dark theme.
  Render diagrams as inert images with strict configuration and bounded caches,
  rather than enabling document-provided callbacks or requiring a CDN.

## Conversations and permissions

- Preserve per-chat model selection through draft creation, the first send and
  later refreshes. Source defaults or delayed synchronization no longer silently
  replace a choice already made for the conversation.
- Show the running turn's requested model and reasoning settings separately
  from the selector for the next message. Changing that selector does not
  reconfigure a turn already running.
- Restore running-turn state from synchronized snapshots, including ongoing
  goal turns, instead of incorrectly treating the conversation as idle.
- Add **Repair conversation** to the chat menu for unresolved workspace
  executions. A stale local busy indicator does not hide it. Reconciliation
  requires source evidence and does not resend messages or interrupt live work.
- Record confirmed workspace switches in the conversation timeline with their
  names and paths at the time. Later workspace moves and renames do not rewrite
  those events or historical turn locations.
- Add native Codex permission editing for idle existing conversations. Read the
  effective settings, apply the requested changes and reread them before
  confirming success, while preserving history and access-profile constraints.
- Add default permission settings per source for filesystem access, workspace
  network access, approval requirements and approval review. These defaults
  concern new chats; existing conversation settings remain independent.
- Consolidate source connection settings, default Codex permissions and
  supported Browser plugin permission editing in the source configuration
  dialog. Preserve source-native configuration boundaries and detect stale
  edits.

## Source instances and resource controls

- Show each source's owned Codex instance as stopped, starting, running,
  stopping or failed, with an activity indicator for turns, approvals, requests
  and spawned processes. Passive metadata reads do not falsely mark it busy.
- Display cached source diagnostics before waiting for live version and
  capability checks, keeping the source list usable during slow refreshes.
- Add Start, Stop and Restart controls per source. Busy or starting instances
  require explicit interruption consent with observed activity details;
  restarting waits for confirmed exit.
- Keep explicitly stopped instances suspended for the application session, so
  background reads do not immediately launch them again. Other sources and
  independently managed Codex processes are not stopped by these controls.
- Extend supported standalone Codex updates to native WSL installations and
  compatible direct `wsl.exe` source commands, preserving the distribution and
  explicit user. Updates require an idle source and restore its previous
  running state after the update attempt.
- Add persistent CPU settings for native local sources: normal, low or very
  low priority, and an optional aggregate CPU cap where supported. Saved
  settings apply on the next launch; saving does not interrupt ongoing work.
- Use inherited niceness and verified systemd user scopes on supported Linux
  hosts, Windows Job Objects for priority and CPU caps, and inherited niceness
  on macOS. Disable unsupported controls with an explanation.
- Apply resource policies to the app-server process tree, with separate budgets
  per source. The Electron interface, independently managed Docker containers
  and unrelated programs are outside these budgets.
- Preserve the default launch path with normal priority and no CPU cap. Fix
  Windows launch environment, working-directory and stream preservation when
  a resource launcher is needed.
- Resolve verified native Windows executables to absolute paths for UI process
  requests, including Git and Docker, without changing their arguments or
  introducing a shell. Keep WSL, SSH and custom-source lookup in their own
  execution environments. This lookup also applies with default CPU settings.

## Commands and navigation

- Add persistent command favorites and collapsible groups. Create, rename and
  delete groups directly in the Commands panel, including empty groups, and
  select or change membership from the command editor and action menu.
- Keep commands when deleting their group. Display Favorites first, then
  initially collapsed groups, then ungrouped commands. Grouped favorites remain
  visible in both Favorites and their group; ungrouped favorites appear once.
- Make command cards denser, truncate long scripts with full-text tooltips,
  and reveal vertical side actions on hover or keyboard focus.
- Group the right-side tools with separators: Files, Git and Goals; Commands,
  Debug and contextual Compose; then Tasks, Context folders and Authorizations.
- Place tooltips to the left of the tool strip and make them non-interactive
  so they do not obstruct neighboring buttons.
- Correct project action-button alignment, keep open menus' buttons visible,
  and prevent hidden button backgrounds from covering long project names.

## Usage and reset credits

- Display multi-day countdowns as days and hours instead of large hour totals.
- Add advisory eligibility feedback for banked reset credits, with a dated
  explanation of covered quota windows and a localized help link. The warning
  does not block a reset request or claim to override Codex's eligibility check.

## Error feedback and Docker availability

- Centralize operational failures in the application error journal and a global
  snackbar with access to logs. Keep input validation, operation state and
  recovery actions near their controls without repeated technical error banners.
- Deduplicate errors already reported by the backend or an inner renderer
  handler, retain fallback content, and avoid recursively reporting a failure
  to write the error journal itself.
- Retain RPC methods, error codes, executable names, working directories and
  source/request identities when Codex rejects a process launch without error
  data. Added metadata excludes scripts, command arguments and environment
  values.
- Support structured, plain-data renderer diagnostic context so exported logs
  retain meaningful fields instead of an opaque or empty details section.
- Distinguish missing Docker commands, missing Compose plugins, unreachable
  engines and denied access from unexpected project failures. Show a compact
  module status and orange attention indicator with an explanation and recheck.
- Pause Compose polling after a failed check and resume it after a successful
  explicit refresh. Known optional-tool availability states do not repeatedly
  generate application errors or snackbars.
- Keep the Compose module accessible when its files are known, including after
  a failed recheck. Do not present a failed check as an empty service inventory.
- Keep unexpected Docker failures in the journal with their source, project,
  Compose file, failed stage and available exit codes. Healthy projects do not
  run the additional failure-diagnosis probes.
- Keep Home's host Docker context separate from source-owned project Compose
  operations. Unavailable Docker state never bypasses workspace maintenance
  checks, and the application does not start or install Docker automatically.

## Persistence and migrations

SQLite migrations 43 through 55 extend the existing cache with durable workspace
removal and movement records, permission reload markers, work progress, change
observations, command organization, confirmed workspace transition history and
deferred deletion consent.

Existing identities, conversation associations, history and pending operations
are retained. When upgrading from `1.15.2`, commands start ungrouped and without
favorites, and secondary workspaces start in progress. Upgrading from a
`1.16.0` preview retains existing command organization and secondary work
statuses. Previously completed primaries are restored to their permanent active
status. Old deletion requests do not acquire force authorization, and past
workspace switches are not reconstructed speculatively.

Source resource policies and project retention/preparation preferences extend
their existing settings documents without resetting unrelated preferences.

## Build and internal reliability

- Use Node.js 22 in release builds and skip the optional ONNX CUDA download for
  CPU-based dictation, fixing Linux dependency installation failures caused by
  unavailable GPU archives.
- Run native Windows process-launch validation before packaging, covering
  resource launchers, inherited environments, default settings and executable
  resolution.
- Separate project and Git request routing, native bridge services, turn
  execution metadata persistence and UI state responsibilities into smaller
  modules. Expand regression coverage for source isolation, interrupted
  operations, migrations and asynchronous response ordering.

## Notes and limitations

Automatic isolated workspaces for native Codex sub-agents are not implemented.
Shared-workspace delegation remains the current integration behavior.

Workspace cleanup suggestions are advisory. Scheduled deletion is a separately
confirmed permanent removal request, not a trash or undo system. Imported
workspaces keep their external ownership even after movement.

Moving a project does not rewrite absolute paths in user scripts, context-folder
settings or external tools. Cross-filesystem moves require moving the directory
outside OpenCodexUI and then using relocation. Remote filesystem helpers require
Node.js in the source environment.

CPU caps are available only on supported native local Linux and Windows sources;
macOS currently supports priority only. There is no shared global CPU budget,
memory limit or automatic resource policy for WSL, SSH or custom source
commands.

HTML previews are local document previews, not a replacement for a web server.
Audio decoding depends on bundled Chromium support. Temporary chat images are
not made durable by this release; missing artifacts are presented as
unavailable.

Browser permission editing remains dependent on the supported Browser plugin
configuration format and does not override Codex or administrator policies.
