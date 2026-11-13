import { describe, expect, it } from "vitest";
import { ProjectGitStore } from "../src/stores/project/git/ProjectGitStore";
import {
  createBranch, createDeferred, createProjectGitReferencesFixture, createRemote, createStatus
} from "./ProjectGitReferencesStore.fixture";

describe("Git remote mutations", () => {
  it("should scope removal to its owning workspace and invalidate removed tracking references", async () => {
    const fixture = createProjectGitReferencesFixture();
    const git = new ProjectGitStore(fixture.projectStore, fixture.root, {
      workspaceId: "workspace-2", path: "/workspace/secondary", sourceId: "source-2"
    });
    git.statusStore.applyStatus(createStatus({ remotes: [createRemote("origin"), createRemote("backup")] }));
    git.referencesStore.branches = [createBranch("backup/main", { kind: "remote" })];
    git.referencesStore.hasLoadedBranches = true;
    const result = createStatus({ remotes: [createRemote("origin")] });
    fixture.request.mockResolvedValueOnce(result);

    await expect(git.referencesStore.removeRemote("backup")).resolves.toBe(true);

    expect(fixture.request).toHaveBeenCalledWith({ type: "git.remote.remove", projectPath: "/workspace/secondary",
      sourceId: "source-2", workspaceId: "workspace-2", name: "backup" });
    expect(git.statusStore.status).toEqual(result);
    expect(git.referencesStore.branches).toEqual([]);
    expect(git.referencesStore.hasLoadedBranches).toBe(false);
  });

  it("should keep existing status and branch references after a rejected removal", async () => {
    const fixture = createProjectGitReferencesFixture({ status: createStatus({ remotes: [createRemote("origin")] }) });
    const references = fixture.gitStore.referencesStore;
    references.branches = [createBranch("origin/main", { kind: "remote" })];
    const before = fixture.gitStore.statusStore.status;
    fixture.request.mockRejectedValueOnce(new Error("Config locked"));

    await expect(references.removeRemote("origin")).resolves.toBe(false);

    expect(fixture.gitStore.statusStore.status).toBe(before);
    expect(references.branches.map((branch) => branch.name)).toEqual(["origin/main"]);
    expect(references.remoteErrorMessage).toBe("Config locked");
    expect(references.isSavingRemote).toBe(false);
  });

  it("should block concurrent mutations and reads until a remote write is acknowledged", async () => {
    const fixture = createProjectGitReferencesFixture();
    const references = fixture.gitStore.referencesStore;
    const response = createDeferred<ReturnType<typeof createStatus>>();
    fixture.request.mockReturnValueOnce(response.promise);
    const save = references.upsertRemote("backup", "/backup.git", "add");

    expect(references.isSavingRemote).toBe(true);
    await expect(references.removeRemote("origin")).resolves.toBe(false);
    await references.loadRemotes();
    expect(fixture.request).toHaveBeenCalledTimes(1);
    response.resolve(createStatus({ remotes: [createRemote("backup")] }));
    await expect(save).resolves.toBe(true);
  });

  it("should not remove remotes when their source is unavailable", async () => {
    const fixture = createProjectGitReferencesFixture({ sourceReady: false });
    await expect(fixture.gitStore.referencesStore.removeRemote("origin")).resolves.toBe(false);
    expect(fixture.request).not.toHaveBeenCalled();
  });
});
