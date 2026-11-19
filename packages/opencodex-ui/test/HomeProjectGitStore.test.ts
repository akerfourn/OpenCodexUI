import { describe, expect, it } from "vitest";
import { ProjectGitStore } from "../src/stores/project/git/ProjectGitStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import { createDeferred } from "./ProjectGitReferencesStore.fixture";
import { createFile, createStatus } from "./ProjectGitStatusStore.fixture";
import { createHomeProjectGitFixture, settleHomeGit } from "./HomeProjectGit.fixture";

describe("Home project Git observations", () => {
  it("should ignore deferred files and nested directories when reading status without opening a project", async () => {
    const test = createHomeProjectGitFixture();
    const project = test.projects[0]!;
    project.preferences = { git: { deferredPaths: ["local.env", "./generated\\cache/"] } };
    const status = createStatus({ changedFiles: [createFile("local.env"),
      createFile("generated/cache/nested/output.txt", "untracked")] });
    test.request.mockResolvedValue(status);

    const release = test.store.watch(project);
    await settleHomeGit();

    expect(test.store.snapshotFor(project)).toMatchObject({ hasChanges: false, aheadCount: 0 });
    expect(status.changedFiles).toHaveLength(2);
    expect(test.request).toHaveBeenCalledOnce();
    expect(test.request).toHaveBeenCalledWith({ type: "git.status", sourceId: project.sourceId, projectPath: project.path });
    release();
  });

  it("should keep nearby directory names and staged changes visible despite deferrals", () => {
    const test = createHomeProjectGitFixture();
    const project = test.projects[0]!;
    project.preferences = { git: { deferredPaths: ["src"] } };
    test.store.record(project.id, project.path, project.sourceId,
      createStatus({ changedFiles: [createFile("src-backup/file.ts")] }));
    expect(test.store.snapshotFor(project)?.hasChanges).toBe(true);
    test.store.record(project.id, project.path, project.sourceId,
      createStatus({ stagedFiles: [createFile("src/staged.ts")] }));
    expect(test.store.snapshotFor(project)?.hasChanges).toBe(true);
    expect(test.request).not.toHaveBeenCalled();
  });

  it("should apply current preferences to a cached observation when paths are deferred or restored", async () => {
    const test = createHomeProjectGitFixture();
    const project = test.projects[0]!;
    test.request.mockResolvedValue(createStatus({ changedFiles: [createFile("local.env")] }));
    const release = test.store.watch(project);
    await settleHomeGit();
    const checkedAt = test.store.snapshotFor(project)?.checkedAt;
    expect(test.store.snapshotFor(project)?.hasChanges).toBe(true);

    test.root.projectsStore.projects = [{ ...project, preferences: { git: { deferredPaths: ["local.env"] } } }];
    expect(test.store.snapshotFor(project)).toMatchObject({ hasChanges: false, checkedAt });
    test.root.projectsStore.projects = [{ ...project, preferences: {} }];
    expect(test.store.snapshotFor(project)).toMatchObject({ hasChanges: true, checkedAt });
    expect(test.request).toHaveBeenCalledOnce();
    release();
  });

  it("should use the owning project's preferences even for identical paths on different sources", async () => {
    const test = createHomeProjectGitFixture(2);
    const first = test.projects[0]!;
    const second = test.projects[1]!;
    second.path = first.path;
    first.preferences = { git: { deferredPaths: ["local.env"] } };
    test.request.mockResolvedValue(createStatus({ changedFiles: [createFile("local.env")] }));
    const releases = test.projects.map(project => test.store.watch(project));
    await settleHomeGit();
    expect(test.store.snapshotFor(first)?.hasChanges).toBe(false);
    expect(test.store.snapshotFor(second)?.hasChanges).toBe(true);
    releases.forEach(release => release());
  });

  it("should use preferences received during an in-flight status read", async () => {
    const test = createHomeProjectGitFixture();
    const pending = createDeferred<ReturnType<typeof createStatus>>();
    const project = test.projects[0]!;
    test.request.mockReturnValueOnce(pending.promise);
    const release = test.store.watch(project);
    test.root.projectsStore.projects = [{ ...project, preferences: { git: { deferredPaths: ["local.env"] } } }];
    pending.resolve(createStatus({ changedFiles: [createFile("local.env")] }));
    await settleHomeGit();
    expect(test.store.snapshotFor(project)?.hasChanges).toBe(false);
    expect(test.request).toHaveBeenCalledOnce();
    release();
  });

  it("should bound reads to two and discard queued rows that are no longer visible", async () => {
    const test = createHomeProjectGitFixture(5);
    const requests = Array.from({ length: 4 }, () => createDeferred<ReturnType<typeof createStatus>>());
    test.request.mockImplementation(() => requests[test.request.mock.calls.length - 1]!.promise);
    const releases = test.projects.map(project => test.store.watch(project));
    expect(test.request).toHaveBeenCalledTimes(2);
    releases[2]!();
    requests[0]!.resolve(createStatus());
    await settleHomeGit();
    expect(test.request).toHaveBeenCalledTimes(3);
    expect(test.request).toHaveBeenLastCalledWith({
      type: "git.status", sourceId: "source-3", projectPath: "/repo/3"
    });
    releases.forEach(release => release());
    requests[1]!.resolve(createStatus());
    requests[2]!.resolve(createStatus());
    await settleHomeGit();
    expect(test.request).toHaveBeenCalledTimes(3);
  });

  it("should share subscriptions, reuse a short cache, and refresh after expiry", async () => {
    const test = createHomeProjectGitFixture();
    test.request.mockResolvedValue(createStatus());
    const first = test.store.watch(test.projects[0]!);
    const second = test.store.watch(test.projects[0]!);
    await settleHomeGit();
    expect(test.request).toHaveBeenCalledOnce();
    first();
    first();
    test.store.refreshVisible();
    expect(test.request).toHaveBeenCalledOnce();
    test.advance(60_000);
    test.store.refreshVisible();
    await settleHomeGit();
    expect(test.request).toHaveBeenCalledTimes(2);
    second();
    test.store.refreshVisible(true);
    expect(test.request).toHaveBeenCalledTimes(2);
  });

  it("should recheck after Home entry even when cached rows become visible later", async () => {
    const test = createHomeProjectGitFixture();
    test.request.mockResolvedValue(createStatus());
    const release = test.store.watch(test.projects[0]!);
    await settleHomeGit();
    release();
    test.store.refreshVisible(true);
    const nextRelease = test.store.watch(test.projects[0]!);
    await settleHomeGit();
    expect(test.request).toHaveBeenCalledTimes(2);
    nextRelease();
  });

  it("should skip orphan, unavailable and manually stopped sources without opening a project", () => {
    const test = createHomeProjectGitFixture(4);
    test.root.projectsStore.projects[0]!.sourceId = null;
    test.readySources.delete("source-1");
    test.root.sourceInstancesStore.states.set("source-2", {
      sourceId: "source-2", phase: "stopped", manuallyStopped: true, isActive: false, error: null
    });
    test.root.sourceInstancesStore.states.set("source-3", {
      sourceId: "source-3", phase: "updating", manuallyStopped: false, isActive: false, error: null
    });
    const releases = test.projects.map(project => test.store.watch(project));
    test.store.refreshVisible(true);
    expect(test.request).not.toHaveBeenCalled();
    releases.forEach(release => release());
  });

  it("should keep identical paths on different sources separate and include staged or untracked changes", async () => {
    const test = createHomeProjectGitFixture(2);
    test.projects[1]!.path = test.projects[0]!.path;
    test.request.mockResolvedValueOnce(createStatus({ aheadCount: 2, stagedFiles: [createFile("staged.ts")] }))
      .mockResolvedValueOnce(createStatus({ changedFiles: [createFile("new.ts", "untracked")] }));
    const releases = test.projects.map(project => test.store.watch(project));
    await settleHomeGit();
    expect(test.store.snapshotFor(test.projects[0]!)).toMatchObject({ aheadCount: 2, hasChanges: true });
    expect(test.store.snapshotFor(test.projects[1]!)).toMatchObject({ aheadCount: 0, hasChanges: true });
    expect(test.request.mock.calls.map(([input]) => input.sourceId)).toEqual(["source-0", "source-1"]);
    releases.forEach(release => release());
  });

  it("should keep a newer panel observation when an older Home read finishes later", async () => {
    const test = createHomeProjectGitFixture();
    const pending = createDeferred<ReturnType<typeof createStatus>>();
    test.request.mockReturnValueOnce(pending.promise);
    const project = test.projects[0]!;
    const release = test.store.watch(project);
    test.store.record(project.id, project.path, project.sourceId, createStatus({ aheadCount: 3 }));
    pending.resolve(createStatus());
    await settleHomeGit();
    expect(test.store.snapshotFor(project)?.aheadCount).toBe(3);
    test.store.record(project.id, `${project.path}/secondary`, project.sourceId, createStatus({ aheadCount: 40 }));
    expect(test.store.snapshotFor(project)?.aheadCount).toBe(3);
    release();
  });

  it("should publish primary Git panel status immediately and ignore the selected secondary workspace", () => {
    const test = createHomeProjectGitFixture();
    const project = test.projects[0]!;
    const owner = { project, projectPath: project.path, isCodexSourceReady: true } as unknown as ProjectStore;
    const git = new ProjectGitStore(owner, test.root, { path: project.path, sourceId: project.sourceId });
    git.statusStore.applyStatus(createStatus({ aheadCount: 1 }));
    expect(test.store.snapshotFor(project)?.aheadCount).toBe(1);
    git.statusStore.applyStatus(createStatus());
    expect(test.store.snapshotFor(project)).toMatchObject({ aheadCount: 0, hasChanges: false });
    const secondary = new ProjectGitStore(owner, test.root, { path: "/other/worktree", sourceId: project.sourceId });
    secondary.statusStore.applyStatus(createStatus({ aheadCount: 8 }));
    expect(test.store.snapshotFor(project)?.aheadCount).toBe(0);
    expect(test.request).not.toHaveBeenCalled();
  });

  it("should discard delayed results after the source or main path changes", async () => {
    const test = createHomeProjectGitFixture();
    const pending = createDeferred<ReturnType<typeof createStatus>>();
    test.request.mockReturnValueOnce(pending.promise);
    const original = { ...test.projects[0]! };
    const release = test.store.watch(original);
    test.root.projectsStore.projects = [{ ...original, path: "/relocated", sourceId: "other" }];
    pending.resolve(createStatus({ aheadCount: 5 }));
    await settleHomeGit();
    expect(test.store.snapshotFor(original)).toBeUndefined();
    expect(test.store.snapshotFor(test.root.projectsStore.projects[0]!)).toBeUndefined();
    release();
  });

  it("should distinguish failed checks from clean repositories and allow a manual retry", async () => {
    const test = createHomeProjectGitFixture();
    test.request.mockRejectedValueOnce(new Error("Source read failed"));
    const release = test.store.watch(test.projects[0]!);
    await settleHomeGit();
    expect(test.store.snapshotFor(test.projects[0]!)).toMatchObject({ failed: true });
    test.request.mockResolvedValueOnce(createStatus({ isRepository: false }));
    test.store.refreshVisible(true);
    await settleHomeGit();
    expect(test.store.snapshotFor(test.projects[0]!)).toMatchObject({ failed: false, isRepository: false });
    release();
  });
});
