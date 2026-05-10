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
import {
  shouldHideProjectPath,
  toOpenCodexProject
} from "./projectMapping.js";
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

export class ProjectSourceService {
  constructor(private readonly options: ProjectSourceServiceOptions) {}

  async listProjects(): Promise<OpenCodexProject[]> {
    const cachedProjects = await this.readCachedProjects();
    this.options.emit({ type: "projects.updated", projects: cachedProjects });
    return cachedProjects;
  }

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

  async setProjectHidden(projectId: string, isHidden: boolean): Promise<{ ok: true }> {
    const repository = this.options.cacheRepository;

    if (repository === null) {
      return { ok: true };
    }

    await repository.setProjectHidden(projectId, isHidden);
    this.options.emit({ type: "projects.updated", projects: await this.readCachedProjects() });
    return { ok: true };
  }

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

  private async syncSource(source: CachedSource): Promise<void> {
    const client = await this.options.ensureClient(source.id);
    const threads = (await readThreadPages(client, {
      limit: THREAD_LIST_PAGE_SIZE,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: THREAD_SOURCE_KINDS
    })).map((thread) => withSourceId(
      {
        ...thread,
        projectHidden: shouldHideProjectPath(thread.projectPath, source)
      },
      source.id
    ));

    await this.writeThreadIndex(threads);
  }

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

  private async ensureProjectPath(projectPath: string, createIfMissing: boolean): Promise<string> {
    const ensuredPath = await this.options.backendOptions.ensureProjectDirectory?.(projectPath, createIfMissing)
      ?? projectPath;
    const normalizedPath = normalizeProjectPath(ensuredPath);

    if (normalizedPath === null) {
      throw new Error("Project path is required.");
    }

    return normalizedPath;
  }

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

