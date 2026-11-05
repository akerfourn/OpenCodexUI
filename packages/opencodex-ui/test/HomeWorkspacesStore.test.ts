import { runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexProject, OpenCodexProjectWorkspace, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { RootStore } from "../src/stores/RootStore";

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-05T12:00:00Z")); });
afterEach(() => vi.restoreAllMocks());

/** Metadata for two sources with the same native path demonstrates identity-based separation. */
function project(id: string, sourceId: string | null, isHidden = false): OpenCodexProject {
  return { id, sourceId, isHidden, path: "/repo", displayName: null, defaultName: id,
    preferences: {}, createdAt: "", updatedAt: "", editedAt: "", lastSeenAt: "" };
}

/** The real inventory consumes strict local reads and deterministic source checks. */
function fixture() {
  const projects = [project("one", "source-one"), project("two", "source-two"), project("orphan", null), project("hidden", "source-one", true)];
  const workspace = (id: string): OpenCodexProjectWorkspace => ({
    id: `${id}-workspace`, projectId: id, sourceId: projects.find(item => item.id === id)!.sourceId,
    path: "/repo/feature", name: `Feature ${id}`, isPrimary: false, managed: true,
    removedAt: null, workStatus: "completed", completedAt: "2026-01-01T00:00:00Z"
  });
  const request = vi.fn(async (input: OpenCodexRequest): Promise<unknown> => {
    if (input.type === "projects.list") return projects.map(item => ({ ...item }));
    if (input.type === "projectWorkspaces.list") return [workspace(input.projectId)];
    if (input.type === "projectWorkspaces.activity") return [{ workspaceId: `${input.projectId}-workspace`,
      sourceId: workspace(input.projectId).sourceId, workspacePath: "/repo/feature", lastActivityAt: "2026-01-01T00:00:00Z",
      conversationCount: 2, activeConversationCount: 0, pendingOperationCount: 0 }];
    if (input.type === "projectWorkspaces.creations.list" || input.type === "projectWorkspaces.removals.list"
      || input.type === "projectWorkspaces.moves.list") return [];
    if (input.type === "projectWorkspaces.lock.read") return { workspaceId: input.workspaceId,
      sourceId: input.sourceId, workspacePath: "/repo/feature", supported: true, lockedReason: null };
    if (input.type === "projectWorkspaces.changes.read") return { ...input.input,
      state: "checked", hasChanges: false, checkedAt: "2026-11-01T00:00:00Z", lastChangedAt: null };
    if (input.type === "projectWorkspaces.diskUsage.read") return { ...input.input,
      logicalBytes: 1024, allocatedBytes: 4096, fileCount: 1, skippedLinks: 0, unreadableEntries: 0,
      complete: true, limitReached: false, measuredAt: "2026-11-01T00:00:00Z" };
    throw new Error(`Unexpected request ${input.type}`);
  });
  const root = new RootStore({ request, onEvent: () => () => undefined });
  root.projectsStore.projects = projects;
  vi.spyOn(root.sourcesStore, "isSourceReady").mockImplementation(sourceId => sourceId === "source-one");
  return { root, request, projects, store: root.homeWorkspacesStore };
}

describe("cross-project Home workspace inventory", () => {
  it("should list unopened and orphan projects from cache without scanning or creating tabs", async () => {
    const { root, request, store } = fixture();
    await store.load();
    expect(root.projectsStore.projectStoresById.size).toBe(0);
    expect(store.projects.size).toBe(4);
    expect(store.visibleProjects.map(owner => owner.project.id)).toEqual(["one", "two", "orphan"]);
    expect(request.mock.calls.some(([input]) => input.type.endsWith(".read"))).toBe(false);
    store.setShowHidden(true);
    expect(store.visibleProjects).toHaveLength(4);
  });

  it("should check only online sources explicitly and keep cleanup unknown until those checks succeed", async () => {
    const { request, store } = fixture();
    await store.load();
    const online = store.projects.get("one")!;
    expect(online.statusFor(online.entries[0]!)).toBe("lockUnknown");
    await store.load(true);
    expect(online.statusFor(online.entries[0]!)).toBe("candidate");
    const offline = store.projects.get("two")!;
    expect(offline.statusFor(offline.entries[0]!)).toBe("offline");
    const checks = request.mock.calls.map(([input]) => input).filter(input => input.type === "projectWorkspaces.changes.read");
    expect(checks).toHaveLength(1);
    expect(checks.every(input => input.type === "projectWorkspaces.changes.read" && input.input.sourceId === "source-one")).toBe(true);
    expect(request.mock.calls.some(([input]) => input.type === "projectWorkspaces.diskUsage.read")).toBe(false);
    store.setFilter("candidate");
    expect(store.entriesFor(online)).toHaveLength(1);
    expect(store.entriesFor(offline)).toEqual([]);
  });

  it("should scan only the selected source and require opting in to hidden projects", async () => {
    const { request, store } = fixture();
    store.setSourceId("source-two");
    await store.load(true);
    expect(request.mock.calls.some(([input]) => input.type === "projectWorkspaces.changes.read")).toBe(false);
    store.setSourceId("source-one");
    store.setShowHidden(true);
    await store.load(true);
    const scans = request.mock.calls.map(([input]) => input).filter(input => input.type === "projectWorkspaces.changes.read");
    expect(scans).toHaveLength(2);
  });

  it("should evaluate fresh observations using scan completion time", async () => {
    const { request, store } = fixture();
    const original = request.getMockImplementation()!;
    let clock = Date.parse("2026-11-05T12:00:00Z");
    vi.mocked(Date.now).mockImplementation(() => clock);
    request.mockImplementation(async input => {
      const result = await original(input);
      if (input.type === "projectWorkspaces.changes.read") {
        clock += 2000;
        return { ...(result as object), checkedAt: new Date(clock).toISOString() };
      }
      return result;
    });
    await store.load(true);
    const owner = store.projects.get("one")!;
    expect(owner.statusFor(owner.entries[0]!)).toBe("candidate");
    expect(owner.checkedAt).toBe(clock);
  });

  it("should reject a lock reply from another source instead of proposing cleanup", async () => {
    const { request, store } = fixture();
    const original = request.getMockImplementation()!;
    request.mockImplementation(async input => {
      const result = await original(input);
      if (input.type === "projectWorkspaces.lock.read") return { ...(result as object), sourceId: "foreign" };
      return result;
    });
    await store.load(true);
    const owner = store.projects.get("one")!;
    expect(owner.statusFor(owner.entries[0]!)).not.toBe("candidate");
    expect(owner.checkErrors.get("one-workspace")).toContain("different source or path");
  });

  it("should keep measurements explicit, plain and separate for identical paths on different sources", async () => {
    const { request, store } = fixture();
    await store.load();
    const owner = store.projects.get("one")!;
    await owner.diskUsage.measure(owner.entries[0]!);
    const input = request.mock.calls.find(([input]) => input.type === "projectWorkspaces.diskUsage.read")![0];
    expect(structuredClone(input)).toEqual({ type: "projectWorkspaces.diskUsage.read", input: {
      projectId: "one", workspaceId: "one-workspace", sourceId: "source-one", workspacePath: "/repo/feature"
    } });
    expect(owner.sizeFor(owner.entries[0]!)?.allocatedBytes).toBe(4096);
    const other = store.projects.get("two")!;
    expect(other.sizeFor(other.entries[0]!)).toBeUndefined();
  });

  it("should discard late measurements when a project changes source without a catalogue refresh", async () => {
    const { root, request, store } = fixture();
    await store.load();
    const owner = store.projects.get("one")!;
    let finish!: (value: unknown) => void;
    request.mockImplementation(async () => new Promise(resolve => { finish = resolve; }));
    const task = owner.diskUsage.measure(owner.entries[0]!);
    runInAction(() => { root.projectsStore.projects[0]!.sourceId = "changed-source"; });
    finish({ projectId: "one", workspaceId: "one-workspace", sourceId: "source-one", workspacePath: "/repo/feature",
      logicalBytes: 1, allocatedBytes: null, fileCount: 1, skippedLinks: 0, unreadableEntries: 0,
      complete: true, limitReached: false, measuredAt: "2026-11-01T00:00:00Z" });
    await task;
    expect(owner.diskUsage.results.size).toBe(0);
  });

  it("should stop queued projects and source checks when leaving Home", async () => {
    const { request, store } = fixture();
    let finish!: (value: unknown) => void;
    request.mockImplementation(async () => new Promise(resolve => { finish = resolve; }));
    const task = store.load(true);
    store.dispose();
    finish([]);
    await task;
    expect(request).toHaveBeenCalledTimes(1);
    expect(store.projects.size).toBe(0);
  });
});
