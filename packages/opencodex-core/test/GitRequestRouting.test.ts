import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { isGitRequest, type GitRequest } from "../src/backend/git/gitRequestRouting.js";
import type { OpenCodexBackendRuntime } from "../src/OpenCodexBackendRuntime.js";
import { OpenCodexRequestRouter } from "../src/OpenCodexRequestRouter.js";

/** Transport contracts for every Git operation, including nullable and optional arguments. */
interface RouteCase {
  request: GitRequest;
  effect: string;
  args: unknown[];
}

const scope = { projectPath: "/remote/project", sourceId: "source" };
const scopeArgs = [scope.projectPath, scope.sourceId];
const paths = ["src/with spaces.ts", "docs/été.md"];
const diffRequest: Extract<GitRequest, { type: "git.fileDiff.read" }> = {
  type: "git.fileDiff.read", ...scope, projectId: "project", workspaceId: "workspace",
  path: "src/été.ts", comparison: "workingTree"
};
const commitRequest: Extract<GitRequest, { type: "git.commit" }> = {
  type: "git.commit", ...scope, projectId: "project", workspaceId: "workspace", message: "fix: été"
};
const cases: RouteCase[] = [
  { request: { type: "git.version" }, effect: "readVersion", args: [] },
  { request: { type: "git.status", ...scope }, effect: "readStatus", args: scopeArgs },
  { request: diffRequest, effect: "readFileDiff", args: [...scopeArgs, "src/été.ts", "workingTree"] },
  { request: { type: "git.init", ...scope }, effect: "initializeRepository", args: scopeArgs },
  { request: { type: "git.remotes", ...scope }, effect: "listRemotes", args: scopeArgs },
  { request: { type: "git.remote.upsert", ...scope, name: "origin", url: "ssh://git.example/project" },
    effect: "upsertRemote", args: [...scopeArgs, "origin", "ssh://git.example/project"] },
  { request: { type: "git.branches", ...scope }, effect: "listBranches", args: scopeArgs },
  { request: { type: "git.tags", ...scope }, effect: "listTags", args: scopeArgs },
  { request: { type: "git.tags.fetch", ...scope }, effect: "fetchTags", args: scopeArgs },
  { request: { type: "git.tags.push", ...scope }, effect: "pushTags", args: scopeArgs },
  { request: { type: "git.tag.create", ...scope, tagName: "v1.2.3" },
    effect: "createTag", args: [...scopeArgs, "v1.2.3"] },
  { request: { type: "git.tag.push", ...scope, tagName: "v1.2.3", force: false },
    effect: "pushTag", args: [...scopeArgs, "v1.2.3", false] },
  { request: { type: "git.tag.commitsSince", ...scope, tagName: "v1.2.3" },
    effect: "countCommitsSinceTag", args: [...scopeArgs, "v1.2.3"] },
  { request: { type: "git.log", ...scope, limit: 0, skip: 25 },
    effect: "readLog", args: [...scopeArgs, 0, 25] },
  { request: { type: "git.commit.details", ...scope, hash: "abc123" },
    effect: "readCommitDetails", args: [...scopeArgs, "abc123"] },
  { request: { type: "git.checkout", ...scope, branchName: "origin/feature", branchKind: "remote" },
    effect: "checkoutBranch", args: [...scopeArgs, "origin/feature", "remote"] },
  { request: { type: "git.branch.create", ...scope, branchName: "feature" },
    effect: "createBranch", args: [...scopeArgs, "feature"] },
  { request: { type: "git.merge", ...scope, branchName: "feature" },
    effect: "mergeBranch", args: [...scopeArgs, "feature"] },
  { request: { type: "git.merge.to", ...scope, targetBranchName: "main" },
    effect: "mergeBranchTo", args: [...scopeArgs, "main"] },
  { request: { type: "git.stage", ...scope, paths }, effect: "stage", args: [...scopeArgs, paths] },
  { request: { type: "git.unstage", ...scope, paths }, effect: "unstage", args: [...scopeArgs, paths] },
  { request: commitRequest, effect: "commit", args: [...scopeArgs, "fix: été", "project", "workspace"] },
  { request: { type: "git.pull", ...scope }, effect: "pull", args: scopeArgs },
  { request: { type: "git.push", ...scope }, effect: "push", args: scopeArgs },
  { request: { type: "git.branch.publish", ...scope }, effect: "publishCurrentBranch", args: scopeArgs },
  { request: { type: "commitPrompt.get" }, effect: "commitMessage.readPrompt", args: [] },
  { request: { type: "commitPrompt.update", prompt: "Describe the changes.\nEn français." },
    effect: "commitMessage.updatePrompt", args: ["Describe the changes.\nEn français."] },
  { request: { type: "commitPrompt.reset" }, effect: "commitMessage.resetPrompt", args: [] },
  { request: { type: "git.commitMessage.generate", ...scope, instruction: "Summarize", model: "model",
    reasoningEffort: "high", language: "fr" },
    effect: "commitMessage.generate", args: [...scopeArgs, "Summarize", "model", "high", "fr"] }
];

