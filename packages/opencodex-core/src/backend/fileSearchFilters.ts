import type { OpenCodexFileSearchResult } from "@open-codex-ui/opencodex-protocol";

const excludedFileSearchSegments = new Set([".git", ".hg", ".svn"]);

/**
 * Keeps project file references out of VCS implementation directories.
 */
export function isSearchableProjectFilePath(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  const segments = normalizedPath.split("/");

  return !segments.some((segment) => excludedFileSearchSegments.has(segment));
}

/**
 * Applies OpenCodexUI safety filtering to Codex fuzzy file search results.
 */
export function filterSearchableProjectFiles(
  files: OpenCodexFileSearchResult[]
): OpenCodexFileSearchResult[] {
  return files.filter((file) => {
    return isSearchableProjectFilePath(file.relativePath) && isSearchableProjectFilePath(file.path);
  });
}
