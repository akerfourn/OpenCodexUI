import { describe, expect, it, vi } from "vitest";
import { autorun } from "mobx";

import type {
  OpenCodexClientTransport,
  OpenCodexCollaborationEvent,
  OpenCodexProject,
  OpenCodexRequest,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { RootStore } from "../src/stores/RootStore";

describe("sub-agent thread store", () => {
  it("should list and cache descendants through an explicit source-aware request", async () => {
    const child = createThread("child", "root", "source-a", 1);
    const request = vi.fn(async (payload: OpenCodexRequest): Promise<unknown> => {
      return payload.type === "threads.subAgents.list" ? [child] : [];
    });
    const root = createRootStore(request);
    const project = root.projectsStore.openProjectTab(
      createProject("project-a", "source-a"),
      false
    );

    await expect(project.threadListStore.subAgentStore.list("root", "source-a"))
      .resolves.toEqual([child]);
    expect(project.threadListStore.subAgentStore.read("root", "source-a")).toEqual([child]);
    expect(request).toHaveBeenCalledWith({
      type: "threads.subAgents.list",
      sourceId: "source-a",
      parentThreadId: "root"
    });
  });

  it("should read a secondary thread without changing the selected chat", async () => {
    const child = createThread("child", "root", "source-a", 1);
    const response = { thread: child, turns: [] };
    const request = vi.fn(async (payload: OpenCodexRequest): Promise<unknown> => {
      return payload.type === "threads.readReadonly" ? response : [];
    });
    const root = createRootStore(request);
    const project = root.projectsStore.openProjectTab(
      createProject("project-a", "source-a"),
      false
    );

    await expect(project.threadListStore.subAgentStore.readThread("child", "source-a"))
      .resolves.toEqual(response);
    expect(project.selectedChatId).toBeNull();
    expect(request).toHaveBeenCalledWith({
      type: "threads.readReadonly",
      threadId: "child",
      sourceId: "source-a"
    });
  });

  it("should reconcile out-of-order live descendants and status updates", () => {
    const root = createRootStore();
    const project = root.projectsStore.openProjectTab(
      createProject("project-a", "source-a"),
      false
    );
    const grandchild = createThread("grandchild", "child", "source-a", 2);
    const child = createThread("child", "root", "source-a", 1);

    root.handleEvent({
      type: "collaboration.updated",
      sourceId: "source-a",
      event: createCollaborationEvent({ grandchild: "running" })
    });
    root.handleEvent({ type: "thread.discovered", thread: grandchild });
    root.handleEvent({ type: "thread.discovered", thread: child });

    expect(project.threadListStore.subAgentStore.read("root", "source-a").map(
      (thread) => thread.id
    )).toEqual(["child", "grandchild"]);

    expect(project.threadListStore.subAgentStore.read("root", "source-a")).toMatchObject([
      { id: "child", status: "idle" },
      { id: "grandchild", status: "running" }
    ]);

    root.handleEvent({
      type: "thread.metadata.updated",
      thread: { ...child, agentNickname: "Updated child", status: "completed" }
    });

    expect(project.threadListStore.subAgentStore.read("root", "source-a")[0]).toMatchObject({
      id: "child",
      agentNickname: "Updated child",
      status: "completed"
    });

    root.handleEvent({
      type: "thread.metadata.updated",
      thread: { ...grandchild, status: "completed" }
    });

    expect(project.threadListStore.subAgentStore.read("root", "source-a")[1]).toMatchObject({
      id: "grandchild",
      status: "completed"
    });
  });

  it("should keep overlapping live thread ids isolated by source", () => {
    const root = createRootStore();
    const firstProject = root.projectsStore.openProjectTab(
      createProject("project-a", "source-a"),
      false
    );
    const secondProject = root.projectsStore.openProjectTab(
      createProject("project-b", "source-b"),
      false
    );

    root.handleEvent({
      type: "thread.discovered",
      thread: createThread("shared", "root", "source-a", 1, "/workspace/project-a")
    });
    root.handleEvent({
      type: "thread.discovered",
      thread: createThread("shared", "root", "source-b", 1, "/workspace/project-b")
    });

    expect(firstProject.threadListStore.subAgentStore.read("root", "source-a"))
      .toMatchObject([{ id: "shared", sourceId: "source-a" }]);
    expect(firstProject.threadListStore.subAgentStore.read("root", "source-b")).toEqual([]);
    expect(secondProject.threadListStore.subAgentStore.read("root", "source-b"))
      .toMatchObject([{ id: "shared", sourceId: "source-b" }]);
  });

  it("should avoid observable tree refreshes when parallel discoveries are replayed", () => {
    const root = createRootStore();
    const project = root.projectsStore.openProjectTab(
      createProject("project-a", "source-a"),
      false
    );
    const threads = Array.from({ length: 128 }, (_, index) => (
      createThread(`child-${index}`, "root", "source-a", 1)
    ));
    const observedSizes: number[] = [];
    const dispose = autorun(() => {
      observedSizes.push(
        project.threadListStore.subAgentStore.read("root", "source-a").length
      );
    });

    for (const thread of threads) {
      root.handleEvent({ type: "thread.discovered", thread });
    }

    const observationCountAfterDiscovery = observedSizes.length;

    for (const thread of threads) {
      root.handleEvent({ type: "thread.discovered", thread: { ...thread } });
    }

    expect(project.threadListStore.subAgentStore.read("root", "source-a")).toHaveLength(128);
    expect(observedSizes.length).toBe(observationCountAfterDiscovery);
    dispose();
  });

  it("should clear loaded sub-agent hierarchies with the owning thread list", () => {
    const root = createRootStore();
    const project = root.projectsStore.openProjectTab(
      createProject("project-a", "source-a"),
      false
    );

    root.handleEvent({
      type: "thread.discovered",
      thread: createThread("child", "root", "source-a", 1)
    });
    expect(project.threadListStore.subAgentStore.read("root", "source-a")).toHaveLength(1);

    project.threadListStore.clear();

    expect(project.threadListStore.subAgentStore.read("root", "source-a")).toEqual([]);
  });
});

/** Creates a root store whose transport never performs external work. */
function createRootStore(
  request: (payload: OpenCodexRequest) => Promise<unknown> = async () => []
): RootStore {
  const transport: OpenCodexClientTransport = {
    request: async <T>(payload: OpenCodexRequest): Promise<T> => {
      return await request(payload) as T;
    },
    onEvent: vi.fn(() => () => undefined)
  };

  return new RootStore(transport);
}

/** Creates source-owned project metadata. */
function createProject(id: string, sourceId: string): OpenCodexProject {
  return {
    id,
    sourceId,
    path: `/workspace/${id}`,
    defaultName: id,
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    lastSeenAt: "2026-08-08T00:00:00.000Z",
    editedAt: "2026-08-08T00:00:00.000Z"
  };
}

/** Creates one live sub-agent thread fixture. */
function createThread(
  id: string,
  parentThreadId: string,
  sourceId: string,
  depth: number,
  projectPath = "/workspace/project-a"
): OpenCodexThread {
  return {
    id,
    sessionId: null,
    parentThreadId,
    codexTitle: id,
    customTitle: null,
    title: id,
    preview: "",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    projectName: projectPath.split("/").pop() ?? "project",
    projectPath,
    sourceId,
    branchName: null,
    updatedAt: null,
    isArchived: false,
    threadSource: null,
    agentNickname: id,
    agentRole: "worker",
    subAgentSource: {
      kind: "threadSpawn",
      parentThreadId,
      depth,
      agentPath: `/root/${id}`,
      agentNickname: id,
      agentRole: "worker",
      label: null
    },
    canAcceptDirectInput: false,
    status: "idle"
  };
}

/** Creates a collaboration event containing target runtime statuses. */
function createCollaborationEvent(
  targetAgentStatuses: Record<string, string>
): OpenCodexCollaborationEvent {
  return {
    id: "status-event",
    sourceId: "source-a",
    threadId: "root",
    turnId: "turn-1",
    callId: "call-1",
    action: "wait",
    toolName: "wait",
    senderThreadId: "root",
    senderAgentPath: "/root",
    receiverThreadIds: Object.keys(targetAgentStatuses),
    receiverAgentPaths: [],
    prompt: null,
    result: null,
    taskName: null,
    model: null,
    reasoningEffort: null,
    agentRole: null,
    forkTurns: null,
    status: "completed",
    targetAgentStatuses,
    evidence: ["canonicalItem"]
  };
}