/** Mocks the Git effect facade while retaining the real dispatcher and shared error boundary. */
function createGitRoutingFixture() {
  const response = { fixture: "response" };
  const git = {
    readVersion: vi.fn(), readStatus: vi.fn(), readFileDiff: vi.fn(), initializeRepository: vi.fn(),
    listRemotes: vi.fn(), upsertRemote: vi.fn(), listBranches: vi.fn(), listTags: vi.fn(),
    fetchTags: vi.fn(), pushTags: vi.fn(), createTag: vi.fn(), pushTag: vi.fn(),
    countCommitsSinceTag: vi.fn(), readLog: vi.fn(), readCommitDetails: vi.fn(), checkoutBranch: vi.fn(),
    createBranch: vi.fn(), mergeBranch: vi.fn(), mergeBranchTo: vi.fn(), stage: vi.fn(), unstage: vi.fn(),
    commit: vi.fn(), pull: vi.fn(), push: vi.fn(), publishCurrentBranch: vi.fn(),
    commitMessage: { readPrompt: vi.fn(), updatePrompt: vi.fn(), resetPrompt: vi.fn(), generate: vi.fn() }
  };
  const { commitMessage, ...operations } = git;
  const effects: Record<string, ReturnType<typeof vi.fn>> = { ...operations };
  for (const [name, effect] of Object.entries(commitMessage)) {
    effects[`commitMessage.${name}`] = effect;
  }
  for (const effect of Object.values(effects)) {
    effect.mockResolvedValue(response);
  }
  const resolveToolRequest = vi.fn(async (request: OpenCodexRequest) => request);
  const handleRequestError = vi.fn();
  const runtime = { git, resolveToolRequest, handleRequestError } as unknown as OpenCodexBackendRuntime;
  return { router: new OpenCodexRequestRouter(runtime), git, effects, resolveToolRequest, handleRequestError, response };
}

