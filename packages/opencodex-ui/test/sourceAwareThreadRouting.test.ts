/**
 * Covers source-aware routing for loaded chats with overlapping thread ids.
 */
import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexClientTransport,
  OpenCodexProject,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { RootStore } from "../src/stores/RootStore";

describe("source-aware thread routing", () => {
  it("should route a live event to the chat owned by its source", () => {
    const root = createRootStore();
    const firstProject = root.projectsStore.openProjectTab(
      createProject("project-a", "source-a"),
      false
    );
    const secondProject = root.projectsStore.openProjectTab(
      createProject("project-b", "source-b"),
      false
    );
    const firstChat = firstProject.getOrCreateChat(createThread("shared-thread", "source-a"));
    const secondChat = secondProject.getOrCreateChat(createThread("shared-thread", "source-b"));
    const firstThreadLookup = vi.spyOn(firstProject, "findThread");
    const secondThreadLookup = vi.spyOn(secondProject, "findThread");

    root.handleEvent({
      type: "thread.sync.started",
      sourceId: "source-b",
      threadId: "shared-thread"
    });

    expect(firstChat.runtime.isSyncing).toBe(false);
    expect(secondChat.runtime.isSyncing).toBe(true);
    expect(firstThreadLookup).not.toHaveBeenCalled();
    expect(secondThreadLookup).not.toHaveBeenCalled();

    firstProject.clearMemory();
    secondProject.clearMemory();
  });

  it("should remove only the thread owned by the deletion source", () => {
    const root = createRootStore();
    const firstProject = root.projectsStore.openProjectTab(createProject("project-a", "source-a"), false);
    const secondProject = root.projectsStore.openProjectTab(createProject("project-b", "source-b"), false);

    firstProject.getOrCreateChat(createThread("shared-thread", "source-a"));
    secondProject.getOrCreateChat(createThread("shared-thread", "source-b"));

    root.handleEvent({
      type: "thread.deleted",
      sourceId: "source-b",
      threadId: "shared-thread"
    });

    expect(firstProject.chatsById.has("shared-thread")).toBe(true);
    expect(secondProject.chatsById.has("shared-thread")).toBe(false);
    expect(
      root.projectsStore.findChatStoreByThreadId("shared-thread", "source-b")
    ).toBeNull();

    firstProject.clearMemory();
  });

  it("should keep legacy and orphan routing available without a source", () => {
    const root = createRootStore();
    const project = root.projectsStore.openProjectTab(createProject("orphan-project", null), false);
    const chat = project.getOrCreateChat(createThread("orphan-thread", null));

    root.handleEvent({
      type: "thread.sync.started",
      threadId: "orphan-thread"
    });

    expect(chat.runtime.isSyncing).toBe(true);
    expect(root.projectsStore.findChatStoreByThreadId("orphan-thread", null)).toBe(chat);

    project.clearMemory();
  });

  it("should unregister a loaded route when project memory is cleared", () => {
    const root = createRootStore();
    const project = root.projectsStore.openProjectTab(createProject("project-a", "source-a"), false);

    project.getOrCreateChat(createThread("thread-a", "source-a"));
    expect(root.projectsStore.findChatStoreByThreadId("thread-a", "source-a")).not.toBeNull();

    project.clearMemory();

    expect(root.projectsStore.findChatStoreByThreadId("thread-a", "source-a")).toBeNull();
  });

  it("should keep a deferred approval scoped to its source", () => {
    const root = createRootStore();
    const firstProject = root.projectsStore.openProjectTab(createProject("project-a", "source-a"), false);
    const secondProject = root.projectsStore.openProjectTab(createProject("project-b", "source-b"), false);

    root.handleEvent({
      type: "approval.requested",
      approval: {
        id: "approval-b",
        sourceId: "source-b",
        threadId: "shared-thread",
        title: "Approval",
        kind: "command",
        body: "Run command",
        choices: ["accept", "decline"]
      }
    });

    const firstChat = firstProject.getOrCreateChat(createThread("shared-thread", "source-a"));
    root.approvalsStore.attachPendingApprovalsToChat(firstChat);

    expect(firstChat.approvals).toEqual([]);
    expect(root.approvalsStore.unassignedApprovals).toHaveLength(1);

    const secondChat = secondProject.getOrCreateChat(createThread("shared-thread", "source-b"));
    root.approvalsStore.attachPendingApprovalsToChat(secondChat);

    expect(secondChat.approvals.map((approval) => approval.id)).toEqual(["approval-b"]);
    expect(root.approvalsStore.unassignedApprovals).toEqual([]);

    firstProject.clearMemory();
    secondProject.clearMemory();
  });

  it("should keep live collaboration and discovered children scoped to their source", () => {
    const root = createRootStore();
    const project = root.projectsStore.openProjectTab(
      createProject("project-a", "source-a"),
      false
    );
    const child = {
      ...createThread("child-1", "source-a"),
      parentThreadId: "parent-1",
      projectName: "project-a",
      projectPath: "/workspace/project-a"
    };

    root.handleEvent({ type: "thread.discovered", thread: child });
    root.handleEvent({
      type: "collaboration.updated",
      sourceId: "source-a",
      event: {
        id: "fallback-1",
        sourceId: "source-a",
        threadId: "parent-1",
        turnId: null,
        callId: null,
        action: "spawn",
        toolName: null,
        senderThreadId: "parent-1",
        senderAgentPath: null,
        receiverThreadIds: ["child-1"],
        receiverAgentPaths: ["/root/reviewer"],
        prompt: null,
        result: null,
        taskName: null,
        model: null,
        reasoningEffort: null,
        agentRole: null,
        forkTurns: null,
        status: "completed",
        targetAgentStatuses: {},
        evidence: ["structuralInference"]
      }
    });
    root.handleEvent({
      type: "collaboration.updated",
      sourceId: "source-a",
      event: {
        id: "event-1",
        sourceId: "source-a",
        threadId: "parent-1",
        turnId: "turn-1",
        callId: "call-1",
        action: "spawn",
        toolName: "spawn_agent",
        senderThreadId: "parent-1",
        senderAgentPath: "/root",
        receiverThreadIds: ["child-1"],
        receiverAgentPaths: ["/root/reviewer"],
        prompt: "Review this module.",
        result: null,
        taskName: "review",
        model: "gpt-5.6-luna",
        reasoningEffort: "medium",
        agentRole: "reviewer",
        forkTurns: "all",
        status: "completed",
        targetAgentStatuses: { "child-1": "idle" },
        evidence: ["rawFunctionCall"]
      }
    });

    expect(project.threadListStore.subAgentStore.read("parent-1", "source-a"))
      .toMatchObject([{ id: "child-1" }]);
    expect(project.threadListStore.subAgentStore.read("parent-1", "source-b")).toEqual([]);
    expect(root.collaborationStore.readThreadEvents("source-a", "child-1"))
      .toMatchObject([{ id: "event-1", prompt: "Review this module." }]);
    expect(root.collaborationStore.readThreadEvents("source-b", "child-1")).toEqual([]);

    project.clearMemory();
  });

  it("should preserve the collaboration source when opening an unloaded related thread", () => {
    const root = createRootStore();
    const request = vi.spyOn(root, "request").mockResolvedValue(undefined);

    root.projectsStore.navigateToThread("source-b", "child-1");

    expect(request).toHaveBeenCalledWith({
      type: "threads.open",
      sourceId: "source-b",
      threadId: "child-1"
    });
  });
});

