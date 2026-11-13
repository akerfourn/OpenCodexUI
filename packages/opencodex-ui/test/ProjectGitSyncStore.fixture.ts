import type { OpenCodexGitSyncInspection, OpenCodexGitSyncPlan, OpenCodexGitSyncResult } from "@open-codex-ui/opencodex-protocol";
import { createProjectGitReferencesFixture, createRemote, createStatus } from "./ProjectGitReferencesStore.fixture";

/** Stable review returned by the mocked transport, not computed by the UI. */
export function syncPlan(): OpenCodexGitSyncPlan {
  return { target: { remoteName: "origin", branchName: "dev", setUpstream: false }, pushUrl: "https://origin.example.test/repository.git",
    branchName: "dev", localHead: "a".repeat(40), remoteHead: "b".repeat(40), aheadCount: 1, behindCount: 2,
    strategy: "rebase", action: "rebase" };
}
/** Local observation includes both source and ongoing Git metadata. */
export function syncInspection(): OpenCodexGitSyncInspection {
  return { status: createStatus({ branchName: "dev", upstreamName: "origin/dev", aheadCount: 1, behindCount: 2, remotes: [createRemote("origin")] }),
    operation: null, suggestedTarget: { remoteName: "origin", branchName: "dev", setUpstream: false } };
}
/** Builds a transport result without coupling tests to request implementation details. */
export function syncResult(outcome: OpenCodexGitSyncResult["outcome"], inspection = syncInspection(), plan: OpenCodexGitSyncPlan | null = null): OpenCodexGitSyncResult {
  return { outcome, inspection, plan, issue: null, details: null };
}
/** Real Git aggregate with deterministic request results and observable review state. */
export function createGitSyncStoreFixture() {
  const value = createProjectGitReferencesFixture({ status: syncInspection().status });
  value.request.mockImplementation(async (request) => {
    if (request.type === "git.sync.inspect") return syncResult("inspected");
    if (request.type === "git.sync.plan") return syncResult("planned", syncInspection(), {
      ...syncPlan(), target: { ...request.target }, strategy: request.strategy, action: request.strategy });
    if (request.type === "git.sync.execute") return syncResult("synchronized");
    if (request.type === "git.sync.continue") return syncResult("continued");
    if (request.type === "git.sync.abort") return syncResult("aborted");
    throw new Error(`Unexpected request: ${request.type}`);
  });
  return { ...value, sync: value.gitStore.sync };
}

