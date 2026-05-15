/**
 * Validates project paths in the filesystem owned by a Codex source.
 */
import { statSync } from "node:fs";

import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";

import { shouldValidateProjectPathOnHost } from "./projectMapping.js";

const MISSING_PATH_ERROR_MARKERS = [
  "enoent",
  "no such file",
  "does not exist",
  "not exist",
  "path not found"
];

/**
 * Caches source-local path validation during one synchronization pass.
 */
export class ProjectPathVisibilityValidator {
  private readonly hiddenByProjectPath = new Map<string, Promise<boolean>>();

  constructor(
    private readonly source: CachedSource,
    private readonly client: CodexAppServerClient
  ) {}

  /**
   * Checks whether a project path should be hidden from the UI.
   *
   * @param projectPath Project path returned by Codex.
   *
   * @returns Whether the project path should be hidden.
   */
  async shouldHideProjectPath(projectPath: string | null): Promise<boolean> {
    const normalizedProjectPath = normalizeProjectPath(projectPath);

    if (normalizedProjectPath === null) {
      return false;
    }

    const cachedResult = this.hiddenByProjectPath.get(normalizedProjectPath);

    if (cachedResult !== undefined) {
      return cachedResult;
    }

    const result = this.validateProjectPath(normalizedProjectPath);
    this.hiddenByProjectPath.set(normalizedProjectPath, result);
    return result;
  }

  private async validateProjectPath(projectPath: string): Promise<boolean> {
    if (shouldValidateProjectPathOnHost(this.source)) {
      return shouldHideHostProjectPath(projectPath);
    }

    return shouldHideSourceProjectPath(this.client, projectPath);
  }
}

function shouldHideHostProjectPath(projectPath: string): boolean {
  try {
    return !statSync(projectPath).isDirectory();
  } catch {
    return true;
  }
}

async function shouldHideSourceProjectPath(
  client: CodexAppServerClient,
  projectPath: string
): Promise<boolean> {
  try {
    const metadata = await client.request<v2.FsGetMetadataResponse>("fs/getMetadata", {
      path: projectPath
    });

    return metadata.isDirectory === false;
  } catch (error) {
    return isMissingProjectPathError(error);
  }
}

function isMissingProjectPathError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  return MISSING_PATH_ERROR_MARKERS.some((marker) => normalizedMessage.includes(marker));
}
