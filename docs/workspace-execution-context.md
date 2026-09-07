# Workspace execution context

Status: stable identity, guarded turn starts, immutable turn history and
workspace-aware project tools implemented.
Local app-server characterization is documented in
[codex-workspace-local-tests.md](codex-workspace-local-tests.md).
Delivery status and remaining acceptance criteria are tracked in
[the five delivery lots](workspaces-delivery-plan.md).
Managed worktree creation and its journal are documented in
[workspace-creation.md](workspace-creation.md).

## Implementation stage: verified resume primitive

`WorkspaceThreadTransition` now implements the tested source-bound sequence:
validate the directory and idle thread, await a caller-provided dispatch
reservation, unsubscribe, resume with explicit context, and verify the reply.
The RPC client exposes typed `unsubscribeThread`; unsubscribe is not assumed
to unload a thread observed by another client.

The expected context includes cwd, runtime roots, named profile provenance,
workspace-write sandbox projection, temporary-directory/network permissions,
approval policy and reviewer. Unexpected roots, broad sandbox modes, unknown
capabilities, active threads and independently transitioned sub-agents fail.
Paths are compared in source space without host resolution or case folding.

`WorkspaceTransitionError.requiresReconciliation` distinguishes pre-dispatch
refusals from failures after unsubscribe dispatch, including lost responses
and mismatched resume results. The primitive never retries or claims that an
uncertain remote effect was rolled back. Expectations are copied before I/O.

The primitive does not generate configuration or alter cached associations.
Its reply verification covers Codex's compatibility projection, not the full
split filesystem policy or persistence of cwd across future restarts.

## Implementation stage: durable selection coordinator

Migration 32 adds `workspace_transitions`, separate from execution reservations.
Both workspaces are reserved before preparation. A frozen permission contract
is persisted before unsubscribe dispatch. The original selection stays in
place until resume verification succeeds, then selection and blocker removal
commit in one SQLite transaction.

Turn notifications cannot acknowledge or complete transitions. Pending records
block executions on both locations, relocation, association changes and source
removal. Thread/project deletion is restricted by foreign keys. Empty-thread
cleanup skips pending transitions.

`WorkspaceExecutionService.select` now delegates to `WorkspaceSelectionService`
under the same local thread gate used by starts and reconciliation. Preparation
and capability/lifecycle validation are required backend dependencies, never
UI-supplied permissions. Production now supplies `WorkspaceRuntimePreparation`
and the UI exposes verified selection rather than a cache-only change.
Selecting the already selected workspace remains a no-op after the existing
source/inactivity checks, unless a transition is pending.

Pre-dispatch failures release the reservation. Ambiguous dispatch, mismatched
permissions and failed commits retain it. Explicit thread/workspace
reconciliation cancels interrupted preparation without remote effects, or
re-runs supported preparation and verified resume with the same frozen contract.
An idle reply alone cannot release dispatched state. Changed permission
contracts remain blocked; automatic rollback or retry is not implemented.

The transition coordinator is exercised with a real SQLite cache and mocked
source RPCs. Coverage includes closing/reopening the cache after response loss,
cross-operation concurrency, unrelated turn events, permission mismatches,
source/ownership guards, migration preservation and transactional rollback.
Earlier boundary tests use strict doubles. The final local scenario also
exercises production preparation, real SQLite and the real Codex app-server.

Production preparation, guarded lifecycle operations, Git creation and the
selector are now implemented. Physical relocation remains a separate advanced
feature. See the [delivery plan](workspaces-delivery-plan.md) and
[user guide](workspaces-user-guide.md) for supported cases and acceptance status.

## Implementation stage: guarded review, compaction and rollback

Migration 33 distinguishes `turn`, `review`, `compact` and `rollback`
reservations. Existing records retain the `turn` operation and their state.
`ThreadMaintenanceService` now routes the three maintenance actions through
the same durable reservation and local thread gate as starts and selection.

With a cache, the workspace supplies source and cwd. Contradictory caller hints,
active threads and pending transitions fail before dispatch. The reservation
is marked submitting before resume, since resume itself can change Codex state.
The resume response must identify the original, idle thread accepting direct
input and return the reserved cwd; an ignored override prevents dispatch.
This validates directory targeting, not the full permissions contract.

- Review acknowledgement requires the original thread and a turn ID. Matching
  completion releases its reservation, including completion before the RPC
  response. Detached or incomplete replies remain uncertain.
- Compaction acceptance does not release its reservation. Started/completed
  events correlate its lifecycle. If a source omits that lifecycle, explicit
  reconciliation after verified inactivity is required.
