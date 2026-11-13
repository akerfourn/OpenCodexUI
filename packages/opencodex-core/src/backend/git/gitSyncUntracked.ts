import { GitSyncFailure, GitSyncRepository } from "./gitSyncRepository.js";

/** Protects untracked and ignored paths that an automatic checkout could otherwise replace. */
export async function requireNoUntrackedCollisions(repo: GitSyncRepository, local: string, remote: string): Promise<void> {
  const output = (await repo.git(["diff", "--name-only", "--diff-filter=A", "-z", local, remote, "--"])).stdout;
  const additions = output.split("\0").filter((value) => value.length > 0);
  if (additions.length === 0) return;
  const roots = [...new Set(additions.map((value) => value.split("/")[0]!))];
  const ignoreCase = await repo.config("core.ignoreCase", true) === "true";
  /** Uses the source repository's case behavior instead of the Electron host filesystem. */
  function comparable(value: string): string {
    if (ignoreCase) return value.normalize("NFC").toLowerCase();
    return value;
  }
  const incoming = additions.map(comparable);
  const conflicts = new Set<string>();
  for (let start = 0; start < roots.length; start += 64) {
    // Without exclusion flags, --others deliberately includes ignored files too.
    const untracked = (await repo.git(["--literal-pathspecs", "ls-files", "--others", "-z", "--", ...roots.slice(start, start + 64)])).stdout
      .split("\0").filter((value) => value.length > 0);
    for (const path of untracked) {
      const existing = comparable(path);
      if (incoming.some((target) => target === existing || target.startsWith(`${existing}/`) || existing.startsWith(`${target}/`))) {
        conflicts.add(path);
      }
    }
  }
  if (conflicts.size > 0) throw new GitSyncFailure("untrackedCollision", [...conflicts].join("\n"));
}