/**
 * Creates a root store with an inert deterministic transport.
 *
 * @returns Root store fixture.
 */
function createRootStore(): RootStore {
  const transport: OpenCodexClientTransport = {
    request: vi.fn(async () => undefined),
    onEvent: vi.fn(() => () => undefined)
  };

  return new RootStore(transport);
}

/**
 * Creates project metadata for one source.
 *
 * @param id Project identifier.
 * @param sourceId Owning source identifier.
 * @returns Project fixture.
 */
function createProject(id: string, sourceId: string | null): OpenCodexProject {
  return {
    id,
    sourceId,
    path: `/workspace/${id}`,
    defaultName: id,
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    lastSeenAt: "2026-07-14T00:00:00.000Z",
    editedAt: "2026-07-14T00:00:00.000Z"
  };
}

/**
 * Creates thread metadata with an explicitly controlled source.
 *
 * @param id Thread identifier.
 * @param sourceId Owning source identifier.
 * @returns Thread fixture.
 */
function createThread(id: string, sourceId: string | null): OpenCodexThread {
  return {
    id,
    sessionId: null,
    parentThreadId: null,
    codexTitle: "Thread",
    customTitle: null,
    title: "Thread",
    preview: "",
    model: null,
    reasoningEffort: null,
    projectName: null,
    projectPath: null,
    sourceId,
    branchName: null,
    updatedAt: null,
    isArchived: false,
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    subAgentSource: null,
    canAcceptDirectInput: null
  };
}