- Rollback ignores turn lifecycle events and releases only after its response
  and cache synchronization succeed. Lost replies remain uncertain and are
  never retried automatically.

Maintenance reservations do not create immutable user-turn workspace evidence.
Existing history survives rollback independently of the operational guard.
Cacheless runtimes retain legacy source/path fallback. Interrupt remains
available to stop an active turn.

Tests exercise migration idempotence, early/late completion, unrelated events,
transition conflicts, ignored resume overrides, wrong review thread identity,
source/path targeting and lost rollback responses across cache reopening.
Legacy conversation action tests still exercise the public delegation.

Effective workspace switching remains disabled until real permission
preparation and lifecycle checks are installed. Process/child tracking still
needs integration; these maintenance guards do not cover that boundary.

### Catalog mutations during workspace operations

Archive, restore and deletion use the same local thread gate as turn starts,
maintenance, selection and recovery. They reject persisted transitions and
execution reservations for the target thread before any source access, and
hold the gate through the source response and cache cleanup. Cacheless
runtimes retain their existing behavior.

Migration 34 extends durable execution reservations with archive, unarchive
and delete intents. It preserves existing reservations and recreates the
transition exclusion trigger. The backend reserves before preparation,
marks dispatch immediately before the source mutation, and releases only
after the RPC and local cleanup succeed.

Failure before dispatch cancels preparation. A lost response or failed cache
write retains an uncertain reservation across restart. Turn notifications
and maintenance acknowledgements cannot complete catalog reservations.
Deletion intent survives removal of the cached thread itself. Source/project
removal and workspace relocation continue to observe these reservations.

Catalog cache writes now propagate failures so the caller cannot release the
reservation after silently failed persistence. Cacheless behavior is retained.

Explicit reconciliation now recovers archive and unarchive intents from
positive source evidence. It searches the expected archived/active list with
all known source kinds and providers, using at most 100 pages of 100 entries.
It verifies the exact thread ID and cwd, then reads live identity and idle or
not-loaded status. Cache archive state must persist before the guard releases.
Repeated cursors, exhausted pages, unavailable sources, mismatched paths and
failed cache writes keep the reservation intact. Verification can be retried.
Preparation interrupted before dispatch cancels without contacting Codex.

A successful delete RPC response is now persisted using the reservation's
existing acknowledgement field before local cleanup. Explicit recovery can
repeat local cleanup from that evidence, including after restart or removal
of the cached thread row. Cleanup failure retains both evidence and blocker.
Recovery looks up reservations independently of the thread catalogue.

An empty list never proves deletion. Delete intents without a persisted
successful response remain blocked: this includes a lost RPC response or a
failure to persist its acknowledgement. Recovery does not replay archive,
unarchive or delete RPCs. The local gate excludes concurrent
backend operations throughout verification and persistence, but it does not
coordinate external Codex clients or provide a remote atomic snapshot.

Regression tests cover version 33 data preservation and migration idempotence,
public-runtime dispatch ordering, cleanup success/failure, lost replies across
reopening, unrelated turn events and rejection of idle-only recovery.

## Implementation stage: destination permission preparation

`WorkspacePermissionPreparation` reads the project's shared-folder definitions
under an existing durable transition, writes the destination's managed config,
and verifies the effective named profile via source-local `config/read`.
It leaves project preferences and the primary synchronization timestamp alone.
An unchanged config is not rewritten. Unmanaged default profiles and read
errors other than explicitly missing files prevent writes.

The profile ID hashes source identity, workspace identity and normalized policy
content. Folder ordering and labels do not change it. Permission changes do.
The same structured definition renders TOML and supplies explicit resume config
overrides; the expected profile ID and sandbox are checked after resume.
The full request contract remains part of durable transition recovery.

This first supported profile extends `:workspace`, disables network access and
general temporary-directory writes, and preserves explicit shared-folder and
environment-file rules. It is a restricted transition profile, not an automatic
replacement for arbitrary user policies. The production adapter validates
source policy compatibility and supplies actual approval settings.
No approval-policy default is guessed by this preparation service.

Literal absolute paths are required. Nested workspaces, shared folders
overlapping either workspace, conflicting duplicate rules and incompatible
environment-file grants are refused. These are lexical source-path checks;
the production adapter additionally checks ancestors through source metadata
and refuses symbolic links, including the destination configuration paths.

