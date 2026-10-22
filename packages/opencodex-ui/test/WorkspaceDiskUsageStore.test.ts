import { runInAction, isObservable } from "mobx";
import { describe, expect, it, vi } from "vitest";
import type { OpenCodexProject, OpenCodexProjectWorkspace, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { RootStore } from "../src/stores/RootStore";

const workspace: OpenCodexProjectWorkspace = { id: "B", projectId: "project", sourceId: "source", path: "/B",
  isPrimary: false, managed: true, removedAt: null };
const measurement = { projectId: "project", workspaceId: "B", sourceId: "source", workspacePath: "/B",
  logicalBytes: 1024, allocatedBytes: 4096, fileCount: 1, skippedLinks: 0, unreadableEntries: 0,
  complete: true, limitReached: false, measuredAt: "2026-10-22T12:00:00Z" };

/** Uses real project stores and isolates only transport and source readiness. */
function fixture() {
  const request = vi.fn(async (input: OpenCodexRequest): Promise<unknown> => {
    if (input.type === "projectWorkspaces.list") return [workspace];
    if (input.type === "projectWorkspaces.diskUsage.read") return measurement;
    return [];
  });
  const root = new RootStore({ request, onEvent: () => () => undefined });
  const project = root.projectsStore.openProjectTab({ id: "project", sourceId: "source", path: "/A",
    defaultName: "Project", displayName: null, preferences: {}, isHidden: false,
    createdAt: "", updatedAt: "", editedAt: "", lastSeenAt: "" } as OpenCodexProject, false);
  vi.spyOn(root.sourcesStore, "isSourceReady").mockReturnValue(true);
  runInAction(() => { project.workspaces.workspaces = [{ ...workspace }]; });
  return { root, project, request, store: project.workspaces.diskUsage };
}

describe("explicit workspace size observations", () => {
  it("should never scan on catalogue load and send only plain explicit identities when requested", async () => {
    const { store, project, request } = fixture();
    await project.workspaces.load();
    expect(request.mock.calls.some(([input]) => input.type === "projectWorkspaces.diskUsage.read")).toBe(false);
    await store.measure(project.workspaces.workspaces[0]!);
    const call = request.mock.calls.find(([input]) => input.type === "projectWorkspaces.diskUsage.read")![0];
    expect(isObservable(call)).toBe(false);
    expect(structuredClone(call)).toEqual({ type: "projectWorkspaces.diskUsage.read", input: {
      projectId: "project", workspaceId: "B", sourceId: "source", workspacePath: "/B"
    } });
    expect(store.resultFor(workspace)).toEqual(measurement);
  });

  it.each(["source", "path", "removed", "pending", "dispose"])("should discard an in-flight reply after %s changes", async reason => {
    const { store, project, request } = fixture();
    let reply!: (value: unknown) => void;
    request.mockImplementation(async () => await new Promise(resolve => { reply = resolve; }));
    const task = store.measure(workspace);
    runInAction(() => {
      if (reason === "source") project.project.sourceId = "other";
      if (reason === "path") project.workspaces.workspaces[0]!.path = "/moved";
      if (reason === "removed") project.workspaces.workspaces[0]!.removedAt = "2026-10-22";
      if (reason === "pending") project.workspaces.workspaces[0]!.movePending = true;
      if (reason === "dispose") project.workspaces.dispose();
    });
    reply(measurement);
    await task;
    expect(store.results.size).toBe(0);
    expect(store.loading.size).toBe(0);
  });

  it("should keep a previous dated observation offline or after a failed refresh, without replacing it with zero", async () => {
    const { root, store, request } = fixture();
    await store.measure(workspace);
    request.mockRejectedValueOnce(new Error("source disconnected"));
    await store.measure(workspace);
    expect(store.resultFor(workspace)).toEqual(measurement);
    expect(store.errors.get("B")).toBe("source disconnected");
    vi.mocked(root.sourcesStore.isSourceReady).mockReturnValue(false);
    expect(store.canMeasure(workspace)).toBe(false);
    expect(store.resultFor(workspace)).toEqual(measurement);
  });

  it("should coalesce repeated clicks until a measurement finishes", async () => {
    const { store, request } = fixture();
    let reply!: (value: unknown) => void;
    request.mockImplementation(async () => await new Promise(resolve => { reply = resolve; }));
    const task = store.measure(workspace);
    await store.measure(workspace);
    expect(request).toHaveBeenCalledOnce();
    reply(measurement);
    await task;
  });

  it("should hide dated observations from stale row snapshots after the catalogue relocates", async () => {
    const { store, project } = fixture();
    await store.measure(workspace);
    runInAction(() => { project.workspaces.workspaces[0]!.path = "/moved"; });
    expect(store.resultFor(workspace)).toBeUndefined();
    expect(store.canMeasure(workspace)).toBe(false);
  });
});
