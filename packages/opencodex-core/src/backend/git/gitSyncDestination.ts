import type { OpenCodexGitStatus } from "@open-codex-ui/opencodex-protocol";
import { createGitErrorMessage, type RunGit } from "./gitCommandRunner.js";

/** Reads Git's publication defaults and associates counts with the exact selected branch. */
export async function readSyncDestination(
  runGit: RunGit, path: string, sourceId: string | null, status: OpenCodexGitStatus
): Promise<OpenCodexGitStatus> {
  const response = await runGit(path, sourceId,
    ["config", "--null", "--get-regexp", "^(remote\\.pushdefault|branch\\..*\\.(pushremote|remote|merge))$"],
    { allowFailure: true });
  if (response.stdoutCapReached || response.stderrCapReached) throw new Error("Incomplete Git destination configuration.");
  if (response.exitCode !== 0 && response.exitCode !== 1) throw new Error(createGitErrorMessage(response));
  const config = new Map<string, string>();
  for (const entry of response.stdout.split("\0")) {
    const separator = entry.indexOf("\n");
    if (separator > 0) config.set(entry.slice(0, separator), entry.slice(separator + 1));
  }
  const branch = status.branchName;
  const upstreamRemote = config.get(`branch.${branch}.remote`);
  const configuredFavorite = config.get("remote.pushdefault");
  const favoriteRemote = configuredFavorite
    ?? status.remotes.find(remote => remote.name === "origin")?.name ?? status.remotes[0]?.name ?? null;
  let branchRemote = config.get(`branch.${branch}.pushremote`) ?? null;
  // Preserve existing branch-specific Git setups until a repository-wide favorite is explicitly chosen.
  if (branchRemote === null && configuredFavorite === undefined && upstreamRemote !== undefined && upstreamRemote !== favoriteRemote) {
    branchRemote = upstreamRemote;
  }
  const remoteName = branchRemote ?? favoriteRemote;
  let target = null;
  if (branch !== null && remoteName !== null && status.remotes.some(remote => remote.name === remoteName)) {
    let branchName = branch;
    const merge = config.get(`branch.${branch}.merge`);
    if (remoteName === upstreamRemote && merge?.startsWith("refs/heads/")) branchName = merge.slice(11);
    target = { remoteName, branchName };
  }
  const result = { ...status, synchronization: { favoriteRemote, branchRemote, target } };
  if (target === null || `${target.remoteName}/${target.branchName}` === status.upstreamName) return result;

  const reference = `refs/remotes/${target.remoteName}/${target.branchName}`;
  const counts = await runGit(path, sourceId, ["rev-list", "--left-right", "--count", `HEAD...${reference}`, "--"],
    { allowFailure: true });
  const match = /^(\d+)\s+(\d+)\s*$/u.exec(counts.stdout);
  if (counts.exitCode === 0 && match !== null) {
    return { ...result, aheadCount: Number(match[1]), behindCount: Number(match[2]) };
  }
  // A not-yet-fetched destination needs a fresh remote check before any actual exchange.
  const local = await runGit(path, sourceId, ["rev-list", "--count", "HEAD", "--"], { allowFailure: true });
  let aheadCount = 0;
  if (local.exitCode === 0 && /^\d+\s*$/u.test(local.stdout)) aheadCount = Number(local.stdout.trim());
  return { ...result, aheadCount, behindCount: 0 };
}
