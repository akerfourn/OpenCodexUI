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

## Persistence and validation

Migrations 28–31 establish identity, aliases, reservations, immutable history
and rule-file scoping. Migrations 32–34 add transition and maintenance/catalogue
guards; 35–37 add creation journaling, names and frozen storage roots.
Migration 43 journals removal; migration 44 retains relocation policy reloads. Preserve
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
Static component rendering does not replace
interactive validation of creation, switching, errors and restart recovery.

Physical move, worktree locking, preparation hooks and automatic per-agent
worktrees are not implemented. Local guards
do not lock out external Git/Codex clients or establish universal filesystem
identity across mounts and aliases.
