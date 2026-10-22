# Workspace architecture

This document describes the contracts contributors must preserve when changing
workspace execution, persistence or UI integration.

## Ownership and identity

A project owns a primary workspace and optional secondary Git worktrees. The
primary workspace also supports non-Git projects. Workspaces belong to one
source filesystem; a conversation can switch only within its project and
source. A workspace name is independent of its directory and identity.

New projects use UUIDs. Historical path-derived project IDs remain opaque,
valid identifiers. Never regenerate IDs from a renamed or relocated path.
Known thread associations take precedence over stale paths returned by Codex.
Historical path aliases do not automatically adopt newly indexed threads, and
projects sharing a Git repository are never merged implicitly.

The cache is authoritative for a known thread's execution context. The backend
resolves workspace, source and cwd before dispatch and rejects contradictory
caller hints. Orphan or unavailable workspaces remain readable but cannot run.
Legacy path-based requests remain supported; cacheless integrations do not
provide durable workspace guarantees.

`turn_workspace_contexts` stores immutable submission evidence: project,
workspace, source and cwd for each acknowledged turn. It is independent of
execution reservations and mutable thread snapshots. Do not infer missing
history from the current thread path, parent ancestry or copied turn IDs.
Rollback retains this evidence; explicit thread deletion removes its history.
A parent's workspace switch must not reassign existing child conversations.

## Code boundaries

| Package or module | Responsibility |
| --- | --- |
| `opencodex-protocol` | Workspace DTOs, requests and events |
| `opencodex-cache/src/sqlite/projects` | Identity, aliases and journals |
| `opencodex-core/src/backend/workspaces` | Validation and orchestration |
| Core: `GitWorktreeService` | Stateless Git operations |
| UI: `ProjectWorkspacesStore` | Catalogue and UI intents |
| `apps/electron-app/src/main/settingsStore.ts` | JSON settings persistence |

The backend receives explicit project/source/workspace identities. It must not
use the UI's active selection as business state. Source-native paths are never
resolved using Electron's host filesystem, except for explicitly local storage
initialization. Keep MobX values inside the UI and send plain protocol DTOs.

## Storage and creation

Storage locations live in `settings.json` as `workspaceRoots`, not in a SQLite
settings catalogue. Each has an ID, source ID, label, absolute source-native
path and default flag. Configured sources require exactly one default root.
Settings writes are serialized and published only after persistence succeeds.

On initial setup, `initializeDefaultWorkspaceRoot` creates
`<userData>/workspaces` for the default local source, or the first local source
if the default is remote. Existing local storage preferences are preserved.
`defaultWorkspaceRootInitialized` prevents recreating a deliberately removed
entry. Additional local sources and WSL, SSH or custom sources require explicit
configuration. Windows non-roaming storage has not been separately validated.

Automatic destinations use:

```text
<storage-root>/<project-id>/<workspace-id>/
```

The backend generates the workspace ID before journaling the operation. The UI
shows `<workspace-id>` only as a preview placeholder. Git creates that final
directory; OpenCodexUI creates only its project parent. An explicit custom
path bypasses automatic layout and requires an existing parent directory.
Changing storage preferences never moves existing or interrupted checkouts.

`WorkspaceCreationService` validates source ownership, project trust, repository
identity, path availability and branch availability before Git mutation. The
source checks directories and ancestors; automatic storage refuses symbolic
links. The destination must not exist or be inside the primary checkout.
Git hooks and filters follow the trusted repository's configuration. There is
no implicit stash, dependency installation or copying of untracked files.

Creation reserves both the destination and the source/repository pair. The
journal freezes workspace ID, name, destination, root and Git starting point.
Expected commit and branch are saved before dispatch. A successful Git reply
must be persisted before publishing the verified checkout in the catalogue.

| Failure boundary | Recovery contract |
| --- | --- |
| Before Git dispatch | Cancel; empty parent directories may remain |
| Unknown dispatch result | Keep the reservation; do not replay Git |
| Confirmed Git success | Verify checkout identity before cache publication |

A worktree appearing in Git's list does not prove creation completed. Recovery
uses the recorded destination, including older paths ending in `/worktree`,
without recalculating it from current settings. It never removes files or
branches as an automatic rollback.

## Importing external worktrees

`WorkspaceDiscoveryService` explicitly imports Git's existing worktrees after
source-side path and common-repository checks. It does not create, move, unlock
or delete Git checkouts. Import is not an implicit indexing operation.

