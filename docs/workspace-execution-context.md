# Workspace execution context

Status: stable identity and guarded turn starts implemented.
Live app-server characterization remains open.

## Evidence and scope

The generated `v2/TurnStartParams.ts` contract exposes `cwd` for the current
and subsequent turns. The official [app-server documentation][app-server]
describes the same behavior. Both also expose permission-related overrides;
changing the directory alone does not prove that all configuration is reloaded.

The locally available CLI reports `codex-cli 0.153.4`. No live model turn was
executed for this change. The tests below verify OpenCodexUI's outgoing requests,
not the execution behavior of this or another source's server version.

[app-server]: https://learn.chatgpt.com/docs/app-server

## First implementation

`ThreadTurnActionsService.startTurn` now forwards an explicitly requested,
normalized project path as `turn/start.cwd`.

Previously, that path reached an existing thread only through `thread/resume`.
Resume can be skipped for a loaded thread without cached turns, or explicitly
by the caller. In those cases, the next turn never received the requested path.

When the caller omits the path, the turn request omits the `cwd` override.
This preserves the context already established by thread creation or resume,
or retained by the loaded thread. In particular, this change does not add a
backend-default path override to a loaded thread that skips resume.

Existing path fallback during thread creation and resume is unchanged. A later
workspace resolver must replace this legacy behavior with an explicit
source-owned execution context.

The initial cwd-only change introduced no workspace UI or permission overrides.
The persistence and execution guards added afterwards are described below.

## Automated regression coverage

`ThreadConversationServiceTurnActions.test.ts` covers:

- explicit directory on a newly created thread's first turn;
- explicit directory when an empty loaded thread skips resume;
- explicit directory when the caller disables resume;
- no directory override when the caller omits it and resume is skipped;
- identical normalized directory on resume and turn start.

Run from the repository root:

```sh
npm run test -w @open-codex-ui/opencodex-core -- \
  test/ThreadConversationServiceTurnActions.test.ts
npm run typecheck
```

## Remaining characterization before workspace switching

Use disposable source-local directories A and B and isolated test sessions.
Record the server version, source kind and observed results for each case.
Keep these controlled experiments separate from deterministic unit tests.

1. Start a thread in A. Start its next turn with `cwd: B`, both with and
   without a preceding resume. Verify the directory of executed tools.
2. Start another turn without an override. Check its effective directory.
3. Compare thread read/list metadata with the effective directory. Restart the
   server, resume the same test thread and repeat the observations.
4. Move the disposable A directory, then resume explicitly into B. Record any
   failure caused by the missing original directory.
5. Put distinguishable instructions and permission configurations in A and B.
   Check which instructions, runtime roots and write permissions apply after
   switching. Confirm whether additional RPC overrides are necessary.
6. Spawn a test sub-agent from a turn in B. Check its effective context, then
   verify that changing the parent later does not move the existing child.
7. Inspect background terminals surviving a turn and determine how to detect
   them before deleting or relocating their originating workspace.

These observations must determine the supported switching procedure and any
source/version restrictions. Do not infer instruction reload, persistent
metadata changes or sub-agent inheritance from the presence of a `cwd` field.

## Stable identity and primary workspaces

Migrations 28 and 29 introduce the primary workspace catalogue, historical path
aliases, current thread associations and durable execution reservations.
Existing project IDs, preferences, groups and tasks are retained. New project
IDs are UUIDs; path-derived IDs remain supported as opaque historical values.

Explicit project creation and thread indexing share the same resolver. Known
thread associations take priority over incoming stale paths. Active paths can
resolve new threads, but historical aliases never adopt them automatically.
Reusing an old path therefore creates a separate project. Ambiguous legacy
source/path associations require explicit reconciliation instead of merging.

A primary workspace is a role, not a Git implementation type. The migration
performs no filesystem or Git inspection and does not mark existing checkouts
as managed. Orphan workspaces remain readable and cannot execute.

`WorkspaceCacheRepository.relocate` updates the workspace, legacy project/thread
paths and historical aliases transactionally. It refuses reserved workspaces
and path collisions. This is a persistence primitive: there is no public
relocation endpoint yet. Source-side identity validation and managed-process
checks must be added before exposing that operation.

## Guarded turn starts

