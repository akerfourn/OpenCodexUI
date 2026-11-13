import type { OpenCodexGitSyncPlan, OpenCodexGitSyncTarget } from "@open-codex-ui/opencodex-protocol";
import { createGitErrorMessage } from "./gitCommandRunner.js";
import { GitSyncFailure, GitSyncRepository, requireCommit } from "./gitSyncRepository.js";

/** Recognizes Git's standard mapping without guessing how custom refspecs should be changed. */
export async function hasStandardTracking(repo: GitSyncRepository, target: OpenCodexGitSyncTarget): Promise<boolean> {
  const response = await repo.git(["config", "--get-all", `remote.${target.remoteName}.fetch`], { allowFailure: true });
  if (response.exitCode === 1) return false;
  if (response.exitCode !== 0) throw new GitSyncFailure("gitFailed", createGitErrorMessage(response));
  return response.stdout.trim() === `+refs/heads/*:refs/remotes/${target.remoteName}/*`;
}

/** Updates ordinary tracking refs after an explicit-URL push, never rewinding a newer observation. */
export async function updateSyncTracking(repo: GitSyncRepository, plan: OpenCodexGitSyncPlan, head: string): Promise<void> {
  if (!await hasStandardTracking(repo, plan.target)) {
    if (plan.target.setUpstream) throw new GitSyncFailure("trackingSetupFailed");
    return;
  }
  const reference = `refs/remotes/${plan.target.remoteName}/${plan.target.branchName}`;
  const previous = await repo.git(["rev-parse", "--verify", reference], { allowFailure: true });
  let oldHead = "";
  if (previous.exitCode === 0) {
    oldHead = requireCommit(previous.stdout.trim());
    const ancestor = await repo.git(["merge-base", "--is-ancestor", oldHead, head], { allowFailure: true });
    if (ancestor.exitCode !== 0) {
      if (plan.target.setUpstream) throw new GitSyncFailure("trackingSetupFailed");
      return;
    }
  }
  const update = await repo.git(["update-ref", "--no-deref", reference, head, oldHead], { allowFailure: true });
  if (update.exitCode !== 0) throw new GitSyncFailure("trackingSetupFailed", createGitErrorMessage(update));
  if (plan.target.setUpstream) {
    const setup = await repo.git(["branch", `--set-upstream-to=${reference}`, "--", plan.branchName], { allowFailure: true });
    if (setup.exitCode !== 0) throw new GitSyncFailure("trackingSetupFailed", createGitErrorMessage(setup));
  }
}