Registration is transactional and rechecks the primary workspace. Existing
IDs, names, owners and managed flags are preserved. New external workspaces
have `managed: false`. Foreign-project paths, pending creation destinations,
removed entries and unavailable or unsupported paths are reported as skipped.
Missing Git entries do not delete cached history. Unexpected source errors
abort import rather than silently publishing an incomplete result.

## Conversation transitions and permissions

`WorkspaceSelectionService` coordinates switching through a local thread gate
and the separate `workspace_transitions` journal. Both source and destination
remain reserved until the transition is verified and committed atomically.
The visible conversation association changes only after successful validation.

The production sequence is:

1. Verify source ownership, inactivity and source-native paths.
2. Prepare and verify the destination's managed permission profile.
3. Persist the expected context before dispatching unsubscribe/resume.
4. Resume with explicit cwd, runtime roots, permissions and approval settings.
5. Verify the returned identity, inactivity, cwd and permission projection.
6. Commit the selection and continue sending explicit cwd on subsequent turns.

`WorkspaceRuntimePreparation` requires a complete loaded-thread inventory,
currently bounded to 100 entries. Active sessions and other loaded sub-agents
block switching. Directory and configuration symlinks are refused. The managed
profile extends `:workspace`, disables network and general temporary writes,
and preserves configured shared-folder and environment-file restrictions.
Arbitrary custom or unrestricted policies are rejected, not silently replaced.
Approval settings come from the source rather than guessed defaults.

Pre-dispatch failures release preparation. Lost replies, permission mismatches
and failed cache commits retain a blocker. Recovery uses the frozen contract;
changed policies cannot silently rewrite it. An idle reply alone does not prove
that a dispatched transition completed.

Codex 0.153.4 was characterized on Linux with a simulated provider and real
tool execution. The relevant compatibility constraints are:

- A cwd override alone can retain permissions for the old checkout.
- Resume on an already loaded thread can ignore requested reconfiguration.
- Unsubscribe does not guarantee unloading when another client is subscribed.
- Empty threads may have no resumable rollout. Create new conversations
  directly in their prepared destination, without an artificial model turn.
- Existing processes and children retain their own context. A parent switch
  is not a filesystem move or a collective migration of child sessions.

These observations explain the explicit overrides and reply verification;
they are not a guarantee for every Codex version, source or operating system.
The corresponding [upstream source revision][codex-reference] is
`3d2ee51ca2d5db578f328aa75e20aa22c0197c9a` (`rust-v0.153.4`).
Deterministic RPC doubles test application contracts, not sandbox enforcement.
When changing compatibility code, repeat isolated app-server experiments with
synthetic data and a simulated provider; verify actual allowed and forbidden
filesystem effects as well as returned metadata.

[codex-reference]: https://github.com/openai/codex/tree/3d2ee51ca2d5/codex-rs

## Other operations and UI integration

Turn starts, review, compaction, rollback and thread catalogue mutations use
durable reservations. Their completion evidence differs: unrelated turn
notifications must never release another operation's reservation.

Review requires a matching thread and turn; compaction acceptance is not
completion. Rollback requires its reply and cache synchronization. Archive and
restore recovery need positive source evidence. Thread deletion recovery may
repeat local cleanup only after a successful delete acknowledgement was saved;
an empty remote list does not prove deletion. Unknown remote results remain
blocked, without automatic mutation replay.

Workspace-aware tools include Git, Compose, commands, search, openings, rules
and context materialization. Project preferences and definitions remain shared;
physical execution and generated files follow the selected checkout. Secondary
Compose workspaces have distinct stable project names; primary naming remains
compatible. Ports and explicitly named resources can still collide.
Command runs retain their original source, cwd and process handle.

The UI groups conversations by named workspace. The primary name is fixed;
secondary renaming changes metadata only. Conversation switching is exposed
through the chat menu. Git drafts and responses are scoped to their checkout;
stale asynchronous results must not update the newly selected workspace.
Rule-file synchronization metadata is keyed by physical file path, and writing
a secondary configuration must not update the primary synchronization state.

## Removing managed workspaces

The workspace menu offers deletion only for secondary checkouts created by
OpenCodexUI. The confirmation names the checkout and requires typing its name.
Unsaved editor buffers block deletion. Clean buffers close after verified
success; branches, conversation associations and immutable turn history remain.
Removed conversations remain readable, with new messages disabled. Move a
conversation to another workspace before deletion if it needs to continue.

