import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import type { OpenCodexFileSearchResult } from "@open-codex-ui/opencodex-protocol";

import { filterSearchableProjectFiles } from "./fileSearchFilters.js";

/** Maximum number of directories traversed by one extended search. */
const MAX_DIRECTORIES_TO_SCAN = 4_096;

/** Maximum number of files retained by one extended-search index. */
const MAX_FILES_TO_INDEX = 25_000;

/** Number of directory requests issued concurrently during an index build. */
const DIRECTORY_BATCH_SIZE = 8;

/** Lifetime of one source-scoped filesystem index. */
const FILE_SYSTEM_INDEX_TTL_MS = 30_000;

/** Directories that are never useful as composer file references. */
const excludedDirectorySegments = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules"
]);

/** Client operations required for source-scoped filesystem traversal. */
export type ProjectFileSystemSearchClient = Pick<CodexAppServerClient, "request">;

type DirectoryToScan = {
  path: string;
  isRoot: boolean;
};

type CachedFileIndex = {
  expiresAt: number;
  promise: Promise<OpenCodexFileSearchResult[]>;
};

/** Performs bounded, source-aware file searches without consulting Git. */
export class ProjectFileSystemSearchService {
  /** In-memory indexes keyed by source and project root. */
  private readonly indexCache = new Map<string, CachedFileIndex>();

  /**
   * Searches all searchable files below a source-owned project root.
   *
   * @param client Source-scoped Codex app-server client.
   * @param sourceId Source identifier, or `null` for the default source.
   * @param root Project root path in the source filesystem.
   * @param query Fuzzy path or filename query.
   * @param limit Maximum number of results.
   * @returns Matching files ordered by relevance and path.
   */
  async search(
    client: ProjectFileSystemSearchClient,
    sourceId: string | null,
    root: string,
    query: string,
    limit: number
  ): Promise<OpenCodexFileSearchResult[]> {
    const files = await this.readIndex(client, sourceId, root);
    const normalizedQuery = query.trim().toLowerCase();
    const normalizedLimit = Math.max(1, limit);

    return files
      .map((file) => ({
        file,
        score: scoreFileSearchResult(file, normalizedQuery)
      }))
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => (
        right.score - left.score || left.file.relativePath.localeCompare(right.file.relativePath)
      ))
      .slice(0, normalizedLimit)
      .map((entry) => entry.file);
  }

  /** Clears all cached filesystem indexes owned by this service. */
  clear(): void {
    this.indexCache.clear();
  }

  /** Returns a fresh or in-flight index for one source and project root. */
  private async readIndex(
    client: ProjectFileSystemSearchClient,
    sourceId: string | null,
    root: string
  ): Promise<OpenCodexFileSearchResult[]> {
    const cacheKey = `${sourceId ?? "<default>"}\u0000${root}`;
    const cachedIndex = this.indexCache.get(cacheKey);

    if (cachedIndex !== undefined && cachedIndex.expiresAt > Date.now()) {
      return await cachedIndex.promise;
    }

    const indexPromise = this.buildIndex(client, root);
    const nextIndex: CachedFileIndex = {
      expiresAt: Number.POSITIVE_INFINITY,
      promise: indexPromise
    };
    this.indexCache.set(cacheKey, nextIndex);

    void indexPromise.then(
      () => {
        if (this.indexCache.get(cacheKey) === nextIndex) {
          nextIndex.expiresAt = Date.now() + FILE_SYSTEM_INDEX_TTL_MS;
        }
      },
      () => {
        if (this.indexCache.get(cacheKey) === nextIndex) {
          this.indexCache.delete(cacheKey);
        }
      }
    );

    return await indexPromise;
  }

  /** Builds a bounded recursive index using only Codex filesystem requests. */
  private async buildIndex(
    client: ProjectFileSystemSearchClient,
    root: string
  ): Promise<OpenCodexFileSearchResult[]> {
    const pendingDirectories: DirectoryToScan[] = [{ path: root, isRoot: true }];
    const visitedDirectories = new Set<string>();
    const files: OpenCodexFileSearchResult[] = [];

    while (pendingDirectories.length > 0 && visitedDirectories.size < MAX_DIRECTORIES_TO_SCAN) {
      const batch = pendingDirectories.splice(0, DIRECTORY_BATCH_SIZE);
      const responses = await Promise.all(
        batch.map((directory) => this.readDirectory(client, directory))
      );

      for (let index = 0; index < batch.length; index += 1) {
        const directory = batch[index];
        const response = responses[index];

        if (directory === undefined || response === undefined || response === null) {
          continue;
        }

        const directoryKey = normalizeDirectoryKey(directory.path);

        if (visitedDirectories.has(directoryKey)) {
          continue;
        }

        visitedDirectories.add(directoryKey);

        for (const entry of response.entries) {
          if (!entry.isFile && !entry.isDirectory) {
            continue;
          }

          const entryPath = joinSourcePath(directory.path, entry.fileName);
          const relativePath = readRelativeFilePath(root, entryPath);

          if (entry.isFile) {
            files.push({
              root,
              path: entryPath,
              relativePath,
              fileName: entry.fileName,
              matchType: "file"
            });

            if (files.length >= MAX_FILES_TO_INDEX) {
              break;
            }
          }

          if (entry.isDirectory && shouldTraverseDirectory(relativePath)) {
            pendingDirectories.push({
              path: entryPath,
              isRoot: false
            });
          }
        }

        if (files.length >= MAX_FILES_TO_INDEX) {
          break;
        }
      }
    }

    return filterSearchableProjectFiles(files);
  }

  /** Reads one directory while skipping inaccessible or symbolic directories. */
  private async readDirectory(
    client: ProjectFileSystemSearchClient,
    directory: DirectoryToScan
  ): Promise<v2.FsReadDirectoryResponse | null> {
    if (!directory.isRoot) {
      const metadata = await this.readMetadata(client, directory.path);

      if (metadata === null || metadata.isSymlink || !metadata.isDirectory) {
        return null;
      }
    }

    try {
      return await client.request<v2.FsReadDirectoryResponse>("fs/readDirectory", {
        path: directory.path
      });
    } catch (error) {
      if (directory.isRoot) {
        throw error;
      }

      return null;
    }
  }

  /** Reads metadata needed to prevent traversal through symbolic directories. */
  private async readMetadata(
    client: ProjectFileSystemSearchClient,
    path: string
  ): Promise<v2.FsGetMetadataResponse | null> {
    try {
      return await client.request<v2.FsGetMetadataResponse>("fs/getMetadata", { path });
    } catch {
      return null;
    }
  }
}

