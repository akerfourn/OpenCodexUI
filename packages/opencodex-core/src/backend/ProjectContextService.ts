/**
 * Synchronizes project context folders into Codex project-local config.
 */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";

import { toError } from "./errors.js";

const defaultProfileId = "opencodex-context";
const defaultBlockStart = "# BEGIN OpenCodexUI managed default permissions";
const defaultBlockEnd = "# END OpenCodexUI managed default permissions";
const blockStart = "# BEGIN OpenCodexUI managed context permissions";
const blockEnd = "# END OpenCodexUI managed context permissions";

export type ProjectContextServiceOptions = {
  cacheRepository: OpenCodexCacheRepository | null;
  ensureClient(sourceId: string | null): Promise<CodexAppServerClient>;
};

/**
 * Generates and writes the OpenCodexUI-managed Codex permission profile.
 */
export class ProjectContextService {
  constructor(private readonly options: ProjectContextServiceOptions) {}

  /**
   * Synchronizes the configured context folders for one cached project.
   *
   * @param projectId Project identifier.
   * @returns Updated project with context sync metadata.
   */
  async syncProjectContext(projectId: string): Promise<OpenCodexProject> {
    const repository = this.requireCacheRepository();
    const project = await this.readProject(repository, projectId);

    if (project.sourceId === null) {
      throw new Error("Cannot synchronize context folders for a project without a Codex source.");
    }

    const context = project.preferences.context;
    const profileId = normalizeProfileId(context?.permissionsProfileId);
    const enabledFolders = context?.folders?.filter((folder) => folder.enabled) ?? [];
    const configPath = joinSourcePath(project.path, ".codex", "config.toml");
    const codexDirectoryPath = joinSourcePath(project.path, ".codex");
    const client = await this.options.ensureClient(project.sourceId);

    await this.ensureConfigDirectory(client, codexDirectoryPath);
    await client.createDirectory(codexDirectoryPath);

    const previousConfig = await this.readConfigFile(client, configPath);
    const managedBlock = buildManagedConfigBlock({
      projectPath: project.path,
      externalPaths: enabledFolders.map((folder) => folder.path),
      profileId
    });
    const nextConfig = replaceManagedBlock(previousConfig, managedBlock, profileId);

    await client.writeFile(configPath, Buffer.from(nextConfig, "utf8").toString("base64"));

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

  private requireCacheRepository(): OpenCodexCacheRepository {
    if (this.options.cacheRepository === null) {
      throw new Error("Project context storage is unavailable.");
    }

    return this.options.cacheRepository;
  }

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

type ManagedConfigBlockInput = {
  projectPath: string;
  externalPaths: string[];
  profileId: string;
};

export function buildManagedConfigBlock(input: ManagedConfigBlockInput): string {
  const uniqueExternalPaths = Array.from(new Set(input.externalPaths))
    .filter((path) => path !== input.projectPath);
  const protectedPaths = [input.projectPath, ...uniqueExternalPaths];
  const lines = [
    blockStart,
    `[permissions.${input.profileId}]`,
    `description = "OpenCodexUI project context."`,
    `extends = ":workspace"`,
    "",
    `[permissions.${input.profileId}.workspace_roots]`
  ];

  lines.push(`${quoteTomlKey(input.projectPath)} = true`);

  lines.push(
    "",
    `[permissions.${input.profileId}.filesystem]`
  );

  for (const path of uniqueExternalPaths) {
    lines.push(`${quoteTomlKey(path)} = "read"`);
  }

  for (const path of protectedPaths) {
    lines.push(`${quoteTomlKey(joinSourcePath(path, "**", "*.env"))} = "deny"`);
  }

  lines.push(blockEnd, "");

  return lines.join("\n");
}

export function replaceManagedBlock(config: string, block: string, profileId: string): string {
  const withoutManagedBlock = removeManagedDefaultBlock(removeManagedBlock(config));

  if (containsUnmanagedProfile(withoutManagedBlock, profileId)) {
    throw new Error(`Codex permissions profile "${profileId}" already exists outside OpenCodexUI managed block.`);
  }

  if (containsUnmanagedDefaultPermissions(withoutManagedBlock)) {
    throw new Error("Codex default_permissions already exists outside OpenCodexUI managed block.");
  }

  const withDefaultPermissions = insertManagedDefaultBlock(withoutManagedBlock, profileId);
  const normalizedConfig = withDefaultPermissions.trimEnd();

  if (normalizedConfig.length === 0) {
    return block;
  }

  return `${normalizedConfig}\n\n${block}`;
}

function insertManagedDefaultBlock(config: string, profileId: string): string {
  const block = [
    defaultBlockStart,
    `default_permissions = ${JSON.stringify(profileId)}`,
    defaultBlockEnd
  ].join("\n");
  const insertionIndex = findFirstTableIndex(config);

  if (config.trim().length === 0) {
    return `${block}\n`;
  }

  if (insertionIndex === -1) {
    return `${config.trimEnd()}\n\n${block}\n`;
  }

  const beforeTables = config.slice(0, insertionIndex).trimEnd();
  const tables = config.slice(insertionIndex).trimStart();

  if (beforeTables.length === 0) {
    return `${block}\n\n${tables}`;
  }

  return `${beforeTables}\n\n${block}\n\n${tables}`;
}

function removeManagedBlock(config: string): string {
  const startIndex = config.indexOf(blockStart);
  const endIndex = config.indexOf(blockEnd);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return config;
  }

  return `${config.slice(0, startIndex)}${config.slice(endIndex + blockEnd.length)}`;
}

function removeManagedDefaultBlock(config: string): string {
  const startIndex = config.indexOf(defaultBlockStart);
  const endIndex = config.indexOf(defaultBlockEnd);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return config;
  }

  return `${config.slice(0, startIndex)}${config.slice(endIndex + defaultBlockEnd.length)}`;
}

function containsUnmanagedProfile(config: string, profileId: string): boolean {
  const escapedProfileId = escapeRegExp(profileId);
  const pattern = new RegExp(`^\\s*\\[permissions\\.${escapedProfileId}(?:\\]|\\.)`, "m");
  return pattern.test(config);
}

function containsUnmanagedDefaultPermissions(config: string): boolean {
  const firstTableIndex = findFirstTableIndex(config);
  const rootConfig = firstTableIndex === -1 ? config : config.slice(0, firstTableIndex);

  return /^\s*default_permissions\s*=/m.test(rootConfig);
}

function findFirstTableIndex(config: string): number {
  const match = /^\s*\[[^\]]+\]/m.exec(config);
  return match?.index ?? -1;
}

function normalizeProfileId(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized !== undefined && normalized.length > 0 ? normalized : defaultProfileId;
}

function quoteTomlKey(value: string): string {
  return JSON.stringify(value);
}

function joinSourcePath(root: string, ...parts: string[]): string {
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const normalizedRoot = root.replace(/[\\/]+$/, "");
  return [normalizedRoot, ...parts].join(separator);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