With the persistent cache enabled, the backend resolves an existing thread's
workspace before contacting its source. New requests may identify a workspace
with `turn.start.workspaceId`; legacy source/path requests remain accepted.
An existing thread's contradictory source or path is rejected. Omitting these
hints uses the persisted context rather than the backend's default directory.
Relative execution paths are rejected before host-dependent normalization.

A local thread gate prevents concurrent start, selection and reconciliation.
An atomic SQLite reservation captures the workspace, source and directory before
validation or any thread/turn creation RPC. The owning source checks directory
availability and, for an existing thread, live inactivity.

Reservations block selection, relocation and project deletion. Source removal
is also blocked until its reservations have been resolved. Multiple different
threads may reserve the same workspace; these guards do not isolate their files.

The reservation is marked as submitting before the turn-start RPC. Failures
before dispatch release it. Failures after dispatch remain uncertain instead
of triggering a blind retry. A turn ID correlates response and lifecycle
notifications. Early completion is retained until response acknowledgement;
late completion from another turn or source cannot release a reservation.
Workspace lifecycle observation runs before UI notification suppression.

The following preparatory protocol operations are available:

- `projectWorkspaces.list`: read a project's catalogue without source access.
- `threads.workspace.select`: select within a project/source after checking
  inactivity; does not resume Codex or transfer files.
- `threads.workspace.reconcile`: release a thread's reservations only after
  the source reports an idle or unloaded thread.
- `projectWorkspaces.execution.reconcile`: reconcile bound threads and release
  preparation interrupted before a thread ID was returned.

Reconciliation is explicit and refuses active or unknown thread states. A
local in-flight operation cannot be released by reconciliation. These guarantees
cover operations coordinated by the application's backend; they do not lock out
independent Codex clients or external filesystem changes.

Cacheless runtimes retain their legacy execution behavior and reject explicit
workspace IDs. They do not provide durable workspace guarantees.

## Validation and remaining boundaries

`workspacePersistence.test.ts` exercises real SQLite migrations, identity,
relocation, alias reuse, source isolation and reservation transitions.
`WorkspaceExecutionService.test.ts` combines real cache persistence with mocked
source I/O, including concurrent requests, restart recovery and the wired thread
runtime receiving completion before the start response.

The UI selector and Git worktree creation remain deferred. Migration 30 adds
immutable per-turn workspace history independently of operational reservations.
Old turns have not been assigned inferred paths.

Reviews, compaction, rollback and project tools still need the wider workspace
adaptation. Permission/instruction reload and sub-agent behavior still require
the live characterization described above. No non-primary workspaces are
created by this implementation, and full workspace switching must remain
unexposed in the UI until those execution boundaries are addressed.


## Immutable turn context (action-plan step 4)

`turn_workspace_contexts` records project/workspace IDs, source ID and the cwd
submitted by the backend, keyed by thread and turn. Capture occurs atomically
with reservation acknowledgement or the correlated start notification, before
completion can release the reservation. An early completion and a lost response
therefore retain the evidence already observed. Conflicting reuse of a turn ID
fails instead of rewriting history.

The migration recovers contexts only from reservations with an already known
turn ID. It never reconstructs an older turn from the thread's current cwd.
Missing `OpenCodexTurn.workspaceContext` means unknown, including external
executions, reviews and compactions without a guarded local submission.
This is submission evidence, not independent verification of the remote process
or of permission/instruction reload.

Snapshots and deltas cannot write these records. Cache reads and the in-memory
turn registry overlay the trusted context, including after pagination or a full
replacement. Relocation and removal of a source association preserve historical
IDs and paths. Deleting the thread explicitly also deletes its context history.

- Rollback hides removed turns but retains their evidence independently of the
  turn snapshot. It does not rewind the thread's selected workspace.
- Re-edit creates a new turn on the next submission. That turn captures the
  selected workspace afresh; it never reuses the removed turn's context.
- There is currently no application-level thread-fork operation. Imported forks
  retain unknown context: matching turn IDs or parent ancestry alone cannot
  prove where copied history executed. Any future fork operation must preserve
  explicit origin evidence before attaching historical contexts.
- Externally spawned sub-agents likewise remain unknown until their own guarded
  submission establishes a context. Parent workspace selection and spawn model
  settings are not filesystem evidence. No automatic inheritance is introduced
  before the live app-server characterization is completed.
