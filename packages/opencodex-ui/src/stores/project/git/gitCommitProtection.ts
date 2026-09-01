/** Provides pure helpers for project-local commit protection. */

/**
 * Normalizes branch names stored in project preferences.
 *
 * @param branchNames Branch names to normalize.
 * @returns Unique, trimmed branch names in stable order.
 */
export function normalizeCommitProtectedBranches(
  branchNames: readonly string[]
): string[] {
  const normalizedBranchNames = branchNames
    .map((branchName) => branchName.trim())
    .filter((branchName) => branchName.length > 0);

  return [...new Set(normalizedBranchNames)].sort();
}

/**
 * Checks whether a branch is protected from OpenCodexUI commits.
 *
 * @param branchName Current branch name, or `null` when unavailable.
 * @param protectedBranches Configured protected branch names.
 * @returns Whether the current branch is protected.
 */
export function isCommitProtectedBranch(
  branchName: string | null,
  protectedBranches: readonly string[]
): boolean {
  return branchName !== null && protectedBranches.includes(branchName);
}
