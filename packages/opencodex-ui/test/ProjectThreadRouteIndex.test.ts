import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexClientTransport,
  OpenCodexProject,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { ProjectThreadRouteIndex } from "../src/stores/project/threads/ProjectThreadRouteIndex";
import { RootStore } from "../src/stores/RootStore";

describe("ProjectThreadRouteIndex", () => {
  it("should find identical project paths through their owning source", () => {
    const root = createRootStore();
    const firstProject = root.projectsStore.openProjectTab(
      createProject("project-a", "source-a", "/workspace/shared"),
      false
    );
    const secondProject = root.projectsStore.openProjectTab(
      createProject("project-b", "source-b", "/workspace/shared"),
      false
    );
    const index = new ProjectThreadRouteIndex(() => root.projectsStore.projectStoresById);

    expect(index.findProjectStoreByPath(" /workspace/shared ", "source-a")).toBe(firstProject);
    expect(index.findProjectStoreByPath("/workspace/shared", "source-b")).toBe(secondProject);
    expect(index.findProjectStoreByPath("/workspace/shared", "source-c")).toBeNull();

    firstProject.clearMemory();
    secondProject.clearMemory();
  });

  it("should isolate overlapping thread identifiers by source", () => {
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
    const index = new ProjectThreadRouteIndex(() => root.projectsStore.projectStoresById);

    index.registerLoadedChat(firstProject, firstChat);
    index.registerLoadedChat(secondProject, secondChat);

    expect(index.findProjectStoreForThread("shared-thread", "source-a")).toBe(firstProject);
    expect(index.findProjectStoreForThread("shared-thread", "source-b")).toBe(secondProject);
    expect(index.findChatStoreByThreadId("shared-thread", "source-a")).toBe(firstChat);
    expect(index.findChatStoreByThreadId("shared-thread", "source-b")).toBe(secondChat);

    firstProject.clearMemory();
    secondProject.clearMemory();
  });

  it("should unregister only the route owned by the selected chat", () => {
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
    const index = new ProjectThreadRouteIndex(() => new Map());

    index.registerLoadedChat(firstProject, firstChat);
    index.registerLoadedChat(secondProject, secondChat);
    index.unregisterLoadedChat(secondChat);

    expect(index.findChatStoreByThreadId("shared-thread", "source-a")).toBe(firstChat);
    expect(index.findChatStoreByThreadId("shared-thread", "source-b")).toBeNull();

    firstProject.clearMemory();
    secondProject.clearMemory();
  });

  it("should retain the legacy thread-only lookup for orphan chats", () => {
    const root = createRootStore();
    const project = root.projectsStore.openProjectTab(createProject("orphan", null), false);
    const chat = project.getOrCreateChat(createThread("orphan-thread", null));
    const index = new ProjectThreadRouteIndex(() => root.projectsStore.projectStoresById);

    expect(index.findChatStoreByThreadId("orphan-thread", null)).toBe(chat);
    expect(index.findProjectStoreForThread("orphan-thread", null)).toBe(project);

    project.clearMemory();
  });

  it("should keep pending notification routes isolated by source", () => {
    const index = new ProjectThreadRouteIndex(() => new Map());

    index.rememberNotificationRoute("source-a", "thread-1");

    expect(index.consumePendingNotificationRoute(createThread("thread-1", "source-b")))
      .toBe(false);
    expect(index.consumePendingNotificationRoute(createThread("thread-1", "source-a")))
      .toBe(true);
    expect(index.consumePendingNotificationRoute(createThread("thread-1", "source-a")))
      .toBe(false);
  });

  it("should resolve a source-less pending notification when metadata supplies a source", () => {
    const index = new ProjectThreadRouteIndex(() => new Map());

    index.rememberNotificationRoute(null, "thread-1");

    expect(index.consumePendingNotificationRoute(createThread("thread-1", "source-a")))
      .toBe(true);
  });

  it("should forget a pending notification after its open request fails", () => {
    const index = new ProjectThreadRouteIndex(() => new Map());

    index.rememberNotificationRoute("source-a", "thread-1");
    index.forgetNotificationRoute("source-a", "thread-1");

    expect(index.consumePendingNotificationRoute(createThread("thread-1", "source-a")))
      .toBe(false);
  });

  it("should consume pending thread ownership only once", () => {
    const root = createRootStore();
    const project = root.projectsStore.openProjectTab(
      createProject("project-a", "source-a"),
      false
    );
    const index = new ProjectThreadRouteIndex(() => root.projectsStore.projectStoresById);

    index.rememberPendingThreadProject("thread-1", project.project.id);

    expect(index.takePendingThreadProject("thread-1")).toBe(project);
    expect(index.takePendingThreadProject("thread-1")).toBeNull();

    project.clearMemory();
  });
});

/** Creates a root store with an inert deterministic transport. */
function createRootStore(): RootStore {
  const transport: OpenCodexClientTransport = {
    request: vi.fn(async () => undefined),
    onEvent: vi.fn(() => () => undefined)
  };

  return new RootStore(transport);
}

/** Creates project metadata for one source. */
function createProject(
  id: string,
  sourceId: string | null,
  projectPath = `/workspace/${id}`
): OpenCodexProject {
  return {
    id,
    sourceId,
    path: projectPath,
    defaultName: id,
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    editedAt: "2026-01-01T00:00:00.000Z"
  };
}

/** Creates thread metadata with an explicit source. */
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    status: "idle",
    archived: false,
    cwd: null,
    lastActivityAt: "2026-01-01T00:00:00.000Z"
  };
}