`WorkspaceRemovalService` freezes source, checkout, primary and common Git paths
in `workspace_removals` before inspecting or removing files. Migration 43 guards
executions, transitions, creation and identity changes against that journal.
The source request gate also excludes in-flight tool operations and process
startup. Managed commands, debugging, Compose containers and Codex terminal
inventories must be inactive. Idle target conversations are unsubscribed and
must disappear from the complete loaded-thread inventory; another client can
therefore block deletion. These checks do not identify every external OS process.

Source-side validation refuses symlink ancestors, changed repository identity,
locked/prunable checkouts, modified, untracked or ignored files, and detached
commits not retained by a local branch or tag. Git removes the checkout without
`--force`; its submodule protections remain enabled. No stash, branch deletion,
global prune, Compose shutdown or filesystem recursive-delete fallback occurs.
Compose usage is recorded in SQLite before stack access, so checks still apply
after a restart or after configuration files disappear. Compose checks cover
the workspace's stable application namespace; a Compose
workspace whose Docker state cannot be queried is not assumed inactive.

Failures before dispatch cancel preparation. Later failures retain the journal
and block execution. Explicit recovery never repeats removal: it verifies both
Git deregistration and directory absence in the frozen source before marking
the workspace removed. A positively failed Git command can be cancelled when
the registered checkout still exists. Ambiguous outcomes remain blocked.

## Relocating an existing workspace

Use **Relocate workspace** in a workspace's menu after moving its directory
manually within the same source. This works for the primary workspace, including
non-Git projects, and registered secondary worktrees, including imported ones.
The previous directory must be absent. The selected destination and its
ancestors must be literal directories. Source access failures are not treated
as proof of absence. The operation never moves files or repairs Git links.
For a linked checkout moved with filesystem tools, run `git worktree repair`
explicitly before retrying if Git still registers its old location.

Secondaries must be registered at their new root and share the primary's
Git common directory. The primary repository's identity cannot be proved once
its old directory disappears: the UI explains this limitation and requires
explicit confirmation that the selected directory is the same project.
Relocation cannot merge another cached project or adopt its occupied path.
Windows destination collisions are compared without case sensitivity.

The shared source gate excludes in-flight tools and process startup. Active
commands, debug sessions, Compose services and Codex conversations/terminals
block relocation. Idle affected conversations are unloaded and must disappear
from the source inventory. Unsaved editor buffers must be saved or closed.
These checks cover managed activity, not every external OS process.

The cache transaction preserves project/workspace IDs, current conversation
associations and immutable turn paths. It updates compatibility paths and
records the old path as a historical alias, never as automatic ownership.
A repeated request for the committed destination is safe after a lost reply.
The UI reloads durable results, refreshes conversation groups and project paths,
closes clean old-path buffers and carries the Git commit draft to the new path.
Dirty buffers created during the request remain intact.

Migration 44 records which existing conversations still need a policy reload.
Before their next message, the backend regenerates a path-bound managed
permission profile and verifies the resumed cwd, runtime roots, sandbox and
unchanged approval contract. A failure keeps that requirement for retry;
custom or unrestricted profiles are refused rather than replaced. New chats
in a relocated primary also receive a freshly prepared managed profile.
Old empty Codex threads that cannot be resumed remain subject to Codex's empty
rollout limitation; create a new conversation in the relocated workspace.
No historical turn cwd is rewritten. Project rules, custom scripts and explicit
shared-folder paths containing the old location are not rewritten automatically.

## Moving a managed workspace

Use **Move workspace** in the menu of a managed secondary workspace. The dialog
starts with configured storage locations from the owning source and selects
its default location when it differs from the current destination, otherwise
another available location. The backend resolves the final path as
`<storage-root>/<project-id>/<workspace-id>`; the UI shows that exact preview.
A custom absolute path is available only through an explicit advanced option.
When no alternative root is configured, the dialog explains how to add one
instead of opening a free path field by default.

Movement uses `git worktree move -- <old-path> <new-path>` through the owning
source. It preserves workspace IDs, names, branches and all checkout files,
including modified, untracked and ignored files. Primary and imported workspaces
are outside this initial movement scope; their existing relocation action
remains available. Git's lock, submodule and filesystem restrictions are
preserved. No force, unlock, stash, copy/delete or cross-source fallback occurs.
Cross-filesystem moves that Git refuses remain refused.

