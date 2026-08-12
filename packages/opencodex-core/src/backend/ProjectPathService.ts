/**
 * Ensures project paths in the filesystem owned by a Codex source or the host.
 */
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";

import type { OpenCodexBackendOptions } from "../types.js";
import { shouldValidateProjectPathOnHost } from "./projectMapping.js";
import type { ClientPort } from "./runtime/runtimePorts.js";

/** Dependencies used to ensure project paths. */
export type ProjectPathServiceOptions = {
  /** Provides host-owned filesystem access. */
  host: Pick<OpenCodexBackendOptions, "ensureProjectDirectory">;
  /** Provides source-owned filesystem access. */
  clients: Pick<ClientPort, "ensureClient">;
};

/** Ensures and normalizes project paths in the appropriate filesystem. */
export class ProjectPathService {
  /** Dependencies used to validate and create project paths. */
  private readonly options: ProjectPathServiceOptions;

  /**
   * Creates a project path service.
   *
   * @param options Host path and source client dependencies.
   */
  constructor(options: ProjectPathServiceOptions) {
    this.options = options;
  }

  /**
   * Ensures and normalizes a project path.
   *
   * @param projectPath Project path.
   * @param createIfMissing Whether the directory may be created.
   * @param source Source that owns the project path.
   *
   * @returns Normalized project path.
   */
  async ensure(
    projectPath: string,
    createIfMissing: boolean,
    source: CachedSource
  ): Promise<string> {
    if (!shouldValidateProjectPathOnHost(source)) {
      return await this.ensureSourceProjectPath(projectPath, createIfMissing, source);
    }

    const ensuredPath = await this.options.host.ensureProjectDirectory?.(projectPath, createIfMissing)
      ?? projectPath;
    const normalizedPath = normalizeProjectPath(ensuredPath);

    if (normalizedPath === null) {
      throw new Error("Project path is required.");
    }

    return normalizedPath;
  }

  /**
   * Ensures a project path through the source-owned filesystem.
   *
   * @param projectPath Project path.
   * @param createIfMissing Whether the directory may be created.
   * @param source Source that owns the project path.
   *
   * @returns Normalized project path.
   */
  private async ensureSourceProjectPath(
    projectPath: string,
    createIfMissing: boolean,
    source: CachedSource
  ): Promise<string> {
    const normalizedPath = normalizeProjectPath(projectPath);

    if (normalizedPath === null) {
      throw new Error("Project path is required.");
    }

    const client = await this.options.clients.ensureClient(source.id);

    try {
      const metadata = await client.getMetadata(normalizedPath);

      if (!metadata.isDirectory) {
        throw new Error(`Project path is not a directory: ${normalizedPath}`);
      }
    } catch (error) {
      if (!createIfMissing || !isMissingProjectPathError(error)) {
        throw error;
      }

      await client.createDirectory(normalizedPath);
    }

    return normalizedPath;
  }
}

/**
 * Detects whether a filesystem error means the project path is missing.
 *
 * @param error Error thrown by a filesystem operation.
 * @returns Whether the error indicates a missing project path.
 */
function isMissingProjectPathError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  return [
    "enoent",
    "no such file",
    "does not exist",
    "not exist",
    "path not found"
  ].some((marker) => normalizedMessage.includes(marker));
}
