import type { OpenCodexFileSearchResult } from "@open-codex-ui/opencodex-protocol";

const excludedFileSearchSegments = new Set([".git", ".hg", ".svn"]);

/**
 * Keeps project file references out of VCS implementation directories.
 *
 * @param path Candidate file path returned by Codex.
 * @returns True when the path should be searchable.
 */
export function isSearchableProjectFilePath(path: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  const segments = normalizedPath.split("/");

  return !segments.some((segment) => excludedFileSearchSegments.has(segment));
}

/**
 * Applies OpenCodexUI safety filtering to Codex fuzzy file search results.
 *
 * @param files File search results returned by Codex.
 * @returns File search results safe to show in the composer.
 */
export function filterSearchableProjectFiles(
  files: OpenCodexFileSearchResult[]
): OpenCodexFileSearchResult[] {
  return files.filter((file) => {
    return isSearchableProjectFilePath(file.relativePath) && isSearchableProjectFilePath(file.path);
  });
}
