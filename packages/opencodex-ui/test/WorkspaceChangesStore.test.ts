import { describe, expect, it, vi } from "vitest";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceChanges } from "@open-codex-ui/opencodex-protocol";
import { WorkspaceChangesStore } from "../src/stores/project/WorkspaceChangesStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

/** Isolates transport while exercising the real freshness, context and lifecycle guards. */
function fixture() {
  const workspace: OpenCodexProjectWorkspace = { id: "ws", projectId: "project", sourceId: "source", path: "/remote/ws",
    isPrimary: false, managed: true, removedAt: null };
  const result: OpenCodexWorkspaceChanges = { projectId: "project", workspaceId: "ws", sourceId: "source",
    workspacePath: workspace.path, checkedAt: "2026-10-30T12:00:00Z", lastChangedAt: null, hasChanges: false, state: "checked" };
  const request = vi.fn(async () => result);
  const project = { project: { id: "project", sourceId: "source" }, isReadOnlyFromCache: false, isCodexSourceReady: true,
    workspaces: { workspaces: [workspace], activityById: new Map([[workspace.id, { changes: { ...result, state: "cached" } }]]) } };
  const store = new WorkspaceChangesStore(project as unknown as ProjectStore, { request } as unknown as RootStore);
  return { workspace, result, request, project, store };
}

describe("punctual workspace change evidence", () => {
  it("should leave the constructor idle and send a plain explicit source context only when checked", async () => {
    const { store, workspace, request } = fixture();
    expect(request).not.toHaveBeenCalled();
    expect(store.resultFor(workspace)?.state).toBe("cached");
    await store.check(workspace);
    expect(request).toHaveBeenCalledWith({ type: "projectWorkspaces.changes.read", input: {
      projectId: "project", workspaceId: "ws", sourceId: "source", workspacePath: "/remote/ws"
    } });
    expect(store.resultFor(workspace)?.state).toBe("checked");
  });

  it("should retain only cached evidence after a failed refresh or while offline", async () => {
    const { store, workspace, request, project } = fixture();
    await store.check(workspace);
    request.mockRejectedValueOnce(new Error("Source disconnected"));
    await store.check(workspace);
    expect(store.resultFor(workspace)?.state).toBe("cached");
    expect(store.errorFor(workspace)).toBe("Source disconnected");
    await store.check(workspace);
    project.isCodexSourceReady = false;
    expect(store.resultFor(workspace)?.state).toBe("cached");
  });

  it.each(["path", "source", "removed", "reset"])("should discard late results after %s changes", async reason => {
    const { store, workspace, request, result, project } = fixture();
    let finish!: (value: OpenCodexWorkspaceChanges) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = store.check(workspace);
    if (reason === "path") workspace.path = "/moved";
    if (reason === "source") project.project.sourceId = "other";
    if (reason === "removed") workspace.removedAt = "2026-10-30";
    if (reason === "reset") store.reset();
    finish(result);
    await pending;
    expect(store.results.size).toBe(0);
    expect(store.errors.size).toBe(0);
  });

  it("should reject a reply for another workspace without granting fresh cleanup evidence", async () => {
    const { store, workspace, request, result } = fixture();
    request.mockResolvedValueOnce({ ...result, workspaceId: "foreign" });
    await store.check(workspace);
    expect(store.resultFor(workspace)?.state).toBe("cached");
    expect(store.errorFor(workspace)).toContain("Invalid");
  });
});