describe("Git routing through the shared request router", () => {
  it.each(cases)("should forward $request.type to $effect with its contracted arguments", async ({ request, effect, args }) => {
    const fixture = createGitRoutingFixture();

    expect(isGitRequest(request)).toBe(true);
    expect(await fixture.router.handleRequest(request)).toBe(fixture.response);

    expect(fixture.effects[effect]).toHaveBeenCalledTimes(1);
    expect(fixture.effects[effect]).toHaveBeenCalledWith(...args);
    const calls = Object.values(fixture.effects).reduce((total, mock) => total + mock.mock.calls.length, 0);
    expect(calls).toBe(1);
    if ("workspaceId" in request && request.workspaceId !== undefined) {
      expect(fixture.resolveToolRequest).toHaveBeenCalledTimes(1);
      expect(fixture.resolveToolRequest).toHaveBeenCalledWith(request);
    } else {
      expect(fixture.resolveToolRequest).not.toHaveBeenCalled();
    }
    expect(fixture.handleRequestError).not.toHaveBeenCalled();
  });

  it.each([true, false])("should forward an explicit dirty-worktree confirmation of %s", async (allowDirtyWorktree) => {
    const fixture = createGitRoutingFixture();

    await fixture.router.handleRequest({ type: "git.merge.to", ...scope, targetBranchName: "main", allowDirtyWorktree });

    expect(fixture.git.mergeBranchTo).toHaveBeenCalledTimes(1);
    expect(fixture.git.mergeBranchTo).toHaveBeenCalledWith(...scopeArgs, "main", allowDirtyWorktree);
  });

  it.each(["C:\\project\\été", "/remote/project/été", "\\\\wsl.localhost\\Ubuntu\\home\\project"])(
    "should preserve the source-owned path %s and an explicit null source", async (projectPath) => {
      const fixture = createGitRoutingFixture();

      await fixture.router.handleRequest({ type: "git.status", projectPath, sourceId: null, workspaceId: undefined });

      expect(fixture.git.readStatus).toHaveBeenCalledTimes(1);
      expect(fixture.git.readStatus).toHaveBeenCalledWith(projectPath, null);
      expect(fixture.resolveToolRequest).not.toHaveBeenCalled();
    }
  );

  it("should preserve null generation options and an empty instruction", async () => {
    const fixture = createGitRoutingFixture();

    await fixture.router.handleRequest({ type: "git.commitMessage.generate", ...scope,
      instruction: "", model: null, reasoningEffort: null, language: "en" });

    expect(fixture.git.commitMessage.generate).toHaveBeenCalledTimes(1);
    expect(fixture.git.commitMessage.generate).toHaveBeenCalledWith(...scopeArgs, "", null, null, "en");
  });

  it("should forward a forced tag push and a staged diff comparison", async () => {
    const fixture = createGitRoutingFixture();

    await fixture.router.handleRequest({ type: "git.tag.push", ...scope, tagName: "v2", force: true });
    await fixture.router.handleRequest({ ...diffRequest, comparison: "staged" });

    expect(fixture.git.pushTag).toHaveBeenCalledTimes(1);
    expect(fixture.git.pushTag).toHaveBeenCalledWith(...scopeArgs, "v2", true);
    expect(fixture.git.readFileDiff).toHaveBeenCalledTimes(1);
    expect(fixture.git.readFileDiff).toHaveBeenCalledWith(...scopeArgs, "src/été.ts", "staged");
  });

  it("should retain an absent commit workspace without resolving or inventing one", async () => {
    const fixture = createGitRoutingFixture();

    await fixture.router.handleRequest({ type: "git.commit", ...scope, projectId: "project", message: "commit" });

    expect(fixture.git.commit).toHaveBeenCalledTimes(1);
    expect(fixture.git.commit).toHaveBeenCalledWith(...scopeArgs, "commit", "project", undefined);
    expect(fixture.resolveToolRequest).not.toHaveBeenCalled();
  });

  it.each(["", "   ", "\t\n"])("should reject the blank diff workspace %j before reading a file", async (workspaceId) => {
    const fixture = createGitRoutingFixture();
    const request: GitRequest = { ...diffRequest, workspaceId };

    expect(await fixture.router.handleRequest(request)).toBeUndefined();

    expect(fixture.resolveToolRequest).toHaveBeenCalledTimes(1);
    expect(fixture.resolveToolRequest).toHaveBeenCalledWith(request);
    expect(fixture.git.readFileDiff).not.toHaveBeenCalled();
    expect(fixture.handleRequestError).toHaveBeenCalledTimes(1);
    expect(fixture.handleRequestError).toHaveBeenCalledWith(request,
      new Error("Git file diffs require an explicit workspace context."));
  });

  it("should await workspace resolution before forwarding all resolved commit identities", async () => {
    const fixture = createGitRoutingFixture();
    const resolved: GitRequest = { ...commitRequest, projectPath: "/resolved/worktree", sourceId: "resolved-source",
      projectId: "resolved-project", workspaceId: "resolved-workspace" };
    let finish!: (request: OpenCodexRequest) => void;
    fixture.resolveToolRequest.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    const pending = fixture.router.handleRequest(commitRequest);
    expect(fixture.git.commit).not.toHaveBeenCalled();
    finish(resolved);

    expect(await pending).toBe(fixture.response);
    expect(fixture.resolveToolRequest).toHaveBeenCalledTimes(1);
    expect(fixture.resolveToolRequest).toHaveBeenCalledWith(commitRequest);
    expect(fixture.git.commit).toHaveBeenCalledTimes(1);
    expect(fixture.git.commit).toHaveBeenCalledWith(
      "/resolved/worktree", "resolved-source", "fix: été", "resolved-project", "resolved-workspace"
    );
  });

  it("should report workspace resolution failures against the original request without dispatching Git", async () => {
    const fixture = createGitRoutingFixture();
    const error = new Error("Source does not own this workspace");
    fixture.resolveToolRequest.mockRejectedValue(error);

    expect(await fixture.router.handleRequest(commitRequest)).toBeUndefined();

    expect(fixture.git.commit).not.toHaveBeenCalled();
    expect(fixture.handleRequestError).toHaveBeenCalledTimes(1);
    expect(fixture.handleRequestError).toHaveBeenCalledWith(commitRequest, error);
  });

  it.each(["synchronous", "asynchronous"])("should keep %s Git failures inside the shared error boundary", async (failure) => {
    const fixture = createGitRoutingFixture();
    const error = new Error("Git operation failed");
    if (failure === "synchronous") {
      fixture.git.commit.mockImplementation(() => { throw error; });
    } else {
      fixture.git.commit.mockRejectedValue(error);
    }
    fixture.resolveToolRequest.mockResolvedValue({ ...commitRequest, projectPath: "/resolved/worktree" });

    expect(await fixture.router.handleRequest(commitRequest)).toBeUndefined();

    expect(fixture.git.commit).toHaveBeenCalledTimes(1);
    expect(fixture.git.commit).toHaveBeenCalledWith(
      "/resolved/worktree", "source", "fix: été", "project", "workspace"
    );
    expect(fixture.handleRequestError).toHaveBeenCalledTimes(1);
    expect(fixture.handleRequestError).toHaveBeenCalledWith(commitRequest, error);
  });

  it("should preserve synchronous prompt results and undefined mutation results without a second dispatch", async () => {
    const fixture = createGitRoutingFixture();
    fixture.git.commitMessage.readPrompt.mockReturnValue(fixture.response);
    fixture.git.commitMessage.updatePrompt.mockResolvedValue(undefined);

    expect(await fixture.router.handleRequest({ type: "commitPrompt.get" })).toBe(fixture.response);
    expect(await fixture.router.handleRequest({ type: "commitPrompt.update", prompt: "" })).toBeUndefined();

    expect(fixture.git.commitMessage.readPrompt).toHaveBeenCalledTimes(1);
    expect(fixture.git.commitMessage.readPrompt).toHaveBeenCalledWith();
    expect(fixture.git.commitMessage.updatePrompt).toHaveBeenCalledTimes(1);
    expect(fixture.git.commitMessage.updatePrompt).toHaveBeenCalledWith("");
    expect(fixture.resolveToolRequest).not.toHaveBeenCalled();
    expect(fixture.handleRequestError).not.toHaveBeenCalled();
  });

  it("should keep unrelated requests in their own domains", () => {
    const requests: OpenCodexRequest[] = [
      { type: "projects.list" }, { type: "projectCommands.list", projectId: "project" },
      { type: "threads.list", scope: "all" }, { type: "settings.get" }
    ];

    for (const request of requests) {
      expect(isGitRequest(request)).toBe(false);
    }
  });
});
