import { isObservableProp } from "mobx";
import { describe, expect, it } from "vitest";

import {
  createFile,
  createProjectGitStatusFixture,
  createRemote,
  createStatus,
  createTag,
  createTagResult,
  flushPromises
} from "./ProjectGitStatusStore.fixture";

describe("ProjectGitStore Git status", () => {
  it("should refresh repository status, load tags, and reset loading flags", async () => {
    const fixture = createProjectGitStatusFixture();
    const status = createStatus({
      aheadCount: 2,
      behindCount: 1,
      branchName: "feature/status",
      remotes: [createRemote("origin")],
      changedFiles: [createFile("src/changed.ts")],
      stagedFiles: [createFile("src/staged.ts", "added")]
    });
    fixture.request
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(createTagResult());

    const refresh = fixture.gitStore.statusStore.refresh;
    const loading = refresh();

    expect(fixture.gitStore.statusStore.isLoading).toBe(true);
    await loading;
    await flushPromises();

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.status",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "git.tags",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.gitStore.statusStore.status).toEqual(status);
    expect(fixture.gitStore.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.gitStore.statusStore.isLoading).toBe(false);
    expect(fixture.gitStore.statusStore.hasLoaded).toBe(true);
    expect(fixture.gitStore.errorMessage).toBe(null);
  });

  it("should initialize a repository with the exact payload and load tags", async () => {
    const fixture = createProjectGitStatusFixture();
    fixture.gitStore.changesStore.selectedChangedPaths = ["src/changed.ts", "gone.ts"];
    fixture.gitStore.changesStore.selectedStagedPaths = ["src/staged.ts", "gone-staged.ts"];
    const status = createStatus({
      pendingCommitMessage: "initial commit",
      changedFiles: [createFile("src/changed.ts")],
      stagedFiles: [createFile("src/staged.ts", "added")]
    });
    fixture.request
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(createTagResult());

    const initializing = fixture.gitStore.statusStore.initializeRepository();

    expect(fixture.gitStore.statusStore.isInitializingRepository).toBe(true);
    await initializing;
    await flushPromises();

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.init",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "git.tags",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.gitStore.statusStore.status).toEqual(status);
    expect(fixture.gitStore.commitStore.commitMessage).toBe("initial commit");
    expect(fixture.gitStore.changesStore.selectedChangedPaths).toEqual(["src/changed.ts"]);
    expect(fixture.gitStore.changesStore.selectedStagedPaths).toEqual(["src/staged.ts"]);
    expect(fixture.gitStore.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.gitStore.statusStore.isInitializingRepository).toBe(false);
    expect(fixture.gitStore.statusStore.hasLoaded).toBe(true);
  });

  it("should clear dependent tags when initialization does not produce a repository", async () => {
    const fixture = createProjectGitStatusFixture();
    fixture.gitStore.tagStore.tags = [createTag("old")];
    fixture.gitStore.tagStore.tagsRemoteName = "origin";
    fixture.gitStore.tagStore.tagSyncErrorMessage = "old warning";
    const status = createStatus({
      isRepository: false,
      branchName: null,
      upstreamName: null
    });
    fixture.request.mockResolvedValueOnce(status);

    await fixture.gitStore.statusStore.initializeRepository();

    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.init",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.gitStore.statusStore.status).toEqual(status);
    expect(fixture.gitStore.tagStore.tags).toEqual([]);
    expect(fixture.gitStore.tagStore.tagsRemoteName).toBe(null);
    expect(fixture.gitStore.tagStore.tagSyncErrorMessage).toBe(null);
    expect(fixture.gitStore.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.gitStore.statusStore.isInitializingRepository).toBe(false);
    expect(fixture.gitStore.statusStore.hasLoaded).toBe(true);
  });

  it("should guard initialization when unavailable or already in flight", async () => {
    const unavailableFixture = createProjectGitStatusFixture({ sourceReady: false });

    await unavailableFixture.gitStore.statusStore.initializeRepository();

    expect(unavailableFixture.request).not.toHaveBeenCalled();
    expect(unavailableFixture.gitStore.statusStore.isInitializingRepository).toBe(false);
    expect(unavailableFixture.gitStore.statusStore.hasLoaded).toBe(false);

    const fixture = createProjectGitStatusFixture();
    let resolveRequest: (value: unknown) => void = () => undefined;
    fixture.request
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveRequest = resolve;
      }))
      .mockResolvedValueOnce(createTagResult());

    const firstInitialization = fixture.gitStore.statusStore.initializeRepository();
    await fixture.gitStore.statusStore.initializeRepository();

    expect(fixture.request).toHaveBeenCalledTimes(1);
    expect(fixture.gitStore.statusStore.isInitializingRepository).toBe(true);
    resolveRequest(createStatus());
    await firstInitialization;
    await flushPromises();

    expect(fixture.gitStore.statusStore.isInitializingRepository).toBe(false);
    expect(fixture.gitStore.statusStore.hasLoaded).toBe(true);
  });

  it("should expose initialization errors and reset its final flags", async () => {
    const fixture = createProjectGitStatusFixture();
    fixture.request.mockRejectedValueOnce(new Error("initialization failed"));

    await fixture.gitStore.statusStore.initializeRepository();

    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.init",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.gitStore.errorMessage).toBe("initialization failed");
    expect(fixture.gitStore.statusStore.isInitializingRepository).toBe(false);
    expect(fixture.gitStore.statusStore.hasLoaded).toBe(true);
    expect(fixture.gitStore.tagStore.isLoadingTags).toBe(false);
  });

  it("should clear dependent tags when refresh discovers a non-repository", async () => {
    const fixture = createProjectGitStatusFixture();
    fixture.gitStore.tagStore.tags = [createTag("old")];
    fixture.gitStore.tagStore.tagsRemoteName = "origin";
    fixture.gitStore.tagStore.tagSyncErrorMessage = "old warning";
    const status = createStatus({
      isRepository: false,
      branchName: null,
      upstreamName: null,
      remotes: []
    });
    fixture.request.mockResolvedValueOnce(status);

    await fixture.gitStore.statusStore.refresh();

    expect(fixture.request).toHaveBeenCalledTimes(1);
    expect(fixture.gitStore.statusStore.status).toEqual(status);
    expect(fixture.gitStore.tagStore.tags).toEqual([]);
    expect(fixture.gitStore.tagStore.tagsRemoteName).toBe(null);
    expect(fixture.gitStore.tagStore.tagSyncErrorMessage).toBe(null);
    expect(fixture.gitStore.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.gitStore.statusStore.isLoading).toBe(false);
    expect(fixture.gitStore.statusStore.hasLoaded).toBe(true);
  });

  it("should reset status without requesting when the source is unavailable", async () => {
    const fixture = createProjectGitStatusFixture({
      sourceReady: false,
      status: createStatus({ branchName: "feature/status" })
    });

    await fixture.gitStore.statusStore.refresh();

    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.gitStore.statusStore.status).toEqual({
      isRepository: false,
      aheadCount: 0,
      behindCount: 0,
      branchName: null,
      upstreamName: null,
      pendingCommitMessage: null,
      remotes: [],
      changedFiles: [],
      stagedFiles: []
    });
    expect(fixture.gitStore.statusStore.hasLoaded).toBe(true);
    expect(fixture.gitStore.statusStore.isLoading).toBe(false);
  });

  it("should expose refresh errors and reset status loading flags", async () => {
    const previousStatus = createStatus({ branchName: "stable" });
    const fixture = createProjectGitStatusFixture({ status: previousStatus });
    let rejectRequest: (reason?: unknown) => void = () => undefined;
    fixture.request.mockReturnValueOnce(new Promise((_resolve, reject) => {
      rejectRequest = reject;
    }));

    const refresh = fixture.gitStore.statusStore.refresh();

    expect(fixture.gitStore.statusStore.isLoading).toBe(true);
    rejectRequest(new Error("status failed"));
    await refresh;

    expect(fixture.gitStore.statusStore.status).toEqual(previousStatus);
    expect(fixture.gitStore.errorMessage).toBe("status failed");
    expect(fixture.gitStore.statusStore.isLoading).toBe(false);
    expect(fixture.gitStore.statusStore.hasLoaded).toBe(true);
    expect(fixture.gitStore.tagStore.isLoadingTags).toBe(false);
  });

  it("should apply a pending commit message only while the editor is blank", async () => {
    const fixture = createProjectGitStatusFixture();
    fixture.gitStore.commitStore.commitMessage = "   ";
    fixture.request
      .mockResolvedValueOnce(createStatus({ pendingCommitMessage: "pending message" }))
      .mockResolvedValueOnce(createTagResult())
      .mockResolvedValueOnce(createStatus({ pendingCommitMessage: "new pending message" }))
      .mockResolvedValueOnce(createTagResult());

    await fixture.gitStore.statusStore.refresh();
    await flushPromises();
    expect(fixture.gitStore.commitStore.commitMessage).toBe("pending message");

    fixture.gitStore.commitStore.setCommitMessage("manual message");
    await fixture.gitStore.statusStore.refresh();
    await flushPromises();

    expect(fixture.gitStore.commitStore.commitMessage).toBe("manual message");
  });

  it("should reconcile changed and staged selections with the applied status", async () => {
    const fixture = createProjectGitStatusFixture();
    fixture.gitStore.changesStore.deferredPaths = ["deferred.ts"];
    fixture.gitStore.changesStore.selectedChangedPaths = ["keep.ts", "deferred.ts", "gone.ts"];
    fixture.gitStore.changesStore.selectedStagedPaths = ["staged.ts", "gone-staged.ts"];
    fixture.request
      .mockResolvedValueOnce(createStatus({
        changedFiles: [
          createFile("keep.ts"),
          createFile("deferred.ts"),
          createFile("new.ts")
        ],
        stagedFiles: [createFile("staged.ts", "added")]
      }))
      .mockResolvedValueOnce(createTagResult());

    await fixture.gitStore.statusStore.refresh();
    await flushPromises();

    expect(fixture.gitStore.changesStore.selectedChangedPaths).toEqual(["keep.ts"]);
    expect(fixture.gitStore.changesStore.selectedStagedPaths).toEqual(["staged.ts"]);
  });

  it("should expose observable status fields and bind detached refresh calls", async () => {
    const fixture = createProjectGitStatusFixture();
    fixture.request.mockResolvedValueOnce(createStatus({ isRepository: false }));

    for (const property of ["status", "hasLoaded", "isLoading", "isInitializingRepository"]) {
      expect(isObservableProp(fixture.gitStore.statusStore, property)).toBe(true);
    }
    expect(isObservableProp(fixture.gitStore, "errorMessage")).toBe(true);

    const refresh = fixture.gitStore.statusStore.refresh;
    await refresh();

    expect(fixture.gitStore.statusStore.hasLoaded).toBe(true);
    expect(fixture.gitStore.statusStore.isLoading).toBe(false);
  });
});
