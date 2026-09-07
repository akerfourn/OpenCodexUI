/**
 * Synchronizes project context folders into Codex project-local config.
 */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexProject
} from "@open-codex-ui/opencodex-protocol";

import { requireToolWorkspace } from "../workspaces/workspaceToolContext.js";
import { toError } from "../shared/errors.js";
import type { ClientPort } from "../runtime/runtimePorts.js";

import { buildManagedConfigBlock, replaceManagedBlock, normalizeProfileId, joinSourcePath } from
  "./projectContextConfig.js";
export { buildManagedConfigBlock, replaceManagedBlock } from "./projectContextConfig.js";

export type ProjectContextServiceOptions = {
  cacheRepository: OpenCodexCacheRepository | null;
  clients: Pick<ClientPort, "ensureClient">;
};

/**
 * Generates and writes the OpenCodexUI-managed Codex permission profile.
 */
export class ProjectContextService {
  /**
   * Creates a project context service.
   *
   * @param options Cache access and Codex client port.
   */
  constructor(private readonly options: ProjectContextServiceOptions) {}

  /**
   * Synchronizes the configured context folders for one cached project.
   *
   * @param projectId Project identifier.
   * @returns Updated project with context sync metadata.
   */
  async syncProjectContext(projectId: string, workspaceId?: string): Promise<OpenCodexProject> {
    const repository = this.requireCacheRepository();
    const project = await this.readProject(repository, projectId);

    if (project.sourceId === null) {
      throw new Error("Cannot synchronize context folders for a project without a Codex source.");
    }

    const workspace = workspaceId === undefined ? null
      : await requireToolWorkspace(repository, workspaceId, projectId);
    const executionPath = workspace?.path ?? project.path;
    const executionSourceId = workspace?.sourceId ?? project.sourceId;
    const context = project.preferences.context;
    const profileId = normalizeProfileId(context?.permissionsProfileId);
    const enabledFolders = context?.folders?.filter((folder) => folder.enabled) ?? [];
    const configPath = joinSourcePath(executionPath, ".codex", "config.toml");
    const codexDirectoryPath = joinSourcePath(executionPath, ".codex");
    const client = await this.options.clients.ensureClient(executionSourceId);

    await this.ensureConfigDirectory(client, codexDirectoryPath);
    await client.createDirectory(codexDirectoryPath);

    const previousConfig = await this.readConfigFile(client, configPath);
    const managedBlock = buildManagedConfigBlock({
      projectPath: executionPath,
      externalFolders: enabledFolders,
      profileId
    });
    const nextConfig = replaceManagedBlock(previousConfig, managedBlock, profileId);

    await client.writeFile(configPath, Buffer.from(nextConfig, "utf8").toString("base64"));

    if (workspace !== null && !workspace.isPrimary) {
      return project;
    }

    const updatedProject = await repository.updateProjectPreferences(projectId, {
      ...project.preferences,
      context: {
        permissionsProfileId: profileId,
        folders: context?.folders ?? [],
        lastSyncedAt: new Date().toISOString()
      }
    });

    if (updatedProject === null) {
      throw new Error("Project disappeared while synchronizing context folders.");
    }

    return {
      id: updatedProject.id,
      sourceId: updatedProject.sourceId,
      path: updatedProject.path,
      defaultName: updatedProject.defaultName,
      displayName: updatedProject.displayName,
      isHidden: updatedProject.isHidden,
      preferences: updatedProject.preferences,
      createdAt: updatedProject.createdAt,
      updatedAt: updatedProject.updatedAt,
      lastSeenAt: updatedProject.lastSeenAt,
      editedAt: updatedProject.editedAt
    };
  }

  /**
   * Returns the cache repository required for context persistence.
   *
   * @returns Cache repository.
   * @throws When SQLite cache is unavailable.
   */
  private requireCacheRepository(): OpenCodexCacheRepository {
    if (this.options.cacheRepository === null) {
      throw new Error("Project context storage is unavailable.");
    }

    return this.options.cacheRepository;
  }

  /**
   * Reads one project from the cache by id.
   *
   * @param repository Cache repository.
   * @param projectId Project identifier.
   * @returns Project DTO.
   * @throws When the project cannot be found.
   */
  private async readProject(
    repository: OpenCodexCacheRepository,
    projectId: string
  ): Promise<OpenCodexProject> {
    const projects = await repository.listProjects();
    const project = projects.find((candidate) => candidate.id === projectId);

    if (project === undefined) {
      throw new Error("Project not found.");
    }

    return {
      id: project.id,
      sourceId: project.sourceId,
      path: project.path,
      defaultName: project.defaultName,
      displayName: project.displayName,
      isHidden: project.isHidden,
      preferences: project.preferences,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      lastSeenAt: project.lastSeenAt,
      editedAt: project.editedAt
    };
  }

  /**
   * Reads an existing project-local Codex config file.
   *
   * @param client Codex client for the project source.
   * @param configPath Source-local config path.
   * @returns Config content, or an empty string when missing.
   */
  private async readConfigFile(client: CodexAppServerClient, configPath: string): Promise<string> {
    try {
      const response = await client.readFile(configPath);
      return Buffer.from(response.dataBase64, "base64").toString("utf8");
    } catch (error) {
      const message = toError(error).message.toLowerCase();

      if (message.includes("not found") || message.includes("no such file")) {
        return "";
      }

      throw error;
    }
  }

  /**
   * Ensures the target `.codex` path can be used as a directory.
   *
   * @param client Codex client for the project source.
   * @param codexDirectoryPath Source-local `.codex` directory path.
   * @returns Nothing.
   * @throws When the path exists as a file or metadata lookup fails unexpectedly.
   */
  private async ensureConfigDirectory(client: CodexAppServerClient, codexDirectoryPath: string): Promise<void> {
    try {
      const metadata = await client.getMetadata(codexDirectoryPath);

      if (metadata.isFile) {
        throw new Error(
          `Cannot synchronize context folders because ${codexDirectoryPath} is a file. ` +
          "Remove or rename it so OpenCodexUI can create the Codex project config directory."
        );
      }
    } catch (error) {
      const message = toError(error).message.toLowerCase();

      if (message.includes("not found") || message.includes("no such file")) {
        return;
      }

      throw error;
    }
  }
}
