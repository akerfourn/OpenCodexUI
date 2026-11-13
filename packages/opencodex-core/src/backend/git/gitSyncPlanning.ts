import { randomUUID } from "node:crypto";
import type { OpenCodexGitSyncPlan, OpenCodexGitSyncStrategy, OpenCodexGitSyncTarget } from "@open-codex-ui/opencodex-protocol";
import { createGitErrorMessage } from "./gitCommandRunner.js";
import { GitSyncFailure, GitSyncRepository, requireCommit } from "./gitSyncRepository.js";
import { hasStandardTracking } from "./gitSyncTracking.js";
import { requireNoUntrackedCollisions } from "./gitSyncUntracked.js";

/** Fetches the exact reviewed push endpoint into an isolated, temporary reference. */
export async function planSynchronization(
  repo: GitSyncRepository, target: OpenCodexGitSyncTarget, strategy: OpenCodexGitSyncStrategy
): Promise<OpenCodexGitSyncPlan> {
  if (strategy !== "rebase" && strategy !== "merge") throw new GitSyncFailure("invalidTarget");
  const initial = await repo.requireReady();
  const branchName = initial.status.branchName!;
  const localHead = await repo.head();
  const pushUrl = await repo.pushUrl(target, initial.status);
  if (target.setUpstream && !await hasStandardTracking(repo, target)) throw new GitSyncFailure("unsupportedTracking");
  const remoteHead = await repo.remoteHead(pushUrl, target.branchName);
  if (remoteHead !== null) await fetchDestination(repo, pushUrl, target.branchName, remoteHead);
  await repo.requireReady(branchName, localHead);
  let aheadCount = Number(await repo.text(["rev-list", "--count", localHead]));
  let behindCount = 0;
  if (remoteHead !== null) {
    const counts = (await repo.text(["rev-list", "--left-right", "--count", `${localHead}...${remoteHead}`])).split(/\s+/u);
    aheadCount = Number(counts[0]);
    behindCount = Number(counts[1]);
    if (aheadCount > 0 && behindCount > 0) {
      const base = await repo.git(["merge-base", localHead, remoteHead], { allowFailure: true });
      if (base.exitCode === 1) throw new GitSyncFailure("unrelatedHistories");
      if (base.exitCode !== 0) throw new GitSyncFailure("gitFailed", createGitErrorMessage(base));
    }
  }
  if (!Number.isSafeInteger(aheadCount) || !Number.isSafeInteger(behindCount)) throw new GitSyncFailure("gitFailed");
  if (behindCount > 0 && remoteHead !== null) await requireNoUntrackedCollisions(repo, localHead, remoteHead);
  let action: OpenCodexGitSyncPlan["action"] = "none";
  if (aheadCount > 0) action = "push";
  if (behindCount > 0) action = "fastForward";
  if (aheadCount > 0 && behindCount > 0) action = strategy;
  const plan: OpenCodexGitSyncPlan = {
    target: { ...target }, pushUrl, branchName, localHead, remoteHead,
    aheadCount, behindCount, strategy, action
  };
  await validateIntegration(repo, plan);
  return plan;
}

/** Refuses to rewrite known published commits or create commits on a protected branch. */
async function validateIntegration(repo: GitSyncRepository, plan: OpenCodexGitSyncPlan): Promise<void> {
  if (plan.action !== "rebase" && plan.action !== "merge") return;
  const protectedBranches = await repo.ports.protectedBranches(repo.scope);
  if (protectedBranches.includes(plan.branchName)) throw new GitSyncFailure("protectedBranch");
  if (plan.action === "rebase" && plan.remoteHead !== null) {
    const unpublished = Number(await repo.text(["rev-list", "--count", plan.localHead, "--not", plan.remoteHead, "--remotes"]));
    if (unpublished !== plan.aheadCount) throw new GitSyncFailure("publishedCommits");
  }
}

/** Verifies every meaningful review field while ignoring JSON property order. */
export function sameSyncPlan(reviewed: OpenCodexGitSyncPlan, current: OpenCodexGitSyncPlan): boolean {
  return reviewed.branchName === current.branchName && reviewed.localHead === current.localHead
    && reviewed.remoteHead === current.remoteHead && reviewed.pushUrl === current.pushUrl
    && reviewed.strategy === current.strategy && reviewed.action === current.action
    && reviewed.aheadCount === current.aheadCount && reviewed.behindCount === current.behindCount
    && reviewed.target.remoteName === current.target.remoteName && reviewed.target.branchName === current.target.branchName
    && reviewed.target.setUpstream === current.target.setUpstream;
}

/** Retrieves only one destination branch, without overwriting FETCH_HEAD or tracking refs. */
async function fetchDestination(repo: GitSyncRepository, url: string, branch: string, expected: string): Promise<void> {
  const reference = `refs/opencodexui/sync/${randomUUID()}`;
  try {
    await repo.git(["fetch", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", "--", url, `refs/heads/${branch}:${reference}`]);
    const fetched = requireCommit(await repo.text(["rev-parse", "--verify", reference]));
    if (fetched !== expected) throw new GitSyncFailure("remoteChanged");
  } finally {
    await repo.git(["update-ref", "-d", reference]);
  }
}
