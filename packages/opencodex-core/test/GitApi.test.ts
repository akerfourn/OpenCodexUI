import type {
  OpenCodexCommitMessageGenerationResult,
  OpenCodexCommitPrompt,
  OpenCodexGitStatus,
  OpenCodexToolVersionStatus
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { GitApi } from "../src/backend/runtime/api/GitApi";

describe("GitApi", () => {
  it("should forward Git operations with their original arguments", async () => {
    const status = {} as OpenCodexGitStatus;
    const handler = {
      readGitVersion: vi.fn<() => Promise<OpenCodexToolVersionStatus>>(),
      readGitStatus: vi.fn<(
        projectPath: string,
        sourceId: string | null
      ) => Promise<OpenCodexGitStatus>>().mockResolvedValue(status),
      initializeGitRepository: vi.fn(),
      listGitRemotes: vi.fn(),
      upsertGitRemote: vi.fn(),
      listGitBranches: vi.fn(),
      listGitTags: vi.fn(),
      fetchGitTags: vi.fn(),
      createGitTag: vi.fn(),
      pushGitTag: vi.fn(),
      pushGitTags: vi.fn(),
      countGitCommitsSinceTag: vi.fn(),
      readGitLog: vi.fn(),
      readGitCommitDetails: vi.fn(),
      checkoutGitBranch: vi.fn(),
      createGitBranch: vi.fn(),
      mergeGitBranch: vi.fn(),
      mergeGitBranchTo: vi.fn(),
      stageGitPaths: vi.fn(),
      unstageGitPaths: vi.fn(),
      commitGitChanges: vi.fn(),
      pushGitChanges: vi.fn(),
      publishCurrentGitBranch: vi.fn(),
      pullGitChanges: vi.fn(),
      readCommitPrompt: vi.fn<() => Promise<OpenCodexCommitPrompt>>(),
      updateCommitPrompt: vi.fn(),
      resetCommitPrompt: vi.fn(),
      generateGitCommitMessage: vi.fn<
        () => Promise<OpenCodexCommitMessageGenerationResult>
      >()
    };
    const api = new GitApi(handler);

    await expect(api.readStatus("/project", "source-1")).resolves.toBe(status);
    expect(handler.readGitStatus).toHaveBeenCalledWith("/project", "source-1");

    await api.commit("/project", "source-1", "release changes", "project-1");
    expect(handler.commitGitChanges).toHaveBeenCalledWith(
      "/project",
      "source-1",
      "release changes",
      "project-1"
    );

    await api.mergeBranchTo("/project", "source-1", "release");
    expect(handler.mergeGitBranchTo).toHaveBeenCalledWith(
      "/project",
      "source-1",
      "release"
    );
  });

  it("should expose commit-message operations below Git", async () => {
    const prompt = {} as OpenCodexCommitPrompt;
    const handler = {
      readGitVersion: vi.fn(),
      readGitStatus: vi.fn(),
      initializeGitRepository: vi.fn(),
      listGitRemotes: vi.fn(),
      upsertGitRemote: vi.fn(),
      listGitBranches: vi.fn(),
      listGitTags: vi.fn(),
      fetchGitTags: vi.fn(),
      createGitTag: vi.fn(),
      pushGitTag: vi.fn(),
      pushGitTags: vi.fn(),
      countGitCommitsSinceTag: vi.fn(),
      readGitLog: vi.fn(),
      readGitCommitDetails: vi.fn(),
      checkoutGitBranch: vi.fn(),
      createGitBranch: vi.fn(),
      mergeGitBranch: vi.fn(),
      mergeGitBranchTo: vi.fn(),
      stageGitPaths: vi.fn(),
      unstageGitPaths: vi.fn(),
      commitGitChanges: vi.fn(),
      pushGitChanges: vi.fn(),
      publishCurrentGitBranch: vi.fn(),
      pullGitChanges: vi.fn(),
      readCommitPrompt: vi.fn<() => Promise<OpenCodexCommitPrompt>>().mockResolvedValue(prompt),
      updateCommitPrompt: vi.fn(),
      resetCommitPrompt: vi.fn(),
      generateGitCommitMessage: vi.fn()
    };
    const api = new GitApi(handler);

    await expect(api.commitMessage.readPrompt()).resolves.toBe(prompt);
    expect(handler.readCommitPrompt).toHaveBeenCalledOnce();
  });
});
