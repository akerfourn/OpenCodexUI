import { describe, expect, it } from "vitest";
import { isObservableProp } from "mobx";

import {
  createFixture,
  createPreferences,
  createProject,
  createStatus,
  createTag,
  expectTagStateCleared,
  flushPromises,
  seedTagState
} from "./ProjectGitTagStore.fixture";
import type { Fixture } from "./ProjectGitTagStore.fixture";

describe("ProjectGitTagStore tags", () => {
  it("should load tags and expose remote metadata and loading flags", async () => {
    const fixture = createFixture();
    const tags = [createTag("v1.0.0", "synced")];
    let resolveRequest: (value: unknown) => void = () => undefined;
    fixture.request.mockReturnValueOnce(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const loading = fixture.tagStore.loadTags();

    expect(fixture.tagStore.isLoadingTags).toBe(true);
    resolveRequest({ tags, remoteName: "origin", remoteError: "remote warning" });
    await loading;

    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.tags",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.tagStore.tags).toEqual(tags);
    expect(fixture.tagStore.tagsRemoteName).toBe("origin");
    expect(fixture.tagStore.tagSyncErrorMessage).toBe("remote warning");
    expect(fixture.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.tagStore.isLoadingTags).toBe(false);
  });

  it("should clear tags when loading a non-repository project", async () => {
    const fixture = createFixture({ isRepository: false });
    seedTagState(fixture.tagStore);

    await fixture.tagStore.loadTags();

    expect(fixture.request).not.toHaveBeenCalled();
    expectTagStateCleared(fixture.tagStore, false);
    expect(fixture.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.tagStore.isLoadingTags).toBe(false);
  });

  it("should clear tags when the Codex source is unavailable", async () => {
    const fixture = createFixture({ sourceReady: false });
    seedTagState(fixture.tagStore);

    await fixture.tagStore.loadTags();

    expect(fixture.request).not.toHaveBeenCalled();
    expectTagStateCleared(fixture.tagStore, false);
    expect(fixture.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.tagStore.isLoadingTags).toBe(false);
  });

  it("should expose a load error and reset the loading flags", async () => {
    const fixture = createFixture();
    fixture.request.mockRejectedValueOnce(new Error("tag list failed"));

    await fixture.tagStore.loadTags();

    expect(fixture.tagStore.tagErrorMessage).toBe("tag list failed");
    expect(fixture.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.tagStore.isLoadingTags).toBe(false);
  });

  it("should fetch tags, apply the result, and report non-fatal warnings", async () => {
    const fixture = createFixture();
    const result = {
      tags: [createTag("v2.0.0", "local-only")],
      remoteName: "upstream",
      remoteError: null,
      warning: "fetch used a partial remote"
    };
    fixture.request.mockResolvedValueOnce(result).mockResolvedValue(undefined);

    await fixture.tagStore.fetchTags();

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.tags.fetch",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.tagStore.tags).toEqual(result.tags);
    expect(fixture.tagStore.tagsRemoteName).toBe("upstream");
    expect(fixture.tagStore.tagSyncErrorMessage).toBe(null);
    expect(fixture.root.appStore.showWarningMessage).toHaveBeenCalledWith(result.warning);
    expect(fixture.request).toHaveBeenCalledWith({
      type: "logs.create",
      logType: "warning",
      message: result.warning,
      details: {
        projectPath: "/workspace/project",
        sourceId: "source-1"
      }
    });
    expect(fixture.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.tagStore.isFetchingTags).toBe(false);
  });

  it("should guard fetches while tags are unavailable or busy", async () => {
    const cases: Array<{
      configure: (fixture: Fixture) => void;
      fetchingAfterGuard: boolean;
    }> = [
      { configure: (fixture) => { fixture.setSourceReady(false); }, fetchingAfterGuard: false },
      { configure: (fixture) => { fixture.gitStore.statusStore.status = createStatus(false); }, fetchingAfterGuard: false },
      { configure: (fixture) => { fixture.tagStore.isFetchingTags = true; }, fetchingAfterGuard: true },
      { configure: (fixture) => { fixture.tagStore.pushingTagName = "v1.0.0"; }, fetchingAfterGuard: false },
      { configure: (fixture) => { fixture.tagStore.isPushingAllTags = true; }, fetchingAfterGuard: false }
    ];

    for (const { configure, fetchingAfterGuard } of cases) {
      const fixture = createFixture();
      configure(fixture);
      await fixture.tagStore.fetchTags();
      expect(fixture.request).not.toHaveBeenCalled();
      expect(fixture.tagStore.isFetchingTags).toBe(fetchingAfterGuard);
    }
  });

  it("should create a trimmed tag, select it, count commits, and persist preferences", async () => {
    const fixture = createFixture({ preferences: createPreferences() });
    fixture.tagStore.selectedReferenceTagName = null;
    const project = createProject(fixture.projectStore.project.preferences);
    fixture.request
      .mockResolvedValueOnce({
        tags: [createTag("release-1", "local-only")],
        remoteName: "origin",
        remoteError: null
      })
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(project);

    const created = await fixture.tagStore.createTag("  release-1  ");
    await flushPromises();

    expect(created).toBe(true);
    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.tag.create",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      tagName: "release-1"
    });
    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "git.tag.commitsSince",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      tagName: "release-1"
    });
    expect(fixture.request).toHaveBeenNthCalledWith(3, {
      type: "projects.preferences.update",
      projectId: "project-1",
      patch: {
        git: {
          referenceTagName: "release-1",
          deferredPaths: ["dist"]
        },
        context: {
          permissionsProfileId: "profile-1",
          folders: [{ id: "folder-1", path: "docs", label: "Docs", enabled: true }],
          lastSyncedAt: "2026-01-02T00:00:00.000Z"
        }
      }
    });
    expect(fixture.tagStore.tags).toEqual([createTag("release-1", "local-only")]);
    expect(fixture.tagStore.selectedReferenceTagName).toBe("release-1");
    expect(fixture.tagStore.commitsSinceReferenceTag).toBe(7);
    expect(fixture.tagStore.isCreatingTag).toBe(false);
    expect(fixture.projectStore.setProject).toHaveBeenCalledWith(project);
  });

  it("should reject empty or unavailable tag creation without requesting", async () => {
    const emptyFixture = createFixture();
    expect(await emptyFixture.tagStore.createTag("   ")).toBe(false);
    expect(emptyFixture.request).not.toHaveBeenCalled();

    const unavailableFixture = createFixture({ sourceReady: false });
    expect(await unavailableFixture.tagStore.createTag("v1.0.0")).toBe(false);
    expect(unavailableFixture.request).not.toHaveBeenCalled();
  });

  it("should expose tag creation errors and reset the creating flag", async () => {
    const fixture = createFixture();
    fixture.request.mockRejectedValueOnce(new Error("create failed"));

    expect(await fixture.tagStore.createTag("v1.0.0")).toBe(false);

    expect(fixture.tagStore.tagErrorMessage).toBe("create failed");
    expect(fixture.tagStore.isCreatingTag).toBe(false);
  });

  it("should push one trimmed tag with the requested force mode", async () => {
    const fixture = createFixture();
    const result = {
      tags: [createTag("v1.0.0", "synced")],
      remoteName: "origin",
      remoteError: null
    };
    fixture.request.mockResolvedValueOnce(result);

    const pushing = fixture.tagStore.pushTag("  v1.0.0  ", true);
    expect(fixture.tagStore.pushingTagName).toBe("v1.0.0");
    expect(fixture.tagStore.isPushingTag("v1.0.0")).toBe(true);
    expect(await pushing).toBe(true);

    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.tag.push",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      tagName: "v1.0.0",
      force: true
    });
    expect(fixture.tagStore.tags).toEqual(result.tags);
    expect(fixture.tagStore.tagsRemoteName).toBe("origin");
    expect(fixture.tagStore.pushingTagName).toBe(null);
    expect(fixture.tagStore.isPushingTag("v1.0.0")).toBe(false);
  });

  it("should guard one-tag pushes when the store is unavailable or busy", async () => {
    const cases: Array<(fixture: Fixture) => void> = [
      (fixture) => { fixture.setSourceReady(false); },
      (fixture) => { fixture.gitStore.statusStore.status = createStatus(false); },
      (fixture) => { fixture.tagStore.pushingTagName = "other"; },
      (fixture) => { fixture.tagStore.isPushingAllTags = true; },
      (fixture) => { fixture.tagStore.isFetchingTags = true; },
      (fixture) => { fixture.tagStore.isLoadingTags = true; }
    ];

    for (const configure of cases) {
      const fixture = createFixture();
      configure(fixture);
      expect(await fixture.tagStore.pushTag("v1.0.0")).toBe(false);
      expect(fixture.request).not.toHaveBeenCalled();
    }

    const emptyFixture = createFixture();
    expect(await emptyFixture.tagStore.pushTag("   ")).toBe(false);
    expect(emptyFixture.request).not.toHaveBeenCalled();
  });

  it("should expose one-tag push errors and clear the active tag", async () => {
    const fixture = createFixture();
    fixture.request.mockRejectedValueOnce(new Error("push failed"));

    expect(await fixture.tagStore.pushTag("v1.0.0")).toBe(false);

    expect(fixture.tagStore.tagErrorMessage).toBe("push failed");
    expect(fixture.tagStore.pushingTagName).toBe(null);
  });

  it("should push all eligible tags through canPushTags", async () => {
    const fixture = createFixture();
    fixture.tagStore.tagsRemoteName = "origin";
    fixture.tagStore.tags = [createTag("v1.0.0", "local-only")];
    const result = {
      tags: [createTag("v1.0.0", "synced")],
      remoteName: "origin",
      remoteError: null
    };
    fixture.request.mockResolvedValueOnce(result);

    expect(fixture.tagStore.canPushTags).toBe(true);
    expect(await fixture.tagStore.pushTags()).toBe(true);

    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.tags.push",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.tagStore.tags).toEqual(result.tags);
    expect(fixture.tagStore.isPushingAllTags).toBe(false);
  });

  it("should guard pushing all tags when canPushTags is false", async () => {
    const fixture = createFixture();
    fixture.tagStore.tagsRemoteName = "origin";
    fixture.tagStore.tags = [createTag("v1.0.0", "synced")];

    expect(fixture.tagStore.canPushTags).toBe(false);
    expect(await fixture.tagStore.pushTags()).toBe(false);
    expect(fixture.request).not.toHaveBeenCalled();
  });

  it("should expose all-tag push errors and reset its flag", async () => {
    const fixture = createFixture();
    fixture.tagStore.tagsRemoteName = "origin";
    fixture.tagStore.tags = [createTag("v1.0.0", "diverged")];
    fixture.request.mockRejectedValueOnce(new Error("push all failed"));

    expect(await fixture.tagStore.pushTags()).toBe(false);

    expect(fixture.tagStore.tagErrorMessage).toBe("push all failed");
    expect(fixture.tagStore.isPushingAllTags).toBe(false);
  });

  it("should select a trimmed reference, load its count, and persist it", async () => {
    const fixture = createFixture({ preferences: createPreferences() });
    const project = createProject(fixture.projectStore.project.preferences);
    fixture.request.mockResolvedValueOnce(12).mockResolvedValueOnce(project);

    expect(await fixture.tagStore.selectReferenceTag("  v1.2.0 ")).toBe(true);
    await flushPromises();

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.tag.commitsSince",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      tagName: "v1.2.0"
    });
    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "projects.preferences.update",
      projectId: "project-1",
      patch: expect.objectContaining({
        git: expect.objectContaining({ referenceTagName: "v1.2.0" })
      })
    });
    expect(fixture.tagStore.selectedReferenceTagName).toBe("v1.2.0");
    expect(fixture.tagStore.commitsSinceReferenceTag).toBe(12);
  });

  it("should expose reference-count errors without persisting the failed selection", async () => {
    const fixture = createFixture();
    fixture.request.mockRejectedValueOnce(new Error("count failed"));

    expect(await fixture.tagStore.selectReferenceTag("v1.2.0")).toBe(false);

    expect(fixture.tagStore.selectedReferenceTagName).toBe("v1.2.0");
    expect(fixture.tagStore.commitsSinceReferenceTag).toBe(null);
    expect(fixture.tagStore.tagErrorMessage).toBe("count failed");
    expect(fixture.tagStore.isLoadingTagReference).toBe(false);
    expect(fixture.request).toHaveBeenCalledTimes(1);
  });

  it("should guard empty or unavailable reference selections", async () => {
    const fixture = createFixture();
    expect(await fixture.tagStore.selectReferenceTag("  ")).toBe(false);
    expect(fixture.request).not.toHaveBeenCalled();

    const unavailableFixture = createFixture({ sourceReady: false });
    expect(await unavailableFixture.tagStore.selectReferenceTag("v1.0.0")).toBe(false);
    expect(unavailableFixture.request).not.toHaveBeenCalled();
  });

  it("should persist a null reference when a loaded list removes the selection", async () => {
    const fixture = createFixture({ preferences: createPreferences() });
    fixture.tagStore.selectedReferenceTagName = "gone";
    fixture.tagStore.commitsSinceReferenceTag = 4;
    const project = createProject(fixture.projectStore.project.preferences);
    fixture.request
      .mockResolvedValueOnce({
        tags: [createTag("still-here", "synced")],
        remoteName: "origin",
        remoteError: "cannot compare one tag"
      })
      .mockResolvedValueOnce(project);

    await fixture.tagStore.loadTags();
    await flushPromises();

    expect(fixture.tagStore.selectedReferenceTagName).toBe(null);
    expect(fixture.tagStore.commitsSinceReferenceTag).toBe(null);
    expect(fixture.tagStore.tagsRemoteName).toBe("origin");
    expect(fixture.tagStore.tagSyncErrorMessage).toBe("cannot compare one tag");
    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "projects.preferences.update",
      projectId: "project-1",
      patch: expect.objectContaining({
        git: expect.objectContaining({ referenceTagName: null })
      })
    });
  });

  it("should clear tags indirectly when refresh discovers a non-repository", async () => {
    const fixture = createFixture();
    seedTagState(fixture.tagStore);
    fixture.request.mockResolvedValueOnce(createStatus(false));

    await fixture.gitStore.statusStore.refresh();

    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.status",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expectTagStateCleared(fixture.tagStore);
    expect(fixture.gitStore.statusStore.hasLoaded).toBe(true);
    expect(fixture.gitStore.statusStore.isLoading).toBe(false);
  });

  it("should expose observable tag state and bind detached methods", async () => {
    const fixture = createFixture();
    fixture.request.mockResolvedValueOnce({
      tags: [createTag("v1.0.0", "synced")],
      remoteName: "origin",
      remoteError: null
    });

    for (const property of [
      "tags",
      "tagsRemoteName",
      "selectedReferenceTagName",
      "commitsSinceReferenceTag",
      "hasLoadedTags",
      "isLoadingTags",
      "isFetchingTags",
      "isCreatingTag",
      "pushingTagName",
      "isPushingAllTags",
      "tagErrorMessage",
      "tagSyncErrorMessage"
    ]) {
      expect(isObservableProp(fixture.tagStore, property)).toBe(true);
    }

    const loadTags = fixture.tagStore.loadTags;
    await loadTags();

    expect(fixture.tagStore.tags).toHaveLength(1);
    expect(fixture.tagStore.isLoadingTags).toBe(false);
  });

  it("should expose tag eligibility and active-tag predicates", () => {
    const fixture = createFixture();
    const localOnly = createTag("local", "local-only");
    const diverged = createTag("diverged", "diverged");
    const synced = createTag("synced", "synced");
    fixture.tagStore.tagsRemoteName = "origin";
    fixture.tagStore.tags = [localOnly, diverged, synced];

    expect(fixture.tagStore.canPushTags).toBe(true);
    expect(fixture.tagStore.canPushTag(localOnly)).toBe(true);
    expect(fixture.tagStore.canPushTag(diverged)).toBe(true);
    expect(fixture.tagStore.canPushTag(synced)).toBe(false);

    fixture.tagStore.pushingTagName = "local";
    expect(fixture.tagStore.canPushTags).toBe(false);
    expect(fixture.tagStore.canPushTag(localOnly)).toBe(false);
    expect(fixture.tagStore.isPushingTag("local")).toBe(true);
    expect(fixture.tagStore.isPushingTag("other")).toBe(false);
  });
});