/** Returns a relevance score for one filesystem result. */
function scoreFileSearchResult(file: OpenCodexFileSearchResult, query: string): number {
  if (query.length === 0) {
    return 1;
  }

  const relativePath = file.relativePath.toLowerCase();
  const fileName = file.fileName.toLowerCase();

  if (relativePath === query) {
    return 100;
  }

  if (fileName === query) {
    return 95;
  }

  if (fileName.startsWith(query)) {
    return 80;
  }

  if (relativePath.startsWith(query)) {
    return 75;
  }

  if (fileName.includes(query)) {
    return 60;
  }

  if (relativePath.includes(query)) {
    return 55;
  }

  return isFuzzyMatch(relativePath, query) ? 30 : -1;
}

/** Checks whether all query characters appear in order in a path. */
function isFuzzyMatch(candidate: string, query: string): boolean {
  let candidateIndex = 0;

  for (const queryCharacter of query) {
    candidateIndex = candidate.indexOf(queryCharacter, candidateIndex);

    if (candidateIndex === -1) {
      return false;
    }

    candidateIndex += 1;
  }

  return true;
}

/** Returns whether an extended search may descend into a relative directory. */
function shouldTraverseDirectory(relativePath: string): boolean {
  const segments = relativePath.replaceAll("\\", "/").split("/");

  return !segments.some((segment) => excludedDirectorySegments.has(segment));
}

/** Normalizes a source path for cycle detection without changing its meaning. */
function normalizeDirectoryKey(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+$/, "");
}

/** Reads a root-relative path while tolerating mixed source path separators. */
function readRelativeFilePath(root: string, filePath: string): string {
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/+$/, "");
  const normalizedPath = filePath.replaceAll("\\", "/");
  const rootPrefix = `${normalizedRoot}/`;

  if (normalizedPath.startsWith(rootPrefix)) {
    return normalizedPath.slice(rootPrefix.length);
  }

  return normalizedPath.replace(/^\/+/, "");
}

/** Joins a source-local root with a direct child name. */
function joinSourcePath(root: string, childName: string): string {
  if (root.endsWith("/") || root.endsWith("\\")) {
    return `${root}${childName}`;
  }

  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";

  return `${root}${separator}${childName}`;
}