The destination must be absent and separate from registered checkouts and the
common Git directory. Its ancestors must be literal directories. A configured
root must exist; its project subdirectory may be created during preparation.
An empty project directory can remain after a cancelled preparation. Custom
paths require an existing parent. Managed commands, debug, Compose services,
Codex conversations and terminals must be inactive. Unsaved editor documents
block the action. These checks do not enumerate every external OS process.

Migration 45 adds `workspace_moves`. Before dispatch, the backend freezes source,
primary, original and destination paths, selected root, common Git directory,
worktree administrative directory, commit and branch. SQL guards reserve the
workspace and both paths, reject execution and conversation transitions, and
exclude conflicting creation, removal, discovery and path changes. Source
request exclusion also covers process startup and file tools. The optional
`movePending` flag disables new messages and old-path file tools while retaining
readable history. Legacy requests to either reserved directory are rejected.

Successful publication requires old-path absence, literal destination ancestors,
complete Git registration at the new path with no old entry, and the exact
frozen common directory, administrative identity, commit and branch. The same
cache transaction releases the journal, records the old alias, updates current
conversation paths and marks their permissions for verified reload before the
next message. Historical turn paths are never rewritten. UI refresh uses the
same document, conversation and Git-draft handling as manual relocation.

A dispatched failure retains a journal. **Recover** checks frozen source facts
without repeating Git movement or trying to move files back. A completed move
can be published after a lost response and restart. Positive failure can be
cancelled only when the original registered checkout is intact and the
destination is absent. Unknown or conflicting outcomes keep both paths reserved.
Changes to configured storage after dispatch cannot redirect recovery.

## Locking and unlocking worktrees

The workspace menu exposes **Lock workspace** and **Unlock workspace** for
registered secondary worktrees, whether managed or explicitly imported. The
principal and Git's main checkout are excluded. This is Git's native worktree
lock: it protects against movement, removal and pruning while leaving files
editable and conversations usable. It is not a separate application read-only
mode. Existing move/removal validation continues to consult Git before acting.

Git remains the only lock authority; no duplicate SQLite lock state is stored.
The menu and properties explicitly fetch the current state through the owning
source. An unknown/offline state is never treated as an unlocked checkout.
The menu shows a lock badge and the action matching that snapshot; properties
show its reason. External changes become visible on the next explicit read.
Catalogue loading itself does not require a live Git source.

Locking accepts an optional single-line reason up to 500 characters. Unlocking
always opens a confirmation showing the existing reason, including a lock
without a reason. The request includes the reviewed source, workspace path and
exact previous reason. The backend checks current ownership and re-reads Git
before changing anything; a different reason or relocated path requires another
review. A request for an already reviewed, unchanged state leaves any existing
reason intact. The source request gate excludes concurrent local lifecycle
operations, and pending creation/move/removal journals block metadata changes
in the same repository, including through another cached project.

The operation uses `git worktree lock`/`unlock` without force, prune, file moves
or branch changes. A registered but missing worktree can still be locked or
unlocked through its available primary, which supports protecting offline
volumes. Only the primary's source directories need to be present and literal.
No conversations are unloaded and no managed service is stopped.

After a lost response, the UI performs a fresh read without repeating the
mutation. The existing error remains visible so a newly observed external lock
cannot be cleared through an old confirmation. Checks are conservative within
the application; another external Git process can still race between inspection
and mutation, and lock reasons are not unique owner tokens.

## Explicit workspace preparation

The workspace menu exposes **Prepare workspace** for an available primary or
secondary checkout, including imported and Git-locked worktrees. Select an
existing project command or create one in the dialog, then save that selection
for the project. This stores a command reference in project preferences; no
schema migration or repository file is needed. Deleting the command leaves an
explicit missing-command warning until another command is selected or the hook
is disabled.

Saving or creating a workspace never executes the hook. Each manual launch
shows the source, fixed destination and full script. The backend checks project
ownership, current workspace availability, literal directory ancestors and the
primary project's `trusted` setting in that source's Codex configuration. A
changed source, path, selected hook or command definition requires another
review. The exact reviewed definition is passed to the existing command runner.
Preparation is a user-started shell command with the source user's permissions;
it does not run inside a conversation's agent sandbox. Command execution modes,
optional persistent logs and stop controls retain their existing behavior.

Dependencies, local files and submodules are prepared only by commands explicitly
written by the user. OpenCodexUI does not guess a package manager, copy `.env`
files or initialize submodules automatically. A hook can invoke a repository
script to sequence those steps; make that script stop on the first error.
POSIX paths use the source shell and Windows paths use source-side PowerShell
detection, as with other project commands. Remote preparation never inherits
the Electron host's environment.

