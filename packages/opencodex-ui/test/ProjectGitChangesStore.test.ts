import { isObservableProp } from "mobx";
import { describe, expect, it } from "vitest";

import {
  createFile,
  createPreferences,
  createProject,
  createProjectGitChangesFixture,
  createStatus
} from "./ProjectGitChangesStore.fixture";

describe("ProjectGitChangesStore changed and staged workflow", () => {
  it("should derive file groups, toggle paths, and reconcile selections", () => {
    const fixture = createProjectGitChangesFixture({
      status: createStatus({
        changedFiles: [createFile("keep.ts"), createFile("src/deferred.ts")],
        stagedFiles: [createFile("staged.ts", "added")]
      })
    });

    fixture.gitStore.changesStore.selectedChangedPaths = ["keep.ts", "src/deferred.ts", "gone.ts"];
    fixture.gitStore.changesStore.selectedStagedPaths = ["staged.ts", "gone-staged.ts"];
    fixture.gitStore.changesStore.applyProjectPreferences({
      git: { deferredPaths: ["./src/", "src"] }
    });

    expect(fixture.gitStore.changesStore.deferredPaths).toEqual(["src"]);
    expect(fixture.gitStore.changesStore.stageableChangedFiles.map((file) => file.path)).toEqual(["keep.ts"]);
    expect(fixture.gitStore.changesStore.deferredChangedFiles.map((file) => file.path)).toEqual([
      "src/deferred.ts"
    ]);
    expect(fixture.gitStore.changesStore.changedFilesCount).toBe(1);
    expect(fixture.gitStore.changesStore.deferredFilesCount).toBe(1);
    expect(fixture.gitStore.changesStore.stagedFilesCount).toBe(1);
    expect(fixture.gitStore.changesStore.getDeferredPathFor("src/deferred.ts")).toBe("src");
    expect(fixture.gitStore.changesStore.selectedChangedPaths).toEqual(["keep.ts"]);

    fixture.gitStore.changesStore.toggleChangedPath("src/deferred.ts");
    fixture.gitStore.changesStore.toggleChangedPath("new.ts");
    fixture.gitStore.changesStore.toggleChangedPath("new.ts");
    fixture.gitStore.changesStore.toggleStagedPath("staged.ts");
    fixture.gitStore.changesStore.toggleStagedPath("new-staged.ts");

    expect(fixture.gitStore.changesStore.selectedChangedPaths).toEqual(["keep.ts"]);
    expect(fixture.gitStore.changesStore.selectedStagedPaths).toEqual(["gone-staged.ts", "new-staged.ts"]);

    fixture.gitStore.commitStore.commitMessage = " ";
    fixture.applyStatus(createStatus({
      pendingCommitMessage: "pending message",
      changedFiles: [
        createFile("keep.ts"),
        createFile("src/deferred.ts"),
        createFile("new.ts")
      ],
      stagedFiles: [createFile("staged.ts", "added")]
    }));

    expect(fixture.gitStore.commitStore.commitMessage).toBe("pending message");
    expect(fixture.gitStore.changesStore.selectedChangedPaths).toEqual(["keep.ts"]);
    expect(fixture.gitStore.changesStore.selectedStagedPaths).toEqual([]);
  });

  it("should reconcile selections against the provided status snapshot", () => {
    const fixture = createProjectGitChangesFixture();
    fixture.gitStore.changesStore.selectedChangedPaths = ["incoming.ts"];
    fixture.gitStore.changesStore.selectedStagedPaths = ["incoming-staged.ts"];

    fixture.gitStore.changesStore.reconcileStatus(createStatus({
      changedFiles: [createFile("incoming.ts")],
      stagedFiles: [createFile("incoming-staged.ts", "added")]
    }));

    expect(fixture.gitStore.changesStore.selectedChangedPaths).toEqual(["incoming.ts"]);
    expect(fixture.gitStore.changesStore.selectedStagedPaths).toEqual(["incoming-staged.ts"]);
  });

  it("should stage selected, all, and individual paths with exact payloads", async () => {
    const fixture = createProjectGitChangesFixture({
      status: createStatus({
        changedFiles: [
          createFile("one.ts"),
          createFile("two.ts"),
          createFile("src/deferred.ts")
        ],
        stagedFiles: [createFile("already.ts", "added")]
      })
    });
    fixture.gitStore.changesStore.deferredPaths = ["src"];
    fixture.gitStore.changesStore.selectedChangedPaths = ["one.ts", "src/deferred.ts"];

    const afterSelected = createStatus({
      changedFiles: [createFile("two.ts"), createFile("src/deferred.ts")],
      stagedFiles: [createFile("already.ts", "added"), createFile("one.ts", "added")]
    });
    const afterAll = createStatus({
      changedFiles: [createFile("src/deferred.ts")],
      stagedFiles: [
        createFile("already.ts", "added"),
        createFile("one.ts", "added"),
        createFile("two.ts", "added")
      ]
    });
    const afterPath = createStatus({
      changedFiles: [],
      stagedFiles: [
        createFile("already.ts", "added"),
        createFile("one.ts", "added"),
        createFile("two.ts", "added"),
        createFile("single.ts", "added")
      ]
    });
    fixture.request
      .mockResolvedValueOnce(afterSelected)
      .mockResolvedValueOnce(afterAll)
      .mockResolvedValueOnce(afterPath);

    await fixture.gitStore.changesStore.stageSelected();
    await fixture.gitStore.changesStore.stageAll();
    await fixture.gitStore.changesStore.stagePath("  single.ts  ");

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.stage",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      paths: ["one.ts"]
    });
    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "git.stage",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      paths: ["two.ts"]
    });
    expect(fixture.request).toHaveBeenNthCalledWith(3, {
      type: "git.stage",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      paths: ["single.ts"]
    });
    expect(fixture.gitStore.statusStore.status).toEqual(afterPath);
    expect(fixture.gitStore.changesStore.stagedFilesCount).toBe(4);
  });

  it("should unstage selected, all, and individual paths with exact payloads", async () => {
    const fixture = createProjectGitChangesFixture({
      status: createStatus({
        stagedFiles: [
          createFile("first.ts", "added"),
          createFile("second.ts", "modified")
        ]
      })
    });
    fixture.gitStore.changesStore.selectedStagedPaths = [" first.ts ", "missing.ts", "  "];

    const afterSelected = createStatus({ stagedFiles: [createFile("second.ts", "modified")] });
    const afterAll = createStatus();
    const afterPath = createStatus();
    fixture.request
      .mockResolvedValueOnce(afterSelected)
      .mockResolvedValueOnce(afterAll)
      .mockResolvedValueOnce(afterPath);

    await fixture.gitStore.changesStore.unstageSelected();
    await fixture.gitStore.changesStore.unstageAll();
    await fixture.gitStore.changesStore.unstagePath("  standalone.ts  ");

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.unstage",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      paths: ["first.ts", "missing.ts"]
    });
    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "git.unstage",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      paths: ["second.ts"]
    });
    expect(fixture.request).toHaveBeenNthCalledWith(3, {
      type: "git.unstage",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      paths: ["standalone.ts"]
    });
    expect(fixture.gitStore.statusStore.status).toEqual(afterPath);
    expect(fixture.gitStore.changesStore.selectedStagedPaths).toEqual([]);
  });

  it("should skip empty, deferred, invalid, and unchanged workflow requests", async () => {
    const fixture = createProjectGitChangesFixture({
      status: createStatus({ changedFiles: [createFile("src/file.ts")] })
    });
    fixture.gitStore.changesStore.deferredPaths = ["src"];
    fixture.gitStore.changesStore.selectedChangedPaths = ["src/file.ts"];
    fixture.gitStore.changesStore.selectedStagedPaths = [" "];

    await fixture.gitStore.changesStore.stageSelected();
    await fixture.gitStore.changesStore.stageAll();
    await fixture.gitStore.changesStore.stagePath("src/file.ts");
    await fixture.gitStore.changesStore.stagePath("  ");
    await fixture.gitStore.changesStore.unstageSelected();
    await fixture.gitStore.changesStore.unstageAll();
    await fixture.gitStore.changesStore.unstagePath("  ");
    await fixture.gitStore.changesStore.deferSelected();
    await fixture.gitStore.changesStore.deferPath("../outside");
    await fixture.gitStore.changesStore.deferPath("./src/");
    await fixture.gitStore.changesStore.restoreDeferredPath("missing");
    fixture.gitStore.changesStore.deferredPaths = [];
    await fixture.gitStore.changesStore.restoreAllDeferred();

    expect(fixture.request).not.toHaveBeenCalled();
  });

  it("should keep the previous status and reset loading after a mutation error", async () => {
    const fixture = createProjectGitChangesFixture({
      status: createStatus({ changedFiles: [createFile("changed.ts")] })
    });
    const previousStatus = fixture.gitStore.statusStore.status;
    fixture.request.mockRejectedValueOnce(new Error("stage failed"));

    await fixture.gitStore.changesStore.stagePath("changed.ts");

    expect(fixture.gitStore.statusStore.status).toBe(previousStatus);
    expect(fixture.gitStore.errorMessage).toBe("stage failed");
    expect(fixture.gitStore.statusStore.isLoading).toBe(false);
    expect(fixture.gitStore.changesStore.isBusy).toBe(false);
  });

  it("should persist deferred paths while preserving unrelated preferences", async () => {
    const initialPreferences = createPreferences(["old"]);
    const fixture = createProjectGitChangesFixture({
      project: createProject(initialPreferences),
      status: createStatus({
        changedFiles: [createFile("src/keep.ts"), createFile("notes/other.ts")]
      })
    });
    fixture.gitStore.changesStore.selectedChangedPaths = ["src/keep.ts", "notes/other.ts"];
    const serverProject = createProject(createPreferences(["old", "src/keep.ts"]));
    fixture.request.mockResolvedValueOnce(serverProject);

    const update = fixture.gitStore.changesStore.deferPath("./src/keep.ts/");

    expect(fixture.gitStore.changesStore.isUpdatingDeferredPaths).toBe(true);
    expect(fixture.gitStore.changesStore.deferredPaths).toEqual(["old", "src/keep.ts"]);
    expect(fixture.gitStore.changesStore.selectedChangedPaths).toEqual(["notes/other.ts"]);
    expect(fixture.request).toHaveBeenCalledWith({
      type: "projects.preferences.update",
      projectId: "project-1",
      patch: createPreferences(["old", "src/keep.ts"])
    });

    await update;

    expect(fixture.projectStore.project).toBe(serverProject);
    expect(fixture.gitStore.changesStore.deferredPaths).toEqual(["old", "src/keep.ts"]);
    expect(fixture.gitStore.changesStore.isUpdatingDeferredPaths).toBe(false);

    const restoredProject = createProject(createPreferences(["old"]));
    fixture.request.mockResolvedValueOnce(restoredProject);
    await fixture.gitStore.changesStore.restoreDeferredPath("src/keep.ts");

    expect(fixture.request).toHaveBeenLastCalledWith({
      type: "projects.preferences.update",
      projectId: "project-1",
      patch: createPreferences(["old"])
    });
    expect(fixture.projectStore.project).toBe(restoredProject);

    const clearedProject = createProject(createPreferences());
    fixture.request.mockResolvedValueOnce(clearedProject);
    await fixture.gitStore.changesStore.restoreAllDeferred();

    expect(fixture.request).toHaveBeenLastCalledWith({
      type: "projects.preferences.update",
      projectId: "project-1",
      patch: createPreferences()
    });
    expect(fixture.gitStore.changesStore.deferredPaths).toEqual([]);
  });

  it("should persist normalized selected deferred paths", async () => {
    const fixture = createProjectGitChangesFixture({
      project: createProject(createPreferences(["notes"])),
      status: createStatus({
        changedFiles: [createFile("src/one.ts"), createFile("src/two.ts")]
      })
    });
    fixture.gitStore.changesStore.selectedChangedPaths = ["src/two.ts", "src/one.ts"];
    const serverProject = createProject(createPreferences(["notes", "src/one.ts", "src/two.ts"]));
    fixture.request.mockResolvedValueOnce(serverProject);

    await fixture.gitStore.changesStore.deferSelected();

    expect(fixture.request).toHaveBeenCalledWith({
      type: "projects.preferences.update",
      projectId: "project-1",
      patch: createPreferences(["notes", "src/one.ts", "src/two.ts"])
    });
    expect(fixture.projectStore.project).toBe(serverProject);
    expect(fixture.gitStore.changesStore.deferredPaths).toEqual(["notes", "src/one.ts", "src/two.ts"]);
  });

  it("should roll back deferred paths after a preference error", async () => {
    const fixture = createProjectGitChangesFixture({
      project: createProject(createPreferences(["old"])),
      status: createStatus({
        changedFiles: [createFile("new.ts"), createFile("keep.ts")]
      })
    });
    fixture.gitStore.changesStore.selectedChangedPaths = ["new.ts", "keep.ts"];
    fixture.request.mockRejectedValueOnce(new Error("preferences failed"));

    await fixture.gitStore.changesStore.deferPath("new.ts");

    expect(fixture.gitStore.changesStore.deferredPaths).toEqual(["old"]);
    expect(fixture.gitStore.changesStore.selectedChangedPaths).toEqual(["keep.ts"]);
    expect(fixture.gitStore.errorMessage).toBe("preferences failed");
    expect(fixture.gitStore.changesStore.isUpdatingDeferredPaths).toBe(false);
    expect(fixture.projectStore.project.preferences).toEqual(createPreferences(["old"]));
  });

  it("should skip unchanged preference updates and ignore concurrent updates", async () => {
    const fixture = createProjectGitChangesFixture({
      project: createProject(createPreferences(["src"])),
      status: createStatus({ changedFiles: [createFile("src/file.ts")] })
    });

    await fixture.gitStore.changesStore.deferPath("./src/");
    await fixture.gitStore.changesStore.deferPath("../outside");
    await fixture.gitStore.changesStore.restoreDeferredPath("missing");
    fixture.gitStore.changesStore.selectedChangedPaths = ["src/file.ts"];
    await fixture.gitStore.changesStore.deferSelected();
    expect(fixture.request).not.toHaveBeenCalled();

    fixture.gitStore.changesStore.deferredPaths = [];
    await fixture.gitStore.changesStore.restoreAllDeferred();
    expect(fixture.request).not.toHaveBeenCalled();

    let resolveFirst: (project: OpenCodexProject) => void = () => undefined;
    fixture.request.mockReturnValueOnce(new Promise<OpenCodexProject>((resolve) => {
      resolveFirst = resolve;
    }));
    const firstUpdate = fixture.gitStore.changesStore.deferPath("one");

    expect(fixture.gitStore.changesStore.isUpdatingDeferredPaths).toBe(true);
    await fixture.gitStore.changesStore.deferPath("two");
    expect(fixture.request).toHaveBeenCalledTimes(1);

    resolveFirst(createProject(createPreferences(["one"])));
    await firstUpdate;
    expect(fixture.gitStore.changesStore.deferredPaths).toEqual(["one"]);
    expect(fixture.gitStore.changesStore.isUpdatingDeferredPaths).toBe(false);
  });

  it("should expose observable fields and bind detached workflow methods", async () => {
    const fixture = createProjectGitChangesFixture({
      project: createProject(createPreferences()),
      status: createStatus({
        changedFiles: [createFile("changed.ts")],
        stagedFiles: [createFile("staged.ts", "added")]
      })
    });

    for (const property of [
      "deferredPaths",
      "selectedChangedPaths",
      "selectedStagedPaths",
      "isUpdatingDeferredPaths"
    ]) {
      expect(isObservableProp(fixture.gitStore.changesStore, property)).toBe(true);
    }
    expect(isObservableProp(fixture.gitStore, "errorMessage")).toBe(true);

    const afterStage = createStatus({
      changedFiles: [],
      stagedFiles: [createFile("changed.ts", "added"), createFile("staged.ts", "added")]
    });
    const afterUnstage = createStatus({
      changedFiles: [createFile("changed.ts")],
      stagedFiles: [createFile("staged.ts", "added")]
    });
    fixture.request
      .mockResolvedValueOnce(afterStage)
      .mockResolvedValueOnce(afterUnstage)
      .mockResolvedValueOnce(createProject(createPreferences(["changed.ts"])));

    const stagePath = fixture.gitStore.changesStore.stagePath;
    const unstagePath = fixture.gitStore.changesStore.unstagePath;
    const deferPath = fixture.gitStore.changesStore.deferPath;

    await stagePath("changed.ts");
    await unstagePath("changed.ts");
    await deferPath("changed.ts");

    expect(fixture.gitStore.changesStore.deferredPaths).toEqual(["changed.ts"]);
    expect(fixture.gitStore.statusStore.isLoading).toBe(false);
    expect(fixture.gitStore.changesStore.isUpdatingDeferredPaths).toBe(false);
  });
});