Effective configuration must match all generated rules. Known optional network
and glob fields serialized as `null` are normalized; unexpected rules or values
fail verification. During recovery, a changed contract is rejected before the
destination file is overwritten.

The existing primary context synchronization keeps its previous defaults and
uses the extracted shared generator. A live Linux app-server test of both new
services confirms writes in B and an allowed shared folder, refusal in A, and
refusal to read a shared `.env` file. The provider is simulated: no LLM calls.
See the [local test report](codex-workspace-local-tests.md).

The production adapter is installed, and the GUI exposes effective switching.
Empty conversations are created directly in their prepared destination; Codex
cannot resume them before their first persisted turn. Unsupported policies and
loaded child sessions fail explicitly, as documented in the user guide.

`WorkspaceThreadTransition.test.ts` covers the RPC boundary with deterministic
source doubles, including actual mismatches found during the local audit.
It does not run a model or claim to reproduce filesystem enforcement itself.

The [local app-server experiments](codex-workspace-local-tests.md) now verify
single-client idle switching, real sandbox writes and cold relocation on Linux
using a simulated model provider. Broader lifecycle cases remain open.

The [Codex 0.153.4 source audit](codex-workspace-risk-audit.md) establishes
cwd switching and AGENTS.md refresh from implementation and upstream tests.
It narrows the remaining experiments to the actual OpenCodexUI permission
profile, loaded/cold resume, surviving processes and relocation with the
original directory absent. Those upstream tests were inspected, not run.

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
- `threads.workspace.select`: coordinate verified selection within a
  project/source. Effective changes require the backend preparation adapter;
  without it, they fail explicitly. No filesystem move is performed.
- `threads.workspace.reconcile`: release a thread's reservations only after
  the source reports an idle or unloaded thread.
- `projectWorkspaces.execution.reconcile`: reconcile bound threads and release
  preparation interrupted before a thread ID was returned.

Both reconciliation entry points also handle the separate transition records
as described above; dispatched transitions require a verified resume.

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

Migration 30 adds
immutable per-turn workspace history independently of operational reservations.
Old turns have not been assigned inferred paths.

Reviews, compaction and rollback now use the execution guards described above.
Permission transitions and sub-agent lifecycle guards are installed in the
production adapter and validated in the local experiments. Creation and
conversation switching are exposed through the named workspace chat groups;
see the [user guide](workspaces-user-guide.md) for supported paths and limits.


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


## Project tools (action-plan step 5)

Physical tool requests accept an optional `workspaceId`. The runtime resolves
that identity before dispatch, checks project/source ownership, and rejects
contradictory path hints. It never converts a source path to a host path or
silently adopts another project. Existing requests without this field retain
their previous behavior, including cacheless integrations.

The covered boundaries are Git (including commit message generation), Compose,
file/skill search, project commands, IDE/folder/terminal/link opening, context
synchronization, and rule read/apply/test/restart. Project names, preferences,
tasks and command/rule definitions remain shared project data. The transport
continues to accept legacy paths; this is preparation for the future selector,
not a new UI selection mode.

- Primary Compose workspaces retain the existing naming behavior, so upgrading
  does not create a second stack. Secondary workspace IDs produce a stable,
  distinct Compose project name for reads, actions and logs. Ports and explicit
  container names remain the responsibility of Compose configuration.
- Command runs retain their source, cwd and optional workspace ID. The
  non-parallel setting applies within the same directory/source; stopping a
  run still addresses its original process handle. Filesystem lifecycle guards
  for these running processes belong to the upcoming worktree lifecycle work.
- Context definitions are materialized into the requested workspace's `.codex`
  directory. Synchronizing a secondary workspace does not update the primary
  workspace's synchronization timestamp.
- Migration 31 preserves existing rule-file metadata and keys it by project
  and physical file path, so generating rules in another checkout cannot
  overwrite the primary file's synchronization hash. Moving a workspace does
  not assume that the destination file matches its previous hash.
- Rule events carry their physical directory. The UI follows the selected
  conversation workspace and ignores events from other workspaces. Source restart state remains shared,
  because restarting app-server affects the whole source.

Validation covers legacy facade arguments, source/project isolation, Compose
naming, command execution context, secondary config materialization, migration
preservation/reopening and UI rule-event isolation. No worktree creation,
selector, source restart or live model execution is performed by the tests.

The primary-directory workflow remains supported. The subsequent workspace
UI and production-adapter experiments are tracked in the
[delivery plan](workspaces-delivery-plan.md). The grouped chat list adds
persistent workspace names through migration 36 without altering thread or
historical turn associations.
