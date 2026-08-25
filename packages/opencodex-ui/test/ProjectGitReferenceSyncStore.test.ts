import { isComputedProp, isObservableProp } from "mobx";
import { describe, expect, it } from "vitest";

import type { ProjectGitReferencesStore } from "../src/stores/project/git/ProjectGitReferencesStore";
import {
  createBranch,
  createDeferred,
  createProjectGitReferencesFixture,
  createRemote,
  createStatus,
  createTagResult,
  flushPromises,
  requestTypes
} from "./ProjectGitReferencesStore.fixture";

type SyncOperation = "push" | "pull" | "publish";

describe("ProjectGitReferencesStore Git synchronization", () => {
  it("should expose observable flags, computed predicates, and preferred remotes", () => {
    const fixture = createProjectGitReferencesFixture({
      status: createStatus({
        aheadCount: 2,
        behindCount: 3,
        remotes: [createRemote("backup"), createRemote("origin")]
      })
    });

    for (const property of ["isPushing", "isPulling"]) {
      expect(isObservableProp(fixture.gitStore.referencesStore, property)).toBe(true);
    }
    for (const property of ["canPush", "canPull", "canPublishBranch", "primaryRemote"]) {
      expect(isComputedProp(fixture.gitStore.referencesStore, property)).toBe(true);
    }
    expect(isObservableProp(fixture.gitStore, "errorMessage")).toBe(true);

    expect(fixture.gitStore.referencesStore.canPush).toBe(true);
    expect(fixture.gitStore.referencesStore.canPull).toBe(true);
    expect(fixture.gitStore.referencesStore.canPublishBranch).toBe(false);
    expect(fixture.gitStore.referencesStore.primaryRemote?.name).toBe("origin");

    fixture.gitStore.referencesStore.isPushing = true;
    expect(fixture.gitStore.referencesStore.canPush).toBe(false);
    expect(fixture.gitStore.referencesStore.canPull).toBe(true);

    fixture.gitStore.referencesStore.isPushing = false;
    fixture.gitStore.statusStore.applyStatus(createStatus({
      branchName: "feature/api",
      upstreamName: null,
      remotes: [createRemote("backup")]
    }));
    expect(fixture.gitStore.referencesStore.canPublishBranch).toBe(true);
    expect(fixture.gitStore.referencesStore.primaryRemote?.name).toBe("backup");

    fixture.gitStore.statusStore.applyStatus(createStatus({
      branchName: "feature/api",
      upstreamName: null,
      remotes: []
    }));
    expect(fixture.gitStore.referencesStore.canPublishBranch).toBe(false);
    expect(fixture.gitStore.referencesStore.primaryRemote).toBe(null);
  });

  it.each([
    {
      name: "push without ahead commits",
      operation: "push" as SyncOperation,
      status: createStatus({ aheadCount: 0 })
    },
    {
      name: "pull without behind commits",
      operation: "pull" as SyncOperation,
      status: createStatus({ behindCount: 0 })
    },
    {
      name: "publish with an upstream",
      operation: "publish" as SyncOperation,
      status: createStatus({ remotes: [createRemote("origin")] })
    }
  ])("should guard $name", async ({ operation, status }) => {
    const fixture = createProjectGitReferencesFixture({ status });

    await invokeSyncOperation(fixture.gitStore.referencesStore, operation);

    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.gitStore.referencesStore.isPushing).toBe(false);
    expect(fixture.gitStore.referencesStore.isPulling).toBe(false);
  });

  it.each([
    {
      name: "push",
      operation: "push" as const,
      requestType: "git.push" as const,
      initial: createStatus({ aheadCount: 2 }),
      next: createStatus({ aheadCount: 0 })
    },
    {
      name: "pull",
      operation: "pull" as const,
      requestType: "git.pull" as const,
      initial: createStatus({ behindCount: 2 }),
      next: createStatus({ behindCount: 0 })
    }
  ])("should run $name and finish before fire-and-forget tags", async ({
    operation,
    requestType,
    initial,
    next
  }) => {
    const fixture = createProjectGitReferencesFixture({ status: initial });
    const tags = createDeferred(createTagResult());
    fixture.request
      .mockResolvedValueOnce(next)
      .mockReturnValueOnce(tags.promise);

    const synchronization = invokeSyncOperation(fixture.gitStore.referencesStore, operation);
    if (operation === "push") {
      expect(fixture.gitStore.referencesStore.isPushing).toBe(true);
    } else {
      expect(fixture.gitStore.referencesStore.isPulling).toBe(true);
    }

    await synchronization;

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: requestType,
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(requestTypes(fixture)).toEqual([requestType, "git.tags"]);
    expect(fixture.gitStore.statusStore.status).toEqual(next);
    expect(fixture.gitStore.tagStore.isLoadingTags).toBe(true);
    expect(fixture.gitStore.tagStore.hasLoadedTags).toBe(false);
    expect(fixture.gitStore.referencesStore.isPushing).toBe(false);
    expect(fixture.gitStore.referencesStore.isPulling).toBe(false);

    tags.resolve(createTagResult());
    await flushPromises();
    expect(fixture.gitStore.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.gitStore.tagStore.isLoadingTags).toBe(false);
  });

  it("should publish, await branches, and leave tags fire-and-forget", async () => {
    const fixture = createProjectGitReferencesFixture({
      status: createStatus({
        branchName: "feature/api",
        upstreamName: null,
        remotes: [createRemote("origin")]
      })
    });
    const next = createStatus({
      branchName: "feature/api",
      upstreamName: "origin/feature/api",
      remotes: [createRemote("origin")]
    });
    const branches = [createBranch("feature/api", {
      isCurrent: true,
      upstreamName: "origin/feature/api"
    })];
    const tags = createDeferred(createTagResult());
    fixture.request
      .mockResolvedValueOnce(next)
      .mockResolvedValueOnce(branches)
      .mockReturnValueOnce(tags.promise);

    const publish = fixture.gitStore.referencesStore.publishBranch;
    const publication = publish();
    expect(fixture.gitStore.referencesStore.isPushing).toBe(true);
    await publication;

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.branch.publish",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(requestTypes(fixture)).toEqual([
      "git.branch.publish",
      "git.branches",
      "git.tags"
    ]);
    expect(fixture.gitStore.statusStore.status).toEqual(next);
    expect(fixture.gitStore.referencesStore.branches).toEqual(branches);
    expect(fixture.gitStore.tagStore.isLoadingTags).toBe(true);
    expect(fixture.gitStore.referencesStore.isPushing).toBe(false);

    tags.resolve(createTagResult());
    await flushPromises();
    expect(fixture.gitStore.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.gitStore.tagStore.isLoadingTags).toBe(false);
  });

  it.each([
    {
      name: "push",
      operation: "push" as const,
      requestType: "git.push" as const,
      status: createStatus({ aheadCount: 1 })
    },
    {
      name: "pull",
      operation: "pull" as const,
      requestType: "git.pull" as const,
      status: createStatus({ behindCount: 1 })
    },
    {
      name: "publish",
      operation: "publish" as const,
      requestType: "git.branch.publish" as const,
      status: createStatus({
        branchName: "feature/api",
        upstreamName: null,
        remotes: [createRemote("origin")]
      })
    }
  ])("should expose a generic $name error and reset its flag", async ({
    operation,
    requestType,
    status
  }) => {
    const fixture = createProjectGitReferencesFixture({ status });
    fixture.request.mockRejectedValueOnce(new Error(`${operation} failed`));

    const synchronization = invokeSyncOperation(fixture.gitStore.referencesStore, operation);
    if (operation === "pull") {
      expect(fixture.gitStore.referencesStore.isPulling).toBe(true);
    } else {
      expect(fixture.gitStore.referencesStore.isPushing).toBe(true);
    }
    await synchronization;

    expect(requestTypes(fixture)).toEqual([requestType]);
    expect(fixture.gitStore.errorMessage).toBe(`${operation} failed`);
    expect(fixture.gitStore.referencesStore.isPushing).toBe(false);
    expect(fixture.gitStore.referencesStore.isPulling).toBe(false);
    expect(fixture.gitStore.statusStore.status).toEqual(status);
  });
});

/** Invokes one synchronization action through a detached, auto-bound method. */
async function invokeSyncOperation(
  referencesStore: ProjectGitReferencesStore,
  operation: SyncOperation
): Promise<void> {
  let run: () => Promise<void>;

  switch (operation) {
    case "push":
      run = referencesStore.push;
      break;
    case "pull":
      run = referencesStore.pull;
      break;
    case "publish":
      run = referencesStore.publishBranch;
      break;
  }

  await run();
}
