import { describe, expect, it } from "vitest";
import { isObservableProp } from "mobx";

import type { OpenCodexProjectPreferences } from "@open-codex-ui/opencodex-protocol";

import {
  createFixture,
  createPreferences,
  createProject,
  createStatus,
  createTag,
  flushPromises
} from "./ProjectGitTagStore.fixture";

describe("ProjectGitTagStore tag references", () => {
  it("should retain an existing reference and load its count after local tags", async () => {
    const fixture = createFixture({ preferences: referencePreferences("v1.0.0") });
    fixture.request
      .mockResolvedValueOnce({
        tags: [createTag("v1.0.0", "synced")],
        remoteName: "origin",
        remoteError: null
      })
      .mockResolvedValueOnce(9);

    await fixture.tagStore.loadTags();

    expect(fixture.request.mock.calls.map(([request]) => request.type)).toEqual([
      "git.tags",
      "git.tag.commitsSince"
    ]);
    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.tags",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "git.tag.commitsSince",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      tagName: "v1.0.0"
    });
    expect(fixture.tagStore.selectedReferenceTagName).toBe("v1.0.0");
    expect(fixture.tagStore.commitsSinceReferenceTag).toBe(9);
    expect(fixture.tagStore.isLoadingTags).toBe(false);
    expect(fixture.tagStore.isLoadingTagReference).toBe(false);
  });

  it("should fetch with a reference, log its warning, then load the count", async () => {
    const fixture = createFixture({ preferences: referencePreferences("v1.0.0") });
    const result = {
      tags: [createTag("v1.0.0", "synced")],
      remoteName: "origin",
      remoteError: null,
      warning: "remote fetch warning"
    };
    fixture.request
      .mockResolvedValueOnce(result)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(4);

    await fixture.tagStore.fetchTags();

    expect(fixture.request.mock.calls.map(([request]) => request.type)).toEqual([
      "git.tags.fetch",
      "logs.create",
      "git.tag.commitsSince"
    ]);
    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.tags.fetch",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "logs.create",
      logType: "warning",
      message: "remote fetch warning",
      details: { projectPath: "/workspace/project", sourceId: "source-1" }
    });
    expect(fixture.request).toHaveBeenNthCalledWith(3, {
      type: "git.tag.commitsSince",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      tagName: "v1.0.0"
    });
    expect(fixture.root.appStore.showWarningMessage).toHaveBeenCalledWith("remote fetch warning");
    expect(fixture.tagStore.commitsSinceReferenceTag).toBe(4);
    expect(fixture.tagStore.isFetchingTags).toBe(false);
    expect(fixture.tagStore.isLoadingTagReference).toBe(false);
    expect(fixture.tagStore.hasLoadedTags).toBe(true);
  });

  it("should not log a fetch result whose warning is null", async () => {
    const fixture = createFixture({ preferences: referencePreferences("v1.0.0") });
    fixture.request
      .mockResolvedValueOnce({
        tags: [createTag("v1.0.0", "synced")],
        remoteName: "origin",
        remoteError: null,
        warning: null
      })
      .mockResolvedValueOnce(2);

    await fixture.tagStore.fetchTags();

    expect(fixture.root.appStore.showWarningMessage).not.toHaveBeenCalled();
    expect(fixture.request).not.toHaveBeenCalledWith(expect.objectContaining({ type: "logs.create" }));
    expect(fixture.tagStore.commitsSinceReferenceTag).toBe(2);
  });

  it("should keep the created reference and return true when counting it fails", async () => {
    const fixture = createFixture();
    fixture.request
      .mockResolvedValueOnce({
        tags: [createTag("release-1", "local-only")],
        remoteName: "origin",
        remoteError: null
      })
      .mockRejectedValueOnce(new Error("count failed"));

    expect(await fixture.tagStore.createTag(" release-1 ")).toBe(true);

    expect(fixture.request).toHaveBeenCalledTimes(2);
    expect(fixture.tagStore.selectedReferenceTagName).toBe("release-1");
    expect(fixture.tagStore.commitsSinceReferenceTag).toBe(null);
    expect(fixture.tagStore.tagErrorMessage).toBe("count failed");
    expect(fixture.tagStore.isCreatingTag).toBe(false);
    expect(fixture.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "projects.preferences.update" })
    );
  });

  it("should expose a reference persistence failure after successful counting", async () => {
    const fixture = createFixture();
    fixture.request
      .mockResolvedValueOnce(6)
      .mockRejectedValueOnce(new Error("preference update failed"));

    expect(await fixture.tagStore.selectReferenceTag("v1.0.0")).toBe(true);
    await flushPromises();

    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "projects.preferences.update",
      projectId: "project-1",
      patch: expect.objectContaining({
        git: expect.objectContaining({ referenceTagName: "v1.0.0" })
      })
    });
    expect(fixture.tagStore.tagErrorMessage).toBe("preference update failed");
    expect(fixture.tagStore.selectedReferenceTagName).toBe("v1.0.0");
    expect(fixture.tagStore.commitsSinceReferenceTag).toBe(6);
  });

  it("should preserve every unrelated preference field for selection and removal", async () => {
    const preferences = createPreferences();
    const fixture = createFixture({ preferences });
    const persistedProject = createProject(preferences);
    fixture.request.mockResolvedValueOnce(3).mockResolvedValueOnce(persistedProject);

    await fixture.tagStore.selectReferenceTag("new");
    await flushPromises();

    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "projects.preferences.update",
      projectId: "project-1",
      patch: {
        git: { referenceTagName: "new", deferredPaths: ["dist"] },
        context: {
          permissionsProfileId: "profile-1",
          folders: [{ id: "folder-1", path: "docs", label: "Docs", enabled: true }],
          lastSyncedAt: "2026-01-02T00:00:00.000Z"
        }
      }
    });

    fixture.tagStore.selectedReferenceTagName = "gone";
    fixture.tagStore.commitsSinceReferenceTag = 8;
    fixture.request.mockResolvedValueOnce({
      tags: [createTag("still-here", "synced")],
      remoteName: "origin",
      remoteError: "comparison unavailable"
    });
    fixture.request.mockResolvedValueOnce(persistedProject);

    await fixture.tagStore.loadTags();
    await flushPromises();

    expect(fixture.request).toHaveBeenLastCalledWith({
      type: "projects.preferences.update",
      projectId: "project-1",
      patch: {
        git: { referenceTagName: null, deferredPaths: ["dist"] },
        context: {
          permissionsProfileId: "profile-1",
          folders: [{ id: "folder-1", path: "docs", label: "Docs", enabled: true }],
          lastSyncedAt: "2026-01-02T00:00:00.000Z"
        }
      }
    });
    expect(fixture.tagStore.selectedReferenceTagName).toBe(null);
    expect(fixture.tagStore.commitsSinceReferenceTag).toBe(null);
  });

  it("should reflect tag push predicates, including historical missing source guards", () => {
    const fixture = createFixture();
    const eligibleTag = createTag("local", "local-only");
    fixture.tagStore.tagsRemoteName = "origin";
    fixture.tagStore.tags = [eligibleTag];

    fixture.tagStore.tagsRemoteName = null;
    expect(fixture.tagStore.canPushTags).toBe(false);
    expect(fixture.tagStore.canPushTag(eligibleTag)).toBe(false);

    fixture.tagStore.tagsRemoteName = "origin";
    fixture.gitStore.statusStore.status = createStatus(false);
    expect(fixture.tagStore.canPushTags).toBe(false);
    // `canPushTag` historically does not check repository status.
    expect(fixture.tagStore.canPushTag(eligibleTag)).toBe(true);

    fixture.gitStore.statusStore.status = createStatus(true);
    fixture.setSourceReady(false);
    // Neither predicate currently checks source availability.
    expect(fixture.tagStore.canPushTags).toBe(true);
    expect(fixture.tagStore.canPushTag(eligibleTag)).toBe(true);

    for (const setBusy of [
      () => { fixture.tagStore.pushingTagName = "local"; },
      () => { fixture.tagStore.pushingTagName = null; fixture.tagStore.isPushingAllTags = true; },
      () => { fixture.tagStore.isPushingAllTags = false; fixture.tagStore.isFetchingTags = true; },
      () => { fixture.tagStore.isFetchingTags = false; fixture.tagStore.isLoadingTags = true; }
    ]) {
      setBusy();
      expect(fixture.tagStore.canPushTags).toBe(false);
      expect(fixture.tagStore.canPushTag(eligibleTag)).toBe(false);
    }
  });

  it("should reflect dynamic source and repository context from the parent store", () => {
    const fixture = createFixture();

    expect(fixture.tagStore.isAvailable).toBe(true);
    expect(fixture.tagStore.isRepository).toBe(true);

    fixture.setSourceReady(false);
    expect(fixture.tagStore.isAvailable).toBe(false);
    expect(fixture.tagStore.isRepository).toBe(true);

    fixture.gitStore.statusStore.status = createStatus(false);
    expect(fixture.tagStore.isAvailable).toBe(false);
    expect(fixture.tagStore.isRepository).toBe(false);

    fixture.setSourceReady(true);
    fixture.gitStore.statusStore.status = createStatus(true);
    expect(fixture.tagStore.isAvailable).toBe(true);
    expect(fixture.tagStore.isRepository).toBe(true);
  });

  it("should observe reference loading and bind a detached writing method", async () => {
    const fixture = createFixture();
    fixture.request
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(createProject({}));

    expect(isObservableProp(fixture.tagStore, "isLoadingTagReference")).toBe(true);
    const setCommitMessage = fixture.gitStore.commitStore.setCommitMessage;
    setCommitMessage("detached commit message");

    expect(fixture.gitStore.commitStore.commitMessage).toBe("detached commit message");
    expect(await fixture.tagStore.selectReferenceTag("v1.0.0")).toBe(true);
    expect(fixture.tagStore.isLoadingTagReference).toBe(false);
  });
});

/** Creates the shared preference fixture with a requested reference name. */
function referencePreferences(referenceTagName: string): OpenCodexProjectPreferences {
  const preferences = createPreferences();
  return {
    ...preferences,
    git: { ...preferences.git, referenceTagName }
  };
}
