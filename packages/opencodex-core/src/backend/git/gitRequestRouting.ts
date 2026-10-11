import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexBackendRuntime } from "../../OpenCodexBackendRuntime.js";

/** Protocol requests for Git operations and commit-message prompt management. */
export type GitRequest = Extract<OpenCodexRequest, {
  type: `git.${string}` | `commitPrompt.${string}`;
}>;

/** Git facade consumed after the shared router resolves workspace context. */
export interface GitRequestRuntime {
  git: OpenCodexBackendRuntime["git"];
}

/** Selects Git operations and commit prompts without consuming other domains. */
export function isGitRequest(request: OpenCodexRequest): request is GitRequest {
  return request.type.startsWith("git.") || request.type.startsWith("commitPrompt.");
}

/** Dispatches a resolved Git request, preserving facade responses and errors. */
export async function routeGitRequest(runtime: GitRequestRuntime, request: GitRequest): Promise<unknown> {
  switch (request.type) {
    case "git.version":
      return runtime.git.readVersion();
    case "git.status":
      return runtime.git.readStatus(request.projectPath, request.sourceId);
    case "git.fileDiff.read":
      if (request.workspaceId.trim().length === 0) {
        throw new Error("Git file diffs require an explicit workspace context.");
      }
      return runtime.git.readFileDiff(
        request.projectPath,
        request.sourceId,
        request.path,
        request.comparison
      );
    case "git.init":
      return runtime.git.initializeRepository(request.projectPath, request.sourceId);
    case "git.remotes":
      return runtime.git.listRemotes(request.projectPath, request.sourceId);
    case "git.remote.upsert":
      return runtime.git.upsertRemote(
        request.projectPath,
        request.sourceId,
        request.name,
        request.url
      );
    case "git.branches":
      return runtime.git.listBranches(request.projectPath, request.sourceId);
    case "git.tags":
      return runtime.git.listTags(request.projectPath, request.sourceId);
    case "git.tags.fetch":
      return runtime.git.fetchTags(request.projectPath, request.sourceId);
    case "git.tags.push":
      return runtime.git.pushTags(request.projectPath, request.sourceId);
    case "git.tag.create":
      return runtime.git.createTag(request.projectPath, request.sourceId, request.tagName);
    case "git.tag.push":
      return runtime.git.pushTag(
        request.projectPath,
        request.sourceId,
        request.tagName,
        request.force
      );
    case "git.tag.commitsSince":
      return runtime.git.countCommitsSinceTag(
        request.projectPath,
        request.sourceId,
        request.tagName
      );
    case "git.log":
      return runtime.git.readLog(request.projectPath, request.sourceId, request.limit, request.skip);
    case "git.commit.details":
      return runtime.git.readCommitDetails(request.projectPath, request.sourceId, request.hash);
    case "git.checkout":
      return runtime.git.checkoutBranch(
        request.projectPath,
        request.sourceId,
        request.branchName,
        request.branchKind
      );
    case "git.branch.create":
      return runtime.git.createBranch(request.projectPath, request.sourceId, request.branchName);
    case "git.merge":
      return runtime.git.mergeBranch(request.projectPath, request.sourceId, request.branchName);
    case "git.merge.to":
      if (request.allowDirtyWorktree === undefined) {
        return runtime.git.mergeBranchTo(
          request.projectPath,
          request.sourceId,
          request.targetBranchName
        );
      }

      return runtime.git.mergeBranchTo(
        request.projectPath,
        request.sourceId,
        request.targetBranchName,
        request.allowDirtyWorktree
      );
    case "git.stage":
      return runtime.git.stage(request.projectPath, request.sourceId, request.paths);
    case "git.unstage":
      return runtime.git.unstage(request.projectPath, request.sourceId, request.paths);
    case "git.commit":
      return runtime.git.commit(
        request.projectPath,
        request.sourceId,
        request.message,
        request.projectId,
        request.workspaceId
      );
    case "git.pull":
      return runtime.git.pull(request.projectPath, request.sourceId);
    case "git.push":
      return runtime.git.push(request.projectPath, request.sourceId);
    case "git.branch.publish":
      return runtime.git.publishCurrentBranch(request.projectPath, request.sourceId);
    case "commitPrompt.get":
      return runtime.git.commitMessage.readPrompt();
    case "commitPrompt.update":
      return runtime.git.commitMessage.updatePrompt(request.prompt);
    case "commitPrompt.reset":
      return runtime.git.commitMessage.resetPrompt();
    case "git.commitMessage.generate":
      return runtime.git.commitMessage.generate(
        request.projectPath,
        request.sourceId,
        request.instruction,
        request.model,
        request.reasoningEffort,
        request.language
      );
  }
}
