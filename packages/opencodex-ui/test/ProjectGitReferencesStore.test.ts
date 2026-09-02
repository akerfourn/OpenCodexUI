import { isObservableProp } from "mobx";
import { describe, expect, it } from "vitest";

import type { OpenCodexGitBranchKind } from "@open-codex-ui/opencodex-protocol";

import {
  createBranch,
  createProject,
  createProjectGitReferencesFixture,
  createRemote,
  createStatus,
  createTagResult,
  flushPromises,
  requestTypes
} from "./ProjectGitReferencesStore.fixture";

describe("ProjectGitReferencesStore Git references", () => {
  it("should use the latest project path and source in a later branch request", async () => {
    const fixture = createProjectGitReferencesFixture();
    fixture.projectStore.setProject({
      ...createProject(),
      path: "C:/workspace/second-project",
      sourceId: "source-2"
    });
    fixture.request.mockResolvedValueOnce([createBranch("feature/api")]);

    await fixture.gitStore.referencesStore.loadBranches();

    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.branches",
      projectPath: "C:/workspace/second-project",
      sourceId: "source-2"
    });
  });

  it("should load branches with the scoped payload and observable flags", async () => {
    const fixture = createProjectGitReferencesFixture();
    const branches = [
      createBranch("feature/api"),
      createBranch("origin/main", { kind: "remote" })
    ];
    fixture.gitStore.referencesStore.branches = [createBranch("old")];

    fixture.request.mockResolvedValueOnce(branches);
    const loadBranches = fixture.gitStore.referencesStore.loadBranches;
    const loading = loadBranches();

    expect(fixture.gitStore.referencesStore.isLoadingBranches).toBe(true);
    await loading;

    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.branches",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.gitStore.referencesStore.branches).toEqual(branches);
    expect(fixture.gitStore.referencesStore.isLoadingBranches).toBe(false);
    expect(fixture.gitStore.referencesStore.hasLoadedBranches).toBe(true);
    expect(fixture.gitStore.referencesStore.branchErrorMessage).toBe(null);
    expect(isObservableProp(fixture.gitStore.referencesStore, "branches")).toBe(true);
    expect(isObservableProp(fixture.gitStore.referencesStore, "isLoadingBranches")).toBe(true);
    expect(isObservableProp(fixture.gitStore.referencesStore, "hasLoadedBranches")).toBe(true);
  });

  it.each([
    {
      name: "an unavailable source",
      options: { sourceReady: false }
    },
    {
      name: "a non-repository status",
      options: { status: createStatus({ isRepository: false }) }
    }
  ])("should clear branches without requesting for $name", async ({ options }) => {
    const fixture = createProjectGitReferencesFixture(options);
    fixture.gitStore.referencesStore.branches = [createBranch("stale")];
    fixture.gitStore.referencesStore.branchErrorMessage = "previous branch error";

    await fixture.gitStore.referencesStore.loadBranches();

    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.gitStore.referencesStore.branches).toEqual([]);
    expect(fixture.gitStore.referencesStore.hasLoadedBranches).toBe(true);
    expect(fixture.gitStore.referencesStore.isLoadingBranches).toBe(false);
    expect(fixture.gitStore.referencesStore.branchErrorMessage).toBe("previous branch error");
  });

  it("should preserve branches and expose a branch loading error", async () => {
    const fixture = createProjectGitReferencesFixture();
    const previousBranches = [createBranch("stale")];
    fixture.gitStore.referencesStore.branches = previousBranches;
    fixture.request.mockRejectedValueOnce(new Error("branch listing failed"));

    await fixture.gitStore.referencesStore.loadBranches();

    expect(fixture.gitStore.referencesStore.branches).toEqual(previousBranches);
    expect(fixture.gitStore.referencesStore.branchErrorMessage).toBe("branch listing failed");
    expect(fixture.gitStore.referencesStore.isLoadingBranches).toBe(false);
    expect(fixture.gitStore.referencesStore.hasLoadedBranches).toBe(true);
  });

  it("should replace only remotes with the scoped remote payload", async () => {
    const fixture = createProjectGitReferencesFixture({
      status: createStatus({
        branchName: "feature/api",
        aheadCount: 2,
        remotes: [createRemote("old")]
      })
    });
    const previousStatus = fixture.gitStore.statusStore.status;
    const remotes = [createRemote("origin"), createRemote("backup")];
    fixture.request.mockResolvedValueOnce(remotes);

    await fixture.gitStore.referencesStore.loadRemotes();

    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.remotes",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.gitStore.statusStore.status).toEqual({
      ...previousStatus,
      remotes
    });
    expect(fixture.gitStore.referencesStore.isLoadingRemotes).toBe(false);
    expect(fixture.gitStore.referencesStore.remoteErrorMessage).toBe(null);
  });

  it.each([
    {
      name: "an unavailable source",
      options: { sourceReady: false }
    },
    {
      name: "a non-repository status",
      options: { status: createStatus({ isRepository: false, remotes: [createRemote("old")] }) }
    }
  ])("should clear remotes without requesting for $name", async ({ options }) => {
    const fixture = createProjectGitReferencesFixture(options);
    fixture.gitStore.referencesStore.remoteErrorMessage = "previous remote error";

    await fixture.gitStore.referencesStore.loadRemotes();

    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.gitStore.statusStore.status.remotes).toEqual([]);
    expect(fixture.gitStore.referencesStore.isLoadingRemotes).toBe(false);
    expect(fixture.gitStore.referencesStore.remoteErrorMessage).toBe("previous remote error");
  });

  it("should preserve remotes and expose a remote loading error", async () => {
    const fixture = createProjectGitReferencesFixture({
      status: createStatus({ remotes: [createRemote("origin")] })
    });
    const previousStatus = fixture.gitStore.statusStore.status;
    fixture.request.mockRejectedValueOnce(new Error("remote listing failed"));

    await fixture.gitStore.referencesStore.loadRemotes();

    expect(fixture.gitStore.statusStore.status).toBe(previousStatus);
    expect(fixture.gitStore.referencesStore.remoteErrorMessage).toBe("remote listing failed");
    expect(fixture.gitStore.referencesStore.isLoadingRemotes).toBe(false);
  });

  it.each([
    {
      name: "local",
      branch: createBranch("feature/api"),
      branchKind: "local" as OpenCodexGitBranchKind
    },
    {
      name: "remote",
      branch: createBranch("origin/feature/api", { kind: "remote" }),
      branchKind: "remote" as OpenCodexGitBranchKind
    }
  ])("should checkout a $name branch and await branch and tag refreshes", async ({
    branch,
    branchKind
  }) => {
    const fixture = createProjectGitReferencesFixture();
    const status = createStatus({
      branchName: "feature/api",
      upstreamName: branchKind === "remote" ? "origin/feature/api" : null
    });
    const branches = [createBranch("feature/api", { isCurrent: true })];
    fixture.request
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(branches)
      .mockResolvedValueOnce(createTagResult());

    const checkout = fixture.gitStore.referencesStore.checkoutBranch(branch);
    expect(fixture.gitStore.referencesStore.isCheckingOutBranch).toBe(true);
    await checkout;

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.checkout",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      branchName: branch.name,
      branchKind
    });
    expect(requestTypes(fixture)).toEqual(["git.checkout", "git.branches", "git.tags"]);
    expect(fixture.gitStore.statusStore.status).toEqual(status);
    expect(fixture.gitStore.referencesStore.branches).toEqual(branches);
    expect(fixture.gitStore.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.gitStore.referencesStore.isCheckingOutBranch).toBe(false);
  });

  it("should trim a new branch name and await branch and tag refreshes", async () => {
    const fixture = createProjectGitReferencesFixture();
    const status = createStatus({ branchName: "feature/new" });
    const branches = [createBranch("feature/new", { isCurrent: true })];
    fixture.request
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(branches)
      .mockResolvedValueOnce(createTagResult());

    const creation = fixture.gitStore.referencesStore.createBranch("  feature/new  ");
    expect(fixture.gitStore.referencesStore.isCheckingOutBranch).toBe(true);
    await creation;

    expect(fixture.gitStore.statusStore.status).toEqual(status);
    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.branch.create",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      branchName: "feature/new"
    });
    expect(requestTypes(fixture)).toEqual([
      "git.branch.create",
      "git.branches",
      "git.tags"
    ]);
    expect(fixture.gitStore.referencesStore.isCheckingOutBranch).toBe(false);
  });

  it.each([
    {
      name: "checkout",
      operation: (fixture: ReturnType<typeof createProjectGitReferencesFixture>) => (
        fixture.gitStore.referencesStore.checkoutBranch(createBranch("feature/api"))
      ),
      payload: {
        type: "git.checkout",
        projectPath: "/workspace/project",
        sourceId: "source-1",
        branchName: "feature/api",
        branchKind: "local"
      }
    },
    {
      name: "creation",
      operation: (fixture: ReturnType<typeof createProjectGitReferencesFixture>) => (
        fixture.gitStore.referencesStore.createBranch("  feature/new  ")
      ),
      payload: {
        type: "git.branch.create",
        projectPath: "/workspace/project",
        sourceId: "source-1",
        branchName: "feature/new"
      }
    }
  ])("should refresh status after a $name failure", async ({ operation, payload }) => {
    const fixture = createProjectGitReferencesFixture();
    const refreshedStatus = createStatus({ branchName: "recovered" });
    fixture.request
      .mockRejectedValueOnce(new Error(`${payload.type} failed`))
      .mockResolvedValueOnce(refreshedStatus)
      .mockResolvedValueOnce(createTagResult());

    const result = operation(fixture);
    expect(fixture.gitStore.referencesStore.isCheckingOutBranch).toBe(true);
    const didSucceed = await result;
    await flushPromises();

    expect(didSucceed).toBe(false);
    expect(fixture.request).toHaveBeenNthCalledWith(1, payload);
    expect(requestTypes(fixture)).toEqual([payload.type, "git.status", "git.tags"]);
    expect(fixture.gitStore.statusStore.status).toEqual(refreshedStatus);
    expect(fixture.gitStore.referencesStore.branchErrorMessage).toBe(`${payload.type} failed`);
    expect(fixture.gitStore.errorMessage).toBe(null);
    expect(fixture.gitStore.referencesStore.isCheckingOutBranch).toBe(false);
  });

  it("should merge a trimmed branch and await branch and tag refreshes", async () => {
    const fixture = createProjectGitReferencesFixture();
    const status = createStatus({ branchName: "main" });
    const branches = [createBranch("feature/api")];
    fixture.request
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(branches)
      .mockResolvedValueOnce(createTagResult());

    const merge = fixture.gitStore.referencesStore.mergeBranch({
      ...createBranch("feature/api"),
      name: "  feature/api  "
    });
    expect(fixture.gitStore.referencesStore.isMergingBranch).toBe(true);
    await merge;

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.merge",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      branchName: "feature/api"
    });
    expect(requestTypes(fixture)).toEqual(["git.merge", "git.branches", "git.tags"]);
    expect(fixture.gitStore.statusStore.status).toEqual(status);
    expect(fixture.gitStore.referencesStore.isMergingBranch).toBe(false);
  });

  it("should merge the current branch into a trimmed target and refresh references", async () => {
    const fixture = createProjectGitReferencesFixture();
    const status = createStatus({ branchName: "release" });
    const branches = [createBranch("main"), createBranch("release", { isCurrent: true })];
    fixture.request
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(branches)
      .mockResolvedValueOnce(createTagResult());

    const merge = fixture.gitStore.referencesStore.mergeBranchTo({
      ...createBranch("release"),
      name: "  release  "
    });
    expect(fixture.gitStore.referencesStore.isMergingBranch).toBe(true);
    await merge;

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.merge.to",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      targetBranchName: "release"
    });
    expect(requestTypes(fixture)).toEqual(["git.merge.to", "git.branches", "git.tags"]);
    expect(fixture.gitStore.statusStore.status).toEqual(status);
    expect(fixture.gitStore.referencesStore.isMergingBranch).toBe(false);
  });

  it.each([
    {
      name: "an empty branch",
      options: {},
      branchName: "   "
    },
    {
      name: "an unavailable source",
      options: { sourceReady: false },
      branchName: "feature/api"
    },
    {
      name: "a concurrent merge",
      options: {},
      branchName: "feature/api",
      merging: true
    }
  ])("should guard merge requests for $name", async ({ options, branchName, merging }) => {
    const fixture = createProjectGitReferencesFixture(options);
    fixture.gitStore.referencesStore.isMergingBranch = merging ?? false;

    const result = await fixture.gitStore.referencesStore.mergeBranch(createBranch(branchName));

    expect(result).toBe(false);
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it("should expose a merge error without refreshing status", async () => {
    const fixture = createProjectGitReferencesFixture();
    fixture.request.mockRejectedValueOnce(new Error("merge failed"));

    const result = await fixture.gitStore.referencesStore.mergeBranch(createBranch("feature/api"));

    expect(result).toBe(false);
    expect(requestTypes(fixture)).toEqual(["git.merge"]);
    expect(fixture.gitStore.referencesStore.branchErrorMessage).toBe("merge failed");
    expect(fixture.gitStore.referencesStore.isMergingBranch).toBe(false);
  });

  it("should refresh status and branches after a merge-to failure", async () => {
    const fixture = createProjectGitReferencesFixture();
    const refreshedStatus = createStatus({ branchName: "release" });
    const refreshedBranches = [createBranch("release", { isCurrent: true })];
    fixture.request
      .mockRejectedValueOnce(new Error("merge-to failed"))
      .mockResolvedValueOnce(refreshedStatus)
      .mockResolvedValueOnce(createTagResult())
      .mockResolvedValueOnce(refreshedBranches);

    const result = await fixture.gitStore.referencesStore.mergeBranchTo(createBranch("release"));
    await flushPromises();

    expect(result).toBe(false);
    expect(requestTypes(fixture)).toEqual([
      "git.merge.to",
      "git.status",
      "git.tags",
      "git.branches"
    ]);
    expect(fixture.gitStore.statusStore.status).toEqual(refreshedStatus);
    expect(fixture.gitStore.referencesStore.branches).toEqual(refreshedBranches);
    expect(fixture.gitStore.referencesStore.branchErrorMessage).toBe("merge-to failed");
    expect(fixture.gitStore.referencesStore.isMergingBranch).toBe(false);
  });

  it("should upsert a remote with raw fields and apply the returned status", async () => {
    const fixture = createProjectGitReferencesFixture();
    const status = createStatus({ remotes: [createRemote("origin")] });
    fixture.request.mockResolvedValueOnce(status);

    const saving = fixture.gitStore.referencesStore.upsertRemote(
      " origin ",
      " https://example.test/project.git "
    );
    expect(fixture.gitStore.referencesStore.isSavingRemote).toBe(true);
    const didSave = await saving;

    expect(didSave).toBe(true);
    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.remote.upsert",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      name: " origin ",
      url: " https://example.test/project.git "
    });
    expect(fixture.gitStore.statusStore.status).toEqual(status);
    expect(fixture.gitStore.referencesStore.isSavingRemote).toBe(false);
    expect(fixture.gitStore.referencesStore.remoteErrorMessage).toBe(null);
  });

  it("should clear loaded tags when a remote mutation returns no repository", async () => {
    const fixture = createProjectGitReferencesFixture();
    fixture.gitStore.tagStore.tags = [{
      name: "release",
      fullName: "refs/tags/release",
      targetHash: "release-hash",
      createdAt: null,
      remoteTargetHash: null,
      syncStatus: "local-only"
    }];
    fixture.gitStore.tagStore.tagsRemoteName = "origin";
    fixture.gitStore.tagStore.tagErrorMessage = "old tag error";
    fixture.gitStore.tagStore.tagSyncErrorMessage = "old tag warning";
    const status = createStatus({
      isRepository: false,
      branchName: null,
      upstreamName: null,
      remotes: []
    });
    fixture.request.mockResolvedValueOnce(status);

    const didSave = await fixture.gitStore.referencesStore.upsertRemote(
      "origin",
      "https://example.test/repo.git"
    );

    expect(didSave).toBe(true);
    expect(fixture.gitStore.statusStore.status).toEqual(status);
    expect(fixture.gitStore.tagStore.tags).toEqual([]);
    expect(fixture.gitStore.tagStore.tagsRemoteName).toBe(null);
    expect(fixture.gitStore.tagStore.tagErrorMessage).toBe(null);
    expect(fixture.gitStore.tagStore.tagSyncErrorMessage).toBe(null);
    expect(fixture.gitStore.tagStore.hasLoadedTags).toBe(true);
  });

  it.each([
    {
      name: "an unavailable source",
      options: { sourceReady: false },
      saving: false
    },
    {
      name: "a non-repository status",
      options: { status: createStatus({ isRepository: false }) },
      saving: false
    },
    {
      name: "a concurrent save",
      options: {},
      saving: true
    }
  ])("should guard remote upserts for $name", async ({ options, saving }) => {
    const fixture = createProjectGitReferencesFixture(options);
    fixture.gitStore.referencesStore.isSavingRemote = saving;

    const result = await fixture.gitStore.referencesStore.upsertRemote("origin", "https://example.test/repo.git");

    expect(result).toBe(false);
    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.gitStore.referencesStore.isSavingRemote).toBe(saving);
  });

  it("should expose a remote upsert error and reset its flag", async () => {
    const fixture = createProjectGitReferencesFixture();
    fixture.request.mockRejectedValueOnce(new Error("remote save failed"));

    const result = await fixture.gitStore.referencesStore.upsertRemote("origin", "https://example.test/repo.git");

    expect(result).toBe(false);
    expect(fixture.gitStore.referencesStore.remoteErrorMessage).toBe("remote save failed");
    expect(fixture.gitStore.referencesStore.isSavingRemote).toBe(false);
  });
});
