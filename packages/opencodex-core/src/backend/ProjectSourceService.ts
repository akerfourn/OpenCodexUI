/**
 * Owns source and project cache operations.
 */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import { createProjectIdentity, normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexProject,
  OpenCodexSettings,
  OpenCodexSource,
  OpenCodexSourceLocalSettings
} from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexBackendOptions } from "../types.js";
import { THREAD_LIST_PAGE_SIZE, THREAD_SOURCE_KINDS } from "./constants.js";
import { readThreadPages } from "./codexReaders.js";
import { toOpenCodexProject } from "./projectMapping.js";
import { ProjectPathVisibilityValidator } from "./projectPathVisibility.js";
import {
  createDefaultCachedSource,
  toOpenCodexSource
} from "./sourceMapping.js";
import {
  toCachedThreadSummary,
  withSourceId
} from "./threadCacheMapping.js";
import type { OpenCodexThreadWithProjectState } from "./threadTypes.js";

export type ProjectSourceServiceOptions = {
  backendOptions: OpenCodexBackendOptions;
  cacheRepository: OpenCodexCacheRepository | null;
  getSettings(): OpenCodexSettings;
  setSettings(settings: OpenCodexSettings): void;
  emit(event: OpenCodexEvent): void;
  ensureClient(sourceId: string | null): Promise<CodexAppServerClient>;
  restartSourceClient(sourceId: string): Promise<void>;
};

/**
 * Coordinates project and source persistence with Codex source synchronization.
 */
export class ProjectSourceService {
  constructor(private readonly options: ProjectSourceServiceOptions) {}

  /**
   * Lists cached projects and emits them to the UI.
   *
   * @returns Cached project collection.
   */
  async listProjects(): Promise<OpenCodexProject[]> {
    const cachedProjects = await this.readCachedProjects();
    this.options.emit({ type: "projects.updated", projects: cachedProjects });
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
    this.options.emit({
      type: "sources.updated",
      sources,
      defaultSourceId: this.options.getSettings().defaultSourceId
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
  async createSource(name?: string): Promise<OpenCodexSource> {
    const repository = this.requireCacheRepository("Source storage is unavailable.");
    const createdSource = await repository.createSource(name);
    const settings = this.options.getSettings();
    const source = toOpenCodexSource(createdSource, settings.codexCommand, 0);
    this.options.emit({
      type: "sources.updated",
      sources: await this.listOpenCodexSources(),
      defaultSourceId: settings.defaultSourceId
    });
    return source;
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
      ? await repository.listSources()
      : [await this.resolveSource(sourceId)];

    for (const source of sources) {
      await this.syncSource(source);
    }

    const projects = await this.readCachedProjects();
    this.options.emit({ type: "projects.updated", projects });
    this.options.emit({
      type: "sources.updated",
      sources: await this.listOpenCodexSources(),
      defaultSourceId: this.options.getSettings().defaultSourceId
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
    this.options.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
    return { ok: true };
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
    this.options.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
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
    const settings = this.options.getSettings();

    if (sourceId === settings.defaultSourceId) {
      throw new Error("Default source cannot be deleted.");
    }

    const repository = this.requireCacheRepository("Source storage is unavailable.");
    await repository.clearSourceAssociations(sourceId);
    await repository.deleteSource(sourceId);
    this.options.emit({
      type: "sources.updated",
      sources: await this.listOpenCodexSources(),
      defaultSourceId: settings.defaultSourceId
    });
    this.options.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
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
      settings?: Partial<OpenCodexSourceLocalSettings>;
    }
  ): Promise<OpenCodexSource> {
    const repository = this.requireCacheRepository("Source storage is unavailable.");
    const previousSource = await this.resolveSource(sourceId);
    const updatedSource = await repository.updateSource(sourceId, patch);

    if (
      previousSource.settings.commandMode !== updatedSource.settings.commandMode ||
      previousSource.settings.command !== updatedSource.settings.command
    ) {
      await repository.clearSourceAssociations(sourceId);
      await this.options.restartSourceClient(sourceId);
    }

    const settings = this.options.getSettings();
    const source = toOpenCodexSource(
      updatedSource,
      settings.codexCommand,
      await repository.getSourceProjectCount(updatedSource.id)
    );

    this.options.emit({
      type: "sources.updated",
      sources: await this.listOpenCodexSources(),
      defaultSourceId: settings.defaultSourceId
    });
    this.options.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
    return source;
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
    const ensuredProjectPath = await this.ensureProjectPath(projectPath, createIfMissing);
    const project = await this.cacheProject(ensuredProjectPath, sourceId);

    if (project === null) {
      throw new Error("Project path is required.");
    }

    await this.listProjects();
    this.options.emit({ type: "project.opened", project });
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
    if (this.options.cacheRepository === null) {
      return [];
    }

    try {
      const projects = await this.options.cacheRepository.listProjects();
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
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return;
    }

    const source = await repository.ensureDefaultSource();
    const settings = this.options.getSettings();

    if (settings.defaultSourceId !== null && settings.defaultSourceId !== "default") {
      return;
    }

    const nextSettings = {
      ...settings,
      defaultSourceId: source.id
    };
    this.options.setSettings(nextSettings);
    await this.options.backendOptions.saveSettings?.(nextSettings);
  }

  /**
   * Resolves a source identifier to a cached source.
   *
   * @param sourceId Source identifier, or `null` for the default source.
   *
   * @returns Resolved source.
   */
  async resolveSource(sourceId: string | null): Promise<CachedSource> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return createDefaultCachedSource();
    }

    await this.ensureSourcesInitialized();
    const sources = await repository.listSources();
    const resolvedSourceId = sourceId ?? this.options.getSettings().defaultSourceId;

    if (resolvedSourceId !== null) {
      const source = sources.find((entry) => entry.id === resolvedSourceId);

      if (source !== undefined) {
        return source;
      }
    }

    return sources[0] ?? createDefaultCachedSource();
  }

  /**
   * Reads sources and converts them to UI protocol objects.
   *
   * @returns Source collection.
   */
  async listOpenCodexSources(): Promise<OpenCodexSource[]> {
    const repository = this.options.cacheRepository;
    const settings = this.options.getSettings();

    if (repository === null) {
      return [toOpenCodexSource(createDefaultCachedSource(), settings.codexCommand, 0)];
    }

    const sources = await repository.listSources();
    return Promise.all(sources.map(async (source) => (
      toOpenCodexSource(
        source,
        settings.codexCommand,
        await repository.getSourceProjectCount(source.id)
      )
    )));
  }

  /**
   * Synchronizes thread/project metadata for one source.
   *
   * @param source Source to synchronize.
   *
   * @returns Promise resolved when synchronization completes.
   */
  private async syncSource(source: CachedSource): Promise<void> {
    const client = await this.options.ensureClient(source.id);
    const projectPathValidator = new ProjectPathVisibilityValidator(source, client);
    const sourceThreads = await readThreadPages(client, {
      limit: THREAD_LIST_PAGE_SIZE,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: THREAD_SOURCE_KINDS
    });
    const threads = await Promise.all(sourceThreads.map(async (thread) => {
      const projectHidden = await projectPathValidator.shouldHideProjectPath(thread.projectPath);

      return withSourceId(
        {
          ...thread,
          projectHidden
        },
        source.id
      );
    }));

    await this.writeThreadIndex(threads);
    await this.deleteEmptyUnsyncedThreadShells(source.id, threads);
  }

  /**
   * Writes synchronized thread metadata to the cache.
   *
   * @param threads Threads to persist.
   *
   * @returns Promise resolved when the write attempt completes.
   */
  private async writeThreadIndex(threads: OpenCodexThreadWithProjectState[]): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return;
    }

    try {
      await repository.upsertThreadIndex(threads.map((thread) => toCachedThreadSummary(thread)));
    } catch (error) {
      this.options.backendOptions.logger?.(`thread cache index write failed: ${String(error)}`);
    }
  }

