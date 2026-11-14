import { describe, expect, it } from "vitest";
import type { OpenCodexGitSyncResult } from "@open-codex-ui/opencodex-protocol";
import { ProjectGitStore } from "../src/stores/project/git/ProjectGitStore";
import { createDeferred, createProject, createProjectGitReferencesFixture, flushPromises } from "./ProjectGitReferencesStore.fixture";
import { createGitSyncStoreFixture, syncInspection, syncPlan, syncResult } from "./ProjectGitSyncStore.fixture";

describe("ProjectGitSyncStore", () => {
  it("should keep a simple send outside the advanced review and retain a structured recovery reason", async () => {
    const test = createGitSyncStoreFixture();
    const blocked = { ...syncResult("blocked"), issue: "advancedRequired" as const };
    test.request.mockResolvedValueOnce(blocked);

    await test.sync.simple("push");

    expect(test.sync.isOpen).toBe(false);
    expect(test.sync.simpleResult?.issue).toBe("advancedRequired");
    expect(test.request).toHaveBeenCalledOnce();
    expect(test.request).toHaveBeenCalledWith({
      type: "git.sync.simple", direction: "push", projectId: "project-1", projectPath: "/workspace/project", sourceId: "source-1"
    });
  });

  it("should persist source-scoped favorite and branch choices as plain transport data", async () => {
    const test = createGitSyncStoreFixture();
    test.request.mockResolvedValue(syncResult("inspected"));

    await test.sync.configure({ favoriteRemote: "backup" });
    await test.sync.configure({ branchRemote: null });

    expect(test.request.mock.calls.map(([request]) => request)).toEqual([
      { type: "git.sync.configure", favoriteRemote: "backup", branchName: "dev", projectId: "project-1", projectPath: "/workspace/project", sourceId: "source-1" },
      { type: "git.sync.configure", branchRemote: null, branchName: "dev", projectId: "project-1", projectPath: "/workspace/project", sourceId: "source-1" }
    ]);
    for (const [request] of test.request.mock.calls) expect(() => structuredClone(request)).not.toThrow();
  });

  it("should fetch an initial review without sending commits until explicit execution", async () => {
    const test = createGitSyncStoreFixture();
    await test.sync.open();
    expect(test.request.mock.calls.map(([request]) => request.type)).toEqual(["git.sync.inspect", "git.sync.plan"]);
    expect(test.sync.plan).toMatchObject({ aheadCount: 1, behindCount: 2, action: "rebase" });
    await test.sync.execute();
    const request = test.request.mock.calls.find(([request]) => request.type === "git.sync.execute")![0];
    expect(() => structuredClone(request)).not.toThrow();
    expect(request).toMatchObject({ projectId: "project-1", projectPath: "/workspace/project", sourceId: "source-1", plan: syncPlan() });
  });

  it("should invalidate an old review when the destination or strategy changes", async () => {
    const test = createGitSyncStoreFixture();
    await test.sync.open();
    test.sync.setTarget({ branchName: "another-branch" });
    expect(test.sync.plan).toBeNull();
    await test.sync.execute();
    expect(test.request.mock.calls.some(([request]) => request.type === "git.sync.execute")).toBe(false);
    test.sync.setStrategy("merge");
    await test.sync.analyze();
    expect(test.request).toHaveBeenLastCalledWith({ type: "git.sync.plan", projectId: "project-1",
      projectPath: "/workspace/project", sourceId: "source-1", strategy: "merge",
      target: { remoteName: "origin", branchName: "another-branch", setUpstream: false } });
  });

  it("should block duplicate mutations and dismissal while execution is in progress", async () => {
    const test = createGitSyncStoreFixture();
    await test.sync.open();
    const execution = createDeferred<OpenCodexGitSyncResult>();
    test.request.mockReturnValueOnce(execution.promise);
    const running = test.sync.execute();
    expect(test.sync.isMutating).toBe(true);
    test.sync.close();
    test.sync.setTarget({ branchName: "changed" });
    await test.sync.execute();
    expect(test.sync.isOpen).toBe(true);
    expect(test.sync.branchName).toBe("dev");
    expect(test.request.mock.calls.filter(([request]) => request.type === "git.sync.execute")).toHaveLength(1);
    execution.resolve(syncResult("synchronized"));
    await running;
    expect(test.sync.isBusy).toBe(false);
  });

  it("should allow closing a fetch without automatically executing its eventual review", async () => {
    const test = createGitSyncStoreFixture();
    const plan = createDeferred<OpenCodexGitSyncResult>();
    test.request.mockImplementationOnce(async () => syncResult("inspected")).mockReturnValueOnce(plan.promise);
    const opening = test.sync.open();
    await flushPromises();
    expect(test.sync.isBusy).toBe(true);
    test.sync.close();
    plan.resolve(syncResult("planned", syncInspection(), syncPlan()));
    await opening;
    expect(test.sync.isOpen).toBe(false);
    expect(test.request.mock.calls.some(([request]) => request.type === "git.sync.execute")).toBe(false);
  });

  it("should restore a paused operation on open and never push after continuation", async () => {
    const test = createGitSyncStoreFixture();
    const inspection = syncInspection();
    inspection.operation = { kind: "rebase", branchName: "dev", fingerprint: "operation", conflicts: [] };
    test.request.mockResolvedValueOnce(syncResult("inspected", inspection));
    await test.sync.open();
    expect(test.request).toHaveBeenCalledTimes(1);
    await test.sync.continueOperation();
    const request = test.request.mock.calls[1][0];
    expect(request).toMatchObject({ type: "git.sync.continue", operation: inspection.operation });
    expect(() => structuredClone(request)).not.toThrow();
    expect(test.sync.result?.outcome).toBe("continued");
    expect(test.request.mock.calls.some(([request]) => request.type === "git.sync.execute" || request.type === "git.sync.plan")).toBe(false);
  });

  it("should preserve technical errors in details while keeping the main outcome translatable", async () => {
    const test = createGitSyncStoreFixture();
    test.request.mockRejectedValueOnce(new Error("Error invoking remote method: fatal: authentication failed"));
    await test.sync.open();
    expect(test.sync.result).toMatchObject({ outcome: "error", issue: "gitFailed", plan: null });
    expect(test.sync.result?.details).toContain("authentication failed");
    expect(test.gitStore.errorMessage).toBeNull();
  });

  it("should keep transport failures visible after a simple exchange", async () => {
    const test = createGitSyncStoreFixture();
    test.request.mockRejectedValueOnce(new Error("Git transport disconnected"));

    await test.sync.simple("push");

    expect(test.sync.simpleResult).toMatchObject({ outcome: "error", issue: "gitFailed", details: "Git transport disconnected" });
    expect(test.sync.isOpen).toBe(false);
  });

  it("should persist a project strategy as a plain DTO without losing existing preferences", async () => {
    const project = createProject({ git: { deferredPaths: ["notes.txt"], commitProtectedBranches: ["main"], referenceTagName: "v1" } });
    const test = createProjectGitReferencesFixture({ project });
    test.gitStore.sync.setStrategy("merge");
    test.request.mockImplementation(async (request) => ({ ...project, preferences: request.patch }));
    await test.gitStore.sync.saveDefaultStrategy();
    const request = test.request.mock.calls[0][0];
    expect(() => structuredClone(request)).not.toThrow();
    expect(request).toEqual({ type: "projects.preferences.update", projectId: "project-1", patch: {
      git: { deferredPaths: ["notes.txt"], commitProtectedBranches: ["main"], referenceTagName: "v1", syncStrategy: "merge" } } });
    expect(test.gitStore.sync.defaultStrategy).toBe("merge");
    expect(project.preferences.git?.deferredPaths).toEqual(["notes.txt"]);
  });

  it("should keep the owning workspace identity in every synchronization request", async () => {
    const test = createGitSyncStoreFixture();
    const git = new ProjectGitStore(test.projectStore, test.root, { path: "/secondary", sourceId: "source-2", workspaceId: "workspace-2" });
    git.statusStore.applyStatus(syncInspection().status);
    await git.sync.open();
    for (const [request] of test.request.mock.calls) {
      expect(request).toMatchObject({ projectId: "project-1", sourceId: "source-2", projectPath: "/secondary", workspaceId: "workspace-2" });
    }
  });
});
