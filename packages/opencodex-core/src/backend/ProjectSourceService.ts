/**
 * Owns source and project cache operations.
 */
import type {
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import { createProjectIdentity, normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexProject,
  OpenCodexProjectPreferences,
  OpenCodexSource,
  OpenCodexSourceKind,
  OpenCodexSourceSettingsPatch
} from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexBackendOptions } from "../types.js";
import { createUncachedProject, toOpenCodexProject } from "./projectMapping.js";
import { ProjectPathService } from "./ProjectPathService.js";
import type {
  ClientPort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "./runtime/runtimePorts.js";
import { SourceCatalogService } from "./SourceCatalogService.js";
import { SourceDetectionService } from "./SourceDetectionService.js";
import { SourceThreadSyncService } from "./SourceThreadSyncService.js";
import type {
  SourceCatalogPort,
  SourceThreadSyncPort,
  SourceUpdateStatusPort
} from "./sourcePorts.js";

export type ProjectSourceServiceOptions = {
  backendOptions: OpenCodexBackendOptions;
  cacheRepository: OpenCodexCacheRepository | null;
  settings: Pick<RuntimeSettingsPort, "getSettings" | "setSettings">;
  events: Pick<RuntimeEventPort, "emit">;
  clients: Pick<ClientPort, "ensureClient" | "restartClient">;
  updates: SourceUpdateStatusPort;
};

/**
 * Coordinates project and source persistence with Codex source synchronization.
 */
export class ProjectSourceService {
  /** Service used to validate and create project paths. */
  private readonly projectPaths: ProjectPathService;
  /** Service used to persist, resolve, and present configured sources. */
  private readonly sourceCatalog: SourceCatalogPort;
  /** Service used to synchronize source-owned thread indexes. */
  private readonly sourceThreadSync: SourceThreadSyncPort;

  /**
   * Creates a project/source service.
   *
   * @param options Backend options, cache, settings, event, and client ports.
   */
  constructor(private readonly options: ProjectSourceServiceOptions) {
    this.projectPaths = new ProjectPathService({
      host: options.backendOptions,
      clients: options.clients
    });
    const sourceDetection = new SourceDetectionService({
      cacheRepository: options.cacheRepository,
      host: options.backendOptions
    });
    this.sourceCatalog = new SourceCatalogService({
      cacheRepository: options.cacheRepository,
      settings: options.settings,
      clients: options.clients,
      detection: sourceDetection,
      updates: options.updates,
      host: options.backendOptions
    });
    this.sourceThreadSync = new SourceThreadSyncService({
      cacheRepository: options.cacheRepository,
      settings: options.settings,
      clients: options.clients,
      detection: sourceDetection,
      host: options.backendOptions
    });
  }

  /**
   * Lists cached projects and emits them to the UI.
   *
   * @returns Cached project collection.
   */
  async listProjects(): Promise<OpenCodexProject[]> {
    const cachedProjects = await this.readCachedProjects();
    this.options.events.emit({ type: "projects.updated", projects: cachedProjects });
    return cachedProjects;
  }

  /**
   * Lists configured sources and emits them to the UI.
   *
   * @returns Source collection.
   */
  async listSources(): Promise<OpenCodexSource[]> {
    await this.ensureSourcesInitialized();
    const sources = await this.listOpenCodexSources();
    this.options.events.emit({
      type: "sources.updated",
      sources,
      defaultSourceId: this.options.settings.getSettings().defaultSourceId
    });
    return sources;
  }

  /**
   * Creates a new Codex source.
   *
   * @param name Optional source name.
   *
   * @returns Created source.
   */
  async createSource(
    name: string,
    kind: OpenCodexSourceKind,
    sourceSettings: OpenCodexSourceSettingsPatch
  ): Promise<OpenCodexSource> {
    const result = await this.sourceCatalog.createSource(name, kind, sourceSettings);
    this.options.events.emit({
      type: "sources.updated",
      sources: await this.sourceCatalog.listOpenCodexSources(),
      defaultSourceId: result.defaultSourceId
    });
    return result.source;
  }

  /**
   * Synchronizes projects from one source or all sources.
   *
   * @param sourceId Source identifier, or `null` for every source.
   *
   * @returns Refreshed project collection.
   */
  async syncSources(sourceId: string | null): Promise<OpenCodexProject[]> {
    await this.ensureSourcesInitialized();
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return [];
    }

    const sources = sourceId === null
      ? await this.sourceCatalog.listCachedSources()
      : [await this.sourceCatalog.resolveSource(sourceId)];

    for (const source of sources) {
      await this.sourceThreadSync.syncSource(source);
    }

    const projects = await this.readCachedProjects();
    this.options.events.emit({ type: "projects.updated", projects });
    this.options.events.emit({
      type: "sources.updated",
      sources: await this.sourceCatalog.listOpenCodexSources(),
      defaultSourceId: this.options.settings.getSettings().defaultSourceId
    });
    return projects;
  }

  /**
   * Updates whether a project is hidden.
   *
   * @param projectId Project identifier.
   * @param isHidden Hidden flag.
   *
   * @returns Success result.
   */
  async setProjectHidden(projectId: string, isHidden: boolean): Promise<{ ok: true }> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return { ok: true };
    }

    await repository.setProjectHidden(projectId, isHidden);
    this.options.events.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
    return { ok: true };
  }

  /**
   * Updates a project display name.
   *
   * @param projectId Project identifier.
   * @param displayName Display name, or `null` to reset.
   *
   * @returns Updated project.
   */
  async updateProjectDisplayName(
    projectId: string,
    displayName: string | null
  ): Promise<OpenCodexProject> {
    const repository = this.requireCacheRepository("Project display name storage is unavailable.");
    const updatedProject = await repository.updateProjectDisplayName(projectId, displayName);

    if (updatedProject === null) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const project = toOpenCodexProject(updatedProject);
    this.options.events.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
    return project;
  }

  /**
   * Updates project preferences.
   *
   * @param projectId Project identifier.
   * @param patch Preferences patch.
   *
   * @returns Updated project.
   */
  async updateProjectPreferences(
    projectId: string,
    patch: Partial<OpenCodexProjectPreferences>
  ): Promise<OpenCodexProject> {
    const repository = this.requireCacheRepository("Project preferences storage is unavailable.");
    const projects = await repository.listProjects();
    const previousProject = projects.find((project) => project.id === projectId);

    if (previousProject === undefined) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const preferences = {
      ...previousProject.preferences,
      ...patch,
      git: {
        ...previousProject.preferences.git,
        ...patch.git
      },
      context: {
        ...previousProject.preferences.context,
        ...patch.context
      }
    };
    const updatedProject = await repository.updateProjectPreferences(projectId, preferences);

    if (updatedProject === null) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const project = toOpenCodexProject(updatedProject);
    this.options.events.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
    return project;
  }

  /**
   * Deletes a project from the local cache.
   *
   * @param projectId Project identifier.
   *
   * @returns Success result.
   */
  async deleteProject(projectId: string): Promise<{ ok: true }> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return { ok: true };
    }

    await repository.deleteProject(projectId);
    this.options.events.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
    return { ok: true };
  }

  /**
   * Deletes a non-default source and clears its project associations.
   *
   * @param sourceId Source identifier.
   *
   * @returns Success result.
   */
  async deleteSource(sourceId: string): Promise<{ ok: true }> {
    const result = await this.sourceCatalog.deleteSource(sourceId);
    this.options.events.emit({
      type: "sources.updated",
      sources: await this.sourceCatalog.listOpenCodexSources(),
      defaultSourceId: result.defaultSourceId
    });
    this.options.events.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
    return { ok: true };
  }

  /**
   * Updates source metadata and command settings.
   *
   * @param sourceId Source identifier.
   * @param patch Source patch.
   *
   * @returns Updated source.
   */
  async updateSource(
    sourceId: string,
    patch: Partial<Pick<OpenCodexSource, "name">> & {
      settings?: OpenCodexSourceSettingsPatch;
    }
  ): Promise<OpenCodexSource> {
    const result = await this.sourceCatalog.updateSource(sourceId, patch);

    this.options.events.emit({
      type: "sources.updated",
      sources: await this.sourceCatalog.listOpenCodexSources(),
      defaultSourceId: result.defaultSourceId
    });
    this.options.events.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
    return result.source;
  }

  /**
   * Opens and caches a project path.
   *
   * @param projectPath Project path to open.
   * @param sourceId Source identifier, or `null` for orphan/default handling.
   * @param createIfMissing Whether the directory may be created.
   *
   * @returns Opened project metadata.
   */
  async openProject(
    projectPath: string,
    sourceId: string | null,
    createIfMissing: boolean
  ): Promise<OpenCodexProject> {
    const resolvedSource = await this.sourceCatalog.resolveSource(sourceId);
    const ensuredProjectPath = await this.projectPaths.ensure(
      projectPath,
      createIfMissing,
      resolvedSource
    );
    const project = await this.cacheProject(ensuredProjectPath, resolvedSource.id);

    if (project === null) {
      throw new Error("Project path is required.");
    }

    await this.listProjects();
    this.options.events.emit({ type: "project.opened", project });
    return project;
  }

  /**
   * Lets the host select a project directory and opens it.
   *
   * @param mode Picker mode.
   * @param sourceId Source identifier, or `null`.
   *
   * @returns Opened project metadata, or `null` when cancelled.
   */
  async pickProjectDirectory(
    mode: "open" | "create",
    sourceId: string | null
  ): Promise<OpenCodexProject | null> {
    const selectedPath = await this.options.backendOptions.pickProjectDirectory?.(mode) ?? null;

    if (selectedPath === null) {
      return null;
    }

    return this.openProject(selectedPath, sourceId, mode === "create");
  }

  /**
   * Lets the host select an external context folder.
   *
   * @returns Selected folder path, or `null` when cancelled.
   */
  async pickProjectContextFolder(): Promise<string | null> {
    return await this.options.backendOptions.pickProjectDirectory?.("open") ?? null;
  }

  /**
   * Writes or creates cached project metadata.
   *
   * @param projectPath Project path to cache.
   * @param sourceId Source identifier, or `null`.
   *
   * @returns Cached project metadata, or `null` for invalid paths.
   */
  async cacheProject(projectPath: string | null, sourceId: string | null): Promise<OpenCodexProject | null> {
    const normalizedProjectPath = normalizeProjectPath(projectPath);

    if (normalizedProjectPath === null) {
      return null;
    }

    const projectIdentity = createProjectIdentity(normalizedProjectPath);

    if (projectIdentity === null) {
      return null;
    }

    if (this.options.cacheRepository === null) {
      return createUncachedProject(projectIdentity, sourceId);
    }

    try {
      const project = await this.options.cacheRepository.upsertProject(normalizedProjectPath, sourceId);
      return toOpenCodexProject(project);
    } catch (error) {
      this.options.backendOptions.logger?.(`project cache write failed: ${String(error)}`);
      return createUncachedProject(projectIdentity, sourceId);
    }
  }

  /**
   * Reads cached projects from SQLite.
   *
   * @returns Cached project collection.
   */
  async readCachedProjects(): Promise<OpenCodexProject[]> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return [];
    }

    try {
      const removedProjectCount = await repository.deleteRedundantOrphanProjects();

      if (removedProjectCount > 0) {
        this.options.backendOptions.logger?.(
          `removed ${removedProjectCount} redundant orphan project(s)`
        );
      }

      const projects = await repository.listProjects();
      return projects.map((project) => toOpenCodexProject(project));
    } catch (error) {
      this.options.backendOptions.logger?.(`project cache read failed: ${String(error)}`);
      return [];
    }
  }

  /**
   * Ensures the default source exists and settings point to it.
   *
   * @returns Promise resolved when initialization completes.
   */
  async ensureSourcesInitialized(): Promise<void> {
    await this.sourceCatalog.ensureSourcesInitialized();
  }

  /**
   * Resolves a source identifier to a cached source.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   *
   * @returns Resolved source.
   */
  async resolveSource(sourceId: string | null): Promise<CachedSource> {
    return await this.sourceCatalog.resolveSource(sourceId);
  }

  /**
   * Reads sources and converts them to UI protocol objects.
   *
   * @returns Source collection.
   */
  async listOpenCodexSources(): Promise<OpenCodexSource[]> {
    return await this.sourceCatalog.listOpenCodexSources();
  }

  /**
   * Returns the cache repository or throws a contextual error.
   *
   * @param message Error message when storage is unavailable.
   *
   * @returns Cache repository.
   */
  private requireCacheRepository(message: string): OpenCodexCacheRepository {
    if (this.options.cacheRepository === null) {
      throw new Error(message);
    }

    return this.options.cacheRepository;
  }
}
