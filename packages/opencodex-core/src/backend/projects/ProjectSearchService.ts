import {
  type FuzzyFileSearchResponse,
  type v2
} from "@open-codex-ui/codex-rpc";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexFileSearchResult,
  OpenCodexSkillSearchResult
} from "@open-codex-ui/opencodex-protocol";

import { filterSearchableProjectFiles } from "./fileSearchFilters.js";
import type { ClientPort } from "../runtime/runtimePorts.js";

/** Dependencies used by project-scoped search operations. */
export type ProjectSearchServiceOptions = {
  /** Codex client lifecycle operations used by searches. */
  clients: Pick<ClientPort, "ensureClient">;
};

/** Coordinates file and skill searches exposed by the composer. */
export class ProjectSearchService {
  /** Client resolver used to execute searches in the requested source. */
  private readonly options: ProjectSearchServiceOptions;

  /**
   * Creates a project search service.
   *
   * @param options Codex client resolver.
   */
  constructor(options: ProjectSearchServiceOptions) {
    this.options = options;
  }

  /**
   * Searches project files through the Codex source filesystem.
   *
   * @param projectPath Project root path.
   * @param sourceId Source identifier, or `null`.
   * @param query Fuzzy search query.
   * @param limit Maximum number of results.
   * @returns Matching files.
   */
  async searchProjectFiles(
    projectPath: string,
    sourceId: string | null,
    query: string,
    limit: number
  ): Promise<OpenCodexFileSearchResult[]> {
    const root = normalizeProjectPath(projectPath);

    if (root === null) {
      return [];
    }

    const client = await this.options.clients.ensureClient(sourceId);
    const normalizedLimit = Math.max(1, limit);

    if (query.trim().length === 0) {
      const response = await client.request<v2.FsReadDirectoryResponse>("fs/readDirectory", {
        path: root
      });
      const files = mapRootDirectorySearchResults(root, response.entries);

      return filterSearchableProjectFiles(files).slice(0, normalizedLimit);
    }

    const response = await client.request<FuzzyFileSearchResponse>("fuzzyFileSearch", {
      query,
      roots: [root],
      cancellationToken: null
    });

    const files = response.files
      .filter((file) => file.match_type === "file")
      .map((file) => ({
        root: file.root,
        path: file.path,
        relativePath: readRelativeFilePath(file.root, file.path),
        fileName: file.file_name,
        matchType: file.match_type
      }));

    return filterSearchableProjectFiles(files).slice(0, normalizedLimit);
  }

  /**
   * Searches enabled Codex skills available for a project.
   *
   * @param projectPath Project root path.
   * @param sourceId Source identifier, or `null`.
   * @param query User query without the `$` trigger.
   * @param limit Maximum number of results.
   * @returns Matching skills.
   */
  async searchProjectSkills(
    projectPath: string,
    sourceId: string | null,
    query: string,
    limit: number
  ): Promise<OpenCodexSkillSearchResult[]> {
    const root = normalizeProjectPath(projectPath);

    if (root === null) {
      return [];
    }

    const client = await this.options.clients.ensureClient(sourceId);
    const response = await client.request<v2.SkillsListResponse>("skills/list", {
      cwds: [root],
      forceReload: false
    });
    const allSkills = response.data.flatMap((entry: v2.SkillsListEntry) => entry.skills);
    const enabledSkills = allSkills.filter((skill: v2.SkillMetadata) => skill.enabled);
    const scoredSkills = enabledSkills
      .map((skill: v2.SkillMetadata) => ({
        skill,
        score: scoreSkillSearchResult(skill.name, skill.interface?.displayName, query)
      }))
      .filter((entry: { skill: v2.SkillMetadata; score: number }) => entry.score >= 0)
      .sort((
        left: { skill: v2.SkillMetadata; score: number },
        right: { skill: v2.SkillMetadata; score: number }
      ) => right.score - left.score || left.skill.name.localeCompare(right.skill.name));

    return scoredSkills.slice(0, Math.max(1, limit)).map(({ skill }) => ({
      name: skill.name,
      displayName: skill.interface?.displayName ?? skill.name,
      description: skill.description,
      shortDescription: skill.interface?.shortDescription ?? skill.shortDescription ?? null,
      path: String(skill.path),
      scope: skill.scope
    }));
  }
}

/**
 * Reads a project-relative path while tolerating mixed path separators.
 *
 * @param root Project root path.
 * @param filePath Absolute or source-local file path.
 * @returns Relative path suitable for UI display.
 */
function readRelativeFilePath(root: string, filePath: string): string {
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/+$/, "");
  const normalizedPath = filePath.replaceAll("\\", "/");
  const rootPrefix = `${normalizedRoot}/`;

  if (normalizedPath.startsWith(rootPrefix)) {
    return normalizedPath.slice(rootPrefix.length);
  }

  return normalizedPath.replace(/^\/+/, "");
}

/**
 * Converts directory entries from one root into file-search results.
 *
 * @param root Root path that was searched.
 * @param entries Directory entries returned by Codex.
 * @returns Search results ordered with directories first.
 */
function mapRootDirectorySearchResults(
  root: string,
  entries: v2.FsReadDirectoryEntry[]
): OpenCodexFileSearchResult[] {
  return entries
    .filter((entry) => entry.isFile || entry.isDirectory)
    .sort(compareDirectoryEntry)
    .map((entry) => ({
      root,
      path: joinSourcePath(root, entry.fileName),
      relativePath: entry.fileName,
      fileName: entry.fileName,
      matchType: entry.isDirectory ? "directory" : "file"
    }));
}

/**
 * Orders directory entries for root-level fallback search.
 *
 * @param left Left directory entry.
 * @param right Right directory entry.
 * @returns Sort order with directories before files.
 */
function compareDirectoryEntry(
  left: v2.FsReadDirectoryEntry,
  right: v2.FsReadDirectoryEntry
): number {
  if (left.isDirectory !== right.isDirectory) {
    return left.isDirectory ? -1 : 1;
  }

  return left.fileName.localeCompare(right.fileName);
}

/**
 * Joins a source-local root with one child name.
 *
 * @param root Source-local root path.
 * @param childName Child entry name.
 * @returns Joined path using the source path style.
 */
function joinSourcePath(root: string, childName: string): string {
  if (root.endsWith("/") || root.endsWith("\\")) {
    return `${root}${childName}`;
  }

  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";

  return `${root}${separator}${childName}`;
}

/**
 * Scores a skill search candidate against a fuzzy query.
 *
 * @param name Skill technical name.
 * @param displayName Optional display name.
 * @param query User search text.
 * @returns Positive score for matches, or -1 for no match.
 */
function scoreSkillSearchResult(
  name: string,
  displayName: string | undefined,
  query: string
): number {
  const normalizedQuery = query.trim().toLowerCase();
  const candidates = [
    name.toLowerCase(),
    displayName?.toLowerCase() ?? ""
  ];

  if (normalizedQuery.length === 0) {
    return 1;
  }

  if (candidates.some((candidate) => candidate === normalizedQuery)) {
    return 100;
  }

  if (candidates.some((candidate) => candidate.startsWith(normalizedQuery))) {
    return 80;
  }

  if (candidates.some((candidate) => candidate.includes(normalizedQuery))) {
    return 60;
  }

  if (candidates.some((candidate) => isFuzzyMatch(candidate, normalizedQuery))) {
    return 30;
  }

  return -1;
}

/**
 * Checks whether all query characters appear in order in a candidate.
 *
 * @param candidate Normalized candidate text.
 * @param query Normalized query text.
 * @returns Whether the candidate fuzzy-matches the query.
 */
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