Unsaved editor documents block launching. An already running or starting project
command in the target workspace blocks preparation. Once launched, preparation
appears in the existing command run list, with live output, exit status and stop
controls also available in the preparation dialog. Closing the dialog keeps the
process running. Movement, removal and relocation use the existing command
activity guards. A Git worktree lock does not prevent preparation or file edits.

Failures and connection loss never trigger an automatic retry. An unknown exit
is reported as failed with no exit code while the UI session remains open.
Live run state is not persisted across application restart; optional command
log files remain available on disk. Interrupted scripts may have modified files
or installed dependencies already: there is no rollback or completed/prepared
badge. External clients, file edits and normal source activities are not locked
out by a preparation run.

## Activity overview and manual cleanup

Open **Manage workspaces → Workspace activity and cleanup** from the project's
workspace controls. The inventory includes the primary, imported and managed
secondary workspaces, plus removed entries whose metadata is retained. It shows
their paths, current conversation counts and last known Codex activity. Opening
the inventory does not select a workspace, recover an interrupted operation or
delete files.

Activity is a read-only SQLite projection. Current conversation counts include
archived conversations and indexed sub-agents, independently of sidebar search
or pagination. Dates combine cached conversation updates in their current
workspace with started/completed timestamps of turns whose workspace is proven
by immutable execution evidence. When a conversation switches workspace, its
later turns do not refresh the old workspace's activity. Snapshot synchronization
timestamps are not used as activity dates. Empty or invalid dates remain unknown.

The candidate filter uses the project retention policy described below. It
suggests only completed, available, managed secondary workspaces with a valid
completion date, old known activity and a matching, explicitly refreshed
unlocked Git state.
Primary, imported, removed and pending-maintenance workspaces are excluded.
Cached active conversations, execution/transition reservations, unsaved documents
and known local project activity also exclude candidates. Local chat, command,
debug and Compose activity is conservatively applied across the whole project.
An offline source, unknown lock, unknown activity or future timestamp is never
treated as an inactivity candidate.

Refreshing reads catalogue and activity data first, then checks secondary locks
through their owning source, in batches of at most three. Late replies from a
different source/path or a disposed project are ignored. The cache remains
readable offline. Lock snapshots and activity are observations, not exclusive
source locks; refresh again when reviewing a long-open inventory.

**Inspect removal** opens the existing name-confirmation dialog, without starting
deletion. It is also available for recent, in-progress, retained or
unknown-activity managed secondaries whose native lock has been verified.
Actual deletion retains all existing checks for dirty/untracked/ignored files,
Git locks, processes, conversations and durable
reservations. No bulk deletion or automatic cleanup is introduced. The overview
does not measure disk usage, track external tools/file edits or establish that a
checkout is safe to delete. Git locks remain the
existing way to protect retained worktrees from removal.

## Manual work progress

Every workspace has a separate user-declared work status: **In progress** or
**Completed**. Existing and newly created workspaces start in progress. Marking
one completed records the end of its current work period in UTC. Repeating that
confirmation preserves the date, including after a lost response. Marking it in
progress clears the date; completing it again starts a new completed period.

Use the workspace menu, properties or activity inventory to change progress.
Completed workspaces retain their conversations and display a completion marker
in the sidebar. The inventory also shows the completion date and offers an
independent status filter, combinable with the existing cleanup-candidate filter.
Cleanup recommendations use the later of completion and last known Codex
activity, according to the project retention policy. No automatic deletion
is introduced.

This is an organizational annotation. It does not stop processes, archive
conversations, move files, change permissions or acquire a Git lock. Conversations
can continue in a completed workspace; returning to in progress is an explicit
user action. Cleanup still excludes busy, locked, pending, unavailable and
insufficiently verified workspaces regardless of this annotation.

The status is stored in the local cache, so it can be read and changed while the
source is offline or removed. Primary and imported workspaces support the same
annotation, while their existing restrictions on physical removal remain intact.
Removed workspaces retain their status/date for reading. Pending physical moves
or removals prevent updates until their outcomes are recovered.

Updates carry the explicit project, workspace, source, path and reviewed previous
status/date. The cache validates them transactionally; a changed location or
reopening another completed period requires a fresh read. No Codex request is
needed. The UI re-reads the catalogue after a failed response without replaying
the update and retains the error. Source synchronization, relocation and import
do not reset work progress.

## Project retention policy

