import { isComputedProp, isObservableProp } from "mobx";
import { describe, expect, it } from "vitest";

import {
  createFile,
  createProjectGitCommitFixture,
  createStatus,
  createTagResult,
  flushPromises
} from "./ProjectGitCommitStore.fixture";

describe("ProjectGitStore commit workflow", () => {
  it("should derive commit eligibility from staged files, message, and busy flags", () => {
    const cases = [
      {
        name: "no staged files",
        status: createStatus({ stagedFiles: [] }),
        message: "commit message",
        expected: false
      },
      {
        name: "blank message",
        status: createStatus(),
        message: "  \n  ",
        expected: false
      },
      {
        name: "status loading",
        status: createStatus(),
        message: "commit message",
        statusLoading: true,
        expected: false
      },
      {
        name: "deferred paths updating",
        status: createStatus(),
        message: "commit message",
        deferredPathsUpdating: true,
        expected: false
      },
      {
        name: "commit in flight",
        status: createStatus(),
        message: "commit message",
        committing: true,
        expected: false
      },
      {
        name: "generation in flight",
        status: createStatus(),
        message: "commit message",
        generating: true,
        expected: false
      },
      {
        name: "valid staged message",
        status: createStatus(),
        message: "  commit message  ",
        expected: true
      }
    ];

    for (const testCase of cases) {
      const fixture = createProjectGitCommitFixture({ status: testCase.status });
      fixture.gitStore.commitStore.commitMessage = testCase.message;
      fixture.gitStore.statusStore.isLoading = testCase.statusLoading ?? false;
      fixture.gitStore.changesStore.isUpdatingDeferredPaths =
        testCase.deferredPathsUpdating ?? false;
      fixture.gitStore.commitStore.isCommitting = testCase.committing ?? false;
      fixture.gitStore.commitStore.isGeneratingCommitMessage = testCase.generating ?? false;

      expect(fixture.gitStore.commitStore.canCommit, testCase.name).toBe(testCase.expected);
    }
  });

  it("should return without requesting when commit eligibility is false", async () => {
    const fixture = createProjectGitCommitFixture({ status: createStatus({ stagedFiles: [] }) });
    fixture.gitStore.commitStore.commitMessage = "message";
    fixture.gitStore.errorMessage = "previous error";

    await fixture.gitStore.commitStore.commit();

    expect(fixture.request).not.toHaveBeenCalled();
    expect(fixture.statusRefresh).not.toHaveBeenCalled();
    expect(fixture.gitStore.errorMessage).toBe("previous error");
    expect(fixture.gitStore.commitStore.isCommitting).toBe(false);
  });

  it("should expose only non-blank commit messages as drafts", () => {
    const fixture = createProjectGitCommitFixture();

    fixture.gitStore.commitStore.commitMessage = "  ";
    expect(fixture.gitStore.commitStore.hasDraftMessage).toBe(false);

    fixture.gitStore.commitStore.commitMessage = "release changes";
    expect(fixture.gitStore.commitStore.hasDraftMessage).toBe(true);
  });

  it("should commit with the exact payload, refresh status, and load tags", async () => {
    const fixture = createProjectGitCommitFixture({ stubStatusRefresh: false });
    const statusAfterCommit = createStatus({ stagedFiles: [] });
    fixture.request
      .mockResolvedValueOnce({ ok: true, output: "commit output" })
      .mockResolvedValueOnce(statusAfterCommit)
      .mockResolvedValueOnce(createTagResult());
    fixture.gitStore.commitStore.commitMessage = "  release staged changes  ";

    const commit = fixture.gitStore.commitStore.commit();

    expect(fixture.gitStore.commitStore.isCommitting).toBe(true);
    await commit;
    await flushPromises();

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.commit",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      message: "  release staged changes  "
    });
    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "git.status",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.request).toHaveBeenNthCalledWith(3, {
      type: "git.tags",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.statusRefresh).toHaveBeenCalledOnce();
    expect(fixture.gitStore.commitStore.commitMessage).toBe("");
    expect(fixture.gitStore.statusStore.status).toEqual(statusAfterCommit);
    expect(fixture.gitStore.tagStore.hasLoadedTags).toBe(true);
    expect(fixture.gitStore.commitStore.isCommitting).toBe(false);
    expect(fixture.gitStore.errorMessage).toBe(null);
  });

  it("should expose commit errors, preserve the message, and skip refresh", async () => {
    const fixture = createProjectGitCommitFixture();
    fixture.request.mockRejectedValueOnce(new Error("commit failed"));
    fixture.gitStore.commitStore.commitMessage = "keep this message";

    await fixture.gitStore.commitStore.commit();

    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.commit",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      message: "keep this message"
    });
    expect(fixture.request).toHaveBeenCalledOnce();
    expect(fixture.statusRefresh).not.toHaveBeenCalled();
    expect(fixture.gitStore.commitStore.commitMessage).toBe("keep this message");
    expect(fixture.gitStore.errorMessage).toBe("commit failed");
    expect(fixture.gitStore.commitStore.isCommitting).toBe(false);
  });

  it("should absorb a refresh error after a successful commit", async () => {
    const fixture = createProjectGitCommitFixture({ stubStatusRefresh: false });
    const previousStatus = fixture.gitStore.statusStore.status;
    fixture.request
      .mockResolvedValueOnce({ ok: true, output: "commit output" })
      .mockRejectedValueOnce(new Error("status failed"));
    fixture.gitStore.commitStore.commitMessage = "message";

    await fixture.gitStore.commitStore.commit();

    expect(fixture.request).toHaveBeenNthCalledWith(1, {
      type: "git.commit",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      message: "message"
    });
    expect(fixture.request).toHaveBeenNthCalledWith(2, {
      type: "git.status",
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(fixture.statusRefresh).toHaveBeenCalledOnce();
    expect(fixture.gitStore.commitStore.commitMessage).toBe("");
    expect(fixture.gitStore.statusStore.status).toBe(previousStatus);
    expect(fixture.gitStore.errorMessage).toBe("status failed");
    expect(fixture.gitStore.statusStore.isLoading).toBe(false);
    expect(fixture.gitStore.commitStore.isCommitting).toBe(false);
  });

  it("should generate with settings and preserve the untrimmed instruction payload", async () => {
    const fixture = createProjectGitCommitFixture();
    fixture.request.mockResolvedValueOnce({ message: "feat: generated message" });

    await fixture.gitStore.commitStore.generateCommitMessage("  mention the staged API  ");

    expect(fixture.request).toHaveBeenCalledOnce();
    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.commitMessage.generate",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      instruction: "  mention the staged API  ",
      model: "gpt-5.5",
      reasoningEffort: "high",
      language: "fr"
    });
    expect(fixture.statusRefresh).not.toHaveBeenCalled();
    expect(fixture.gitStore.commitStore.commitMessage).toBe("feat: generated message");
    expect(fixture.gitStore.errorMessage).toBe(null);
    expect(fixture.gitStore.commitStore.isGeneratingCommitMessage).toBe(false);
  });

  it("should use a one-shot model override without changing the configured model", async () => {
    const fixture = createProjectGitCommitFixture();
    fixture.request.mockResolvedValueOnce({ message: "feat: generated with another model" });

    await fixture.gitStore.commitStore.generateCommitMessage(
      "instruction",
      "gpt-5.6-luna",
      "low"
    );

    expect(fixture.request).toHaveBeenCalledWith({
      type: "git.commitMessage.generate",
      projectPath: "/workspace/project",
      sourceId: "source-1",
      instruction: "instruction",
      model: "gpt-5.6-luna",
      reasoningEffort: "low",
      language: "fr"
    });
    expect(fixture.root.appStore.settingsStore.settings.commitMessageModel).toBe("gpt-5.5");
    expect(fixture.root.appStore.settingsStore.settings.commitMessageReasoningEffort).toBe("high");
  });

  it("should expose generation errors and preserve the previous message", async () => {
    const fixture = createProjectGitCommitFixture();
    fixture.request.mockRejectedValueOnce(new Error("generation failed"));
    fixture.gitStore.commitStore.commitMessage = "previous message";

    await fixture.gitStore.commitStore.generateCommitMessage("instruction");

    expect(fixture.request).toHaveBeenCalledOnce();
    expect(fixture.gitStore.commitStore.commitMessage).toBe("previous message");
    expect(fixture.gitStore.errorMessage).toBe("generation failed");
    expect(fixture.gitStore.commitStore.isGeneratingCommitMessage).toBe(false);
  });

  it("should guard generation for unavailable, empty, busy, or active states", async () => {
    const cases = [
      createProjectGitCommitFixture({
        sourceReady: false,
        status: createStatus()
      }),
      createProjectGitCommitFixture({
        status: createStatus({ stagedFiles: [] })
      }),
      createProjectGitCommitFixture({
        status: createStatus()
      }),
      createProjectGitCommitFixture({
        status: createStatus()
      })
    ];
    cases[2].gitStore.statusStore.isLoading = true;
    cases[3].gitStore.commitStore.isGeneratingCommitMessage = true;

    for (const fixture of cases) {
      await fixture.gitStore.commitStore.generateCommitMessage("instruction");

      expect(fixture.request).not.toHaveBeenCalled();
      expect(fixture.statusRefresh).not.toHaveBeenCalled();
    }
  });

  it("should preserve the historical generation race and block manual edits while active", async () => {
    const fixture = createProjectGitCommitFixture();
    let resolveGeneration: (value: { message: string }) => void = () => undefined;
    fixture.request.mockReturnValueOnce(new Promise((resolve) => {
      resolveGeneration = resolve;
    }));
    fixture.gitStore.commitStore.commitMessage = "before generation";
    fixture.gitStore.commitStore.isCommitting = true;
    expect(fixture.gitStore.commitStore.canGenerateCommitMessage).toBe(true);

    const generation = fixture.gitStore.commitStore.generateCommitMessage("instruction");

    expect(fixture.gitStore.commitStore.isGeneratingCommitMessage).toBe(true);
    fixture.gitStore.commitStore.setCommitMessage("manual edit");
    expect(fixture.gitStore.commitStore.commitMessage).toBe("before generation");

    resolveGeneration({ message: "generated" });
    await generation;

    expect(fixture.gitStore.commitStore.commitMessage).toBe("generated");
    expect(fixture.gitStore.commitStore.isGeneratingCommitMessage).toBe(false);
  });

  it("should apply pending messages only when the editor is blank", () => {
    const fixture = createProjectGitCommitFixture();
    fixture.gitStore.commitStore.commitMessage = "   ";
    fixture.applyStatus(createStatus({ pendingCommitMessage: "pending message" }));

    expect(fixture.gitStore.commitStore.commitMessage).toBe("pending message");

    fixture.gitStore.commitStore.setCommitMessage("manual message");
    fixture.applyStatus(createStatus({ pendingCommitMessage: "new pending message" }));

    expect(fixture.gitStore.commitStore.commitMessage).toBe("manual message");
  });

  it("should expose configured generation labels and MobX-bound state", () => {
    const fixture = createProjectGitCommitFixture();

    expect(fixture.gitStore.commitStore.commitGenerationModelLabel).toBe("gpt-5.5");
    expect(fixture.gitStore.commitStore.commitGenerationReasoningEffortLabel).toBe("high");
    fixture.root.appStore.settingsStore.settings.commitMessageModel = null;
    fixture.root.appStore.settingsStore.settings.commitMessageReasoningEffort = null;
    expect(fixture.gitStore.commitStore.commitGenerationModelLabel).toBe(null);
    expect(fixture.gitStore.commitStore.commitGenerationReasoningEffortLabel).toBe(null);
    expect(isObservableProp(fixture.gitStore.commitStore, "commitMessage")).toBe(true);
    expect(isObservableProp(fixture.gitStore.commitStore, "isCommitting")).toBe(true);
    expect(isObservableProp(fixture.gitStore.commitStore, "isGeneratingCommitMessage")).toBe(true);
    expect(isObservableProp(fixture.gitStore, "errorMessage")).toBe(true);
    expect(isComputedProp(fixture.gitStore.commitStore, "canCommit")).toBe(true);
    expect(isComputedProp(fixture.gitStore.commitStore, "canGenerateCommitMessage")).toBe(true);

    const setCommitMessage = fixture.gitStore.commitStore.setCommitMessage;
    setCommitMessage("detached message");

    expect(fixture.gitStore.commitStore.commitMessage).toBe("detached message");
  });
});
