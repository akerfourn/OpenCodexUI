# Sub-agent workspace isolation

Status: architecture choice pending; isolated launches are not implemented.

## Required guarantee

An isolated sub-agent must receive its source-owned worktree, working directory
and verified filesystem permissions before its first tool call. Moving it after
a creation notification cannot establish that guarantee. Shared-workspace
delegation remains the default.

## Current integration boundary

The initial inspection used the repository's generated app-server contracts and
the locally installed Codex CLI 0.162.1. This is a characterization of that
integration, not a claim about all future Codex versions.

- `ClientRequest` exposes thread start, fork, resume and turn operations, but no
  native sub-agent spawn request or callback to allocate its workspace.
- `ServerRequest` has approval and dynamic-tool calls, but no native sub-agent
  pre-launch request carrying a replaceable directory and permission profile.
- `ThreadStartParams` accepts `cwd`, runtime roots, permissions and dynamic
  tools. It does not accept a native parent/sub-agent relationship.
- `ThreadForkParams` can create a conversation in another directory. A fork's
  `forkedFromId` is distinct from a sub-agent's `parentThreadId`.
- `threadSource` is an analytics classification, not a way to register a native
  child with Codex's orchestration tools.
- `CollaborationService` observes and persists native collaboration events.
  `SubAgentThreadsDialog` displays their threads; it does not launch them.
- `WorkspaceThreadTransition` rejects independent transitions of sub-agents.
  Its verified resume sequence must not be reused to relocate an active child.

Relevant source contracts:

- `packages/codex-rpc/src/generated/ClientRequest.ts`
- `packages/codex-rpc/src/generated/ServerRequest.ts`
- `packages/codex-rpc/src/generated/v2/ThreadStartParams.ts`
- `packages/codex-rpc/src/generated/v2/ThreadForkParams.ts`
- `packages/codex-rpc/src/generated/v2/Thread.ts`
- `packages/opencodex-core/src/backend/workspaces/WorkspaceThreadTransition.ts`

The official documentation describes
[Codex-managed sub-agent orchestration](https://learn.chatgpt.com/docs/agent-configuration/subagents)
and [app-server thread and dynamic-tool operations](https://learn.chatgpt.com/docs/app-server).
Those documents do not establish an external pre-launch workspace allocator
for native sub-agents. The missing allocation boundary is also absent from the
generated contracts currently used by OpenCodexUI.

## Implementation choices

### OpenCodexUI-managed delegation

OpenCodexUI would provide its own delegation tools through app-server dynamic
tools. It would allocate the worktree and prepare the permission profile before
creating a child conversation and starting its first turn. Parent/child links,
messages, result delivery, cancellation and recovery would belong to OpenCodexUI.

This can reuse the existing app-server integration and workspace services. It
requires an explicit orchestration boundary and durable operation records;
relabeling a normal conversation as a native sub-agent would be incorrect.
Native delegation must not silently bypass an enabled isolation guarantee.

A minimal usable first delivery would include:

1. An explicit per-chat choice, shared by default, captured before a parent turn.
2. Source-aware delegation tools with child creation, status/result retrieval,
   follow-up messages and interruption.
3. Durable parent/child/workspace associations and pre-dispatch reservations.
4. A worktree based on the parent's captured commit, with its own permissions.
5. No first child turn until its returned directory and policy are verified.
6. Visible failed or uncertain launches, without automatic replay or deletion.
7. Child discovery, logs and status after reconnect or application restart.

This changes how delegation is orchestrated. It is larger than adding a
checkbox to the existing native sub-agent viewer.

### Native Codex orchestration

Keeping Codex's existing delegation tools requires a Codex integration change:
either a supported pre-launch allocation callback or a native workspace-aware
spawn contract. The parent must wait for allocation and permission preparation
before the child can execute, and the response must retain the native
parent/child relationship.

This preserves Codex's coordination behavior. It depends on an upstream change
or a maintained Codex fork; the current OpenCodexUI-only API cannot supply that
contract. Unknown callback responses must not fall back to a shared workspace.

## Reusable workspace behavior

Both choices should reuse existing creation journals and configured storage
roots. A launch captures project, source and parent workspace explicitly.
Creation starts from a resolved commit; uncommitted parent edits are not copied
implicitly. Preparation hooks remain a separate explicit action.

The child must not inherit write access to its parent's checkout merely because
the parent had it. Shared context folders require an explicit policy. A failure
retains any worktree that may contain work, and existing move/removal activity
guards must recognize the child before allowing maintenance.

Change recovery, merge/cherry-pick conflict handling and automatic cleanup are
later deliveries. This first lot must not merge or delete anything implicitly.