In **Manage workspaces**, configure retention for the current project and save
it explicitly. The default is 30 whole days; values from 1 to 3650 are supported.
Suggestions can also be disabled. Draft edits do not affect recommendations
until saved. The setting is local metadata and can be changed offline.

Only completed workspaces can become cleanup candidates. The delay starts at
`max(completedAt, lastActivityAt)`, so completing an old checkout or continuing a
conversation after completion postpones its suggestion. The exact deadline is
included. Missing, invalid or future completion/activity dates remain excluded;
an empty checkout with no known activity is not assigned an invented date.
Existing lock, source, activity and maintenance guards still apply. Reopening
work immediately excludes it, without erasing its conversations.

Preferences persist as `workspaceRetention: { days: number | null }` in the
existing project-preferences JSON. An absent policy uses the default; `null`
days disables suggestions. Invalid writes are rejected by the backend, and a
malformed stored policy disables suggestions instead of enabling a default.
No schema migration, timer, automatic mutation or deletion is needed. Manual
removal remains available subject to the existing confirmation and safety checks,
including when suggestions are disabled or work is still in progress.

## Persistence and validation

Migrations 28–31 establish identity, aliases, reservations, immutable history
and rule-file scoping. Migrations 32–34 add transition and maintenance/catalogue
guards; 35–37 add creation journaling, names and frozen storage roots.
Migration 43 journals removal; migration 44 retains relocation policy reloads.
Migration 45 reserves physical moves and destination ownership. Migration 46
adds work progress and its consistent nullable completion date, preserving
existing identities, paths and history. Preserve
existing data through idempotent migrations instead of rewriting associations.

Run from the repository root:

```sh
npm run typecheck
npm test
```

`npm test` rebuilds SQLite for Node; `npm run dev` rebuilds it for Electron.
Focused regression suites include `WorkspaceExecutionService`,
`WorkspaceSelectionService`, `WorkspaceRuntimePreparation`,
`WorkspaceThreadTransition`, `WorkspaceCatalogRecovery`,
`WorkspaceCreationService`, `WorkspaceDiscoveryService`, `WorkspaceStoragePaths`
and `DefaultWorkspaceRoot` under `packages/opencodex-core/test`.
`GitWorktrees.test.ts` exercises disposable real repositories and recovery
across SQLite reopening. Cache migration and UI store tests cover preservation,
source isolation and stale results. `WorkspaceRemoval.test.ts` covers real Git
and SQLite, dirty/ignored files, locks, detached commits and restart recovery;
`WorkspaceRemovalRuntime` and cache removal suites cover runtime and durable
guards. Relocation suites cover real Git movement/repair, source and repository
validation, durable policy reloads, alias preservation and UI confirmation.
`WorkspaceMoveService` covers real Git moves, local file preservation, native
Git refusals, configured/custom targets, lost replies and restart recovery.
Cache movement tests cover transactional publication and durable SQL guards;
UI tests cover configured-root priority and explicit advanced custom paths.
Native Windows source paths are simulated; this does not replace native OS QA.
`WorkspaceLockService` covers real Git locks, external changes, empty reasons,
missing checkouts, move/removal protection, lost replies and Windows source
routing. UI lock tests cover confirmation, stale snapshots and plain transport.
Static component rendering does not replace
interactive validation of creation, switching, errors and restart recovery.

`WorkspacePreparation` covers trust, changed scripts, source/path ownership,
pending maintenance, source-native Windows paths, early process exit,
cancellation and connection loss. UI tests cover explicit launch, settings-only
updates, frozen destinations, unsaved edits and plain transport snapshots.
`workspaceActivity` covers historical attribution, archived and child threads,
source isolation, unknown timestamps and read-only inspection. Management UI
and store tests cover thresholds, source/lock uncertainty, local activity,
late responses, offline reads and the existing deletion confirmation.
`workspaceWorkStatus` covers migration from version 45, SQLite reopening,
idempotent dates, explicit reopening, stale contexts, pending maintenance and
unchanged execution reservations. UI tests cover manual changes, combined
filters, sidebar markers, offline updates and lost responses without replay.
`workspaceRetention` and project preference tests cover legacy defaults, invalid
policies, per-project persistence and explicit disabling. Management tests cover
completion/activity deadlines, in-progress exclusions, unsaved drafts, reopening
the settings dialog and preserving manual inspection when suggestions are off.

Moving primary/imported workspaces and automatic per-agent worktrees are not
implemented. Local guards
do not lock out external Git/Codex clients or establish universal filesystem
identity across mounts and aliases.