  /**
   * Removes empty cached thread shells after a source has reported its real thread index.
   *
   * @param sourceId Source identifier being synchronized.
   * @param threads Threads reported by the source.
   *
   * @returns Promise resolved when cleanup completes.
   */
  private async deleteEmptyUnsyncedThreadShells(
    sourceId: string,
    threads: OpenCodexThreadWithProjectState[]
  ): Promise<void> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return;
    }

    const projectPaths = new Set<string>();

    for (const thread of threads) {
      if (thread.projectPath !== null && thread.projectPath !== undefined) {
        projectPaths.add(thread.projectPath);
      }
    }

    try {
      for (const projectPath of projectPaths) {
        const deletedCount = await repository.deleteEmptyUnsyncedThreads(projectPath, sourceId);

        if (deletedCount > 0) {
          this.options.backendOptions.logger?.(
            `deleted ${deletedCount} empty unsynced cached thread(s) for ${projectPath}`
          );
        }
      }
    } catch (error) {
      this.options.backendOptions.logger?.(
        `empty thread cache cleanup failed: ${String(error)}`
      );
    }
  }

  /**
   * Ensures and normalizes a project path.
   *
   * @param projectPath Project path.
   * @param createIfMissing Whether the directory may be created.
   *
   * @returns Normalized project path.
   */
  private async ensureProjectPath(projectPath: string, createIfMissing: boolean): Promise<string> {
    const ensuredPath = await this.options.backendOptions.ensureProjectDirectory?.(projectPath, createIfMissing)
      ?? projectPath;
    const normalizedPath = normalizeProjectPath(ensuredPath);

    if (normalizedPath === null) {
      throw new Error("Project path is required.");
    }

    return normalizedPath;
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

type ProjectIdentity = NonNullable<ReturnType<typeof createProjectIdentity>>;

function createUncachedProject(projectIdentity: ProjectIdentity, sourceId: string | null): OpenCodexProject {
  const now = new Date().toISOString();

  return {
    id: projectIdentity.id,
    sourceId,
    path: projectIdentity.path,
    defaultName: projectIdentity.defaultName,
    displayName: null,
    isHidden: false,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    editedAt: now
  };
}
