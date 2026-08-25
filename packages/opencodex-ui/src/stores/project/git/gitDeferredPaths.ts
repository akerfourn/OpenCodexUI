/**
 * Provides safe path matching for project-local Git files deferred in the UI.
 */

/**
 * Normalizes one relative Git path used by the deferred-path preference.
 *
 * @param value Path to normalize.
 * @returns Normalized relative path, or `null` when unsafe or empty.
 */
export function normalizeDeferredPath(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");

  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized.startsWith("/") ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    return null;
  }

  return normalized;
}

/**
 * Normalizes and deduplicates a deferred path collection.
 *
 * @param paths Paths to normalize.
 * @returns Sorted unique relative paths.
 */
export function normalizeDeferredPaths(paths: readonly string[]): string[] {
  return [...new Set(paths
    .map((path) => normalizeDeferredPath(path))
    .filter((path): path is string => path !== null))].sort();
}

/**
 * Adds paths while removing entries already covered by a parent directory.
 *
 * @param currentPaths Existing deferred paths.
 * @param paths Paths to add.
 * @returns Minimal sorted deferred path collection.
 */
export function mergeDeferredPaths(
  currentPaths: readonly string[],
  paths: readonly string[]
): string[] {
  const candidates = normalizeDeferredPaths([...currentPaths, ...paths])
    .sort((left, right) => left.length - right.length || left.localeCompare(right));
  const merged: string[] = [];

  for (const candidate of candidates) {
    if (merged.some((path) => isPathWithin(candidate, path))) {
      continue;
    }

    merged.push(candidate);
  }

  return merged.sort();
}

/**
 * Removes one exact deferred path entry.
 *
 * @param paths Existing deferred paths.
 * @param path Entry to remove.
 * @returns Updated sorted path collection.
 */
export function removeDeferredPath(paths: readonly string[], path: string): string[] {
  const normalizedPath = normalizeDeferredPath(path);

  if (normalizedPath === null) {
    return normalizeDeferredPaths(paths);
  }

  return normalizeDeferredPaths(paths).filter((entry) => entry !== normalizedPath);
}

/**
 * Checks whether a Git file is covered by a deferred file or directory path.
 *
 * @param filePath Changed Git file path.
 * @param deferredPaths Deferred file and directory paths.
 * @returns `true` when the file should be excluded from staging actions.
 */
export function isPathDeferred(filePath: string, deferredPaths: readonly string[]): boolean {
  return findDeferredPath(filePath, deferredPaths) !== null;
}

/**
 * Finds the deferred entry covering one Git file.
 *
 * @param filePath Changed Git file path.
 * @param deferredPaths Deferred file and directory paths.
 * @returns Matching deferred entry, or `null` when no entry matches.
 */
export function findDeferredPath(filePath: string, deferredPaths: readonly string[]): string | null {
  const normalizedFilePath = normalizeDeferredPath(filePath);

  if (normalizedFilePath === null) {
    return null;
  }

  return normalizeDeferredPaths(deferredPaths)
    .filter((path) => isPathWithin(normalizedFilePath, path))
    .sort((left, right) => right.length - left.length)[0] ?? null;
}

/**
 * Checks whether a path is equal to or nested below another path.
 *
 * @param path Candidate file or directory path.
 * @param parentPath Candidate parent path.
 * @returns `true` when the parent covers the candidate.
 */
function isPathWithin(path: string, parentPath: string): boolean {
  return path === parentPath || path.startsWith(`${parentPath}/`);
}
