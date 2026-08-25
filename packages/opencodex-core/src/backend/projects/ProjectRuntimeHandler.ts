import type {
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexCodexReleaseCheck,
  OpenCodexProject,
  OpenCodexProjectGroupsSnapshot,
  OpenCodexProjectPreferences,
  OpenCodexProjectStatistics,
  OpenCodexProjectTask,
  OpenCodexProjectTaskStatus,
  OpenCodexSource,
  OpenCodexSourceColor,
  OpenCodexSourceKind,
  OpenCodexSourceSettingsPatch
} from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexBackendOptions } from "../../types.js";
import { ProjectCacheDataService } from "./ProjectCacheDataService.js";
import { ProjectContextService } from "./ProjectContextService.js";
import { ProjectGroupService } from "./ProjectGroupService.js";
import { ProjectSourceService } from "./ProjectSourceService.js";
import { ProjectTrustService } from "./ProjectTrustService.js";
import { SourceUpdateRuntimeHandler } from "../sources/SourceUpdateRuntimeHandler.js";
import type {
  ClientPort,
  ProjectSourcePort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "../runtime/runtimePorts.js";
import type { CodexUpdateService } from "../sources/CodexUpdateService.js";

/** Dependencies used by the project and source runtime boundary. */
export type ProjectRuntimeHandlerOptions = {
  /** Original backend options used by source, trust, and context services. */
  backendOptions: OpenCodexBackendOptions;
  /** Cache repository shared by project, source, group, and task services. */
  cacheRepository: OpenCodexCacheRepository | null;
  /** Provides access to the current mutable settings snapshot. */
  settings: Pick<RuntimeSettingsPort, "getSettings" | "setSettings">;
  /** Emits project and source events to the host transport and journal. */
  events: Pick<RuntimeEventPort, "emit">;
  /** Provides source-scoped Codex client lifecycle operations. */
  clients: Pick<ClientPort, "ensureClient" | "restartClient">;
  /** Reports whether a source currently owns an active turn. */
  hasActiveTurn(sourceId: string): boolean;
  /** Provides source update status, release checks, and update execution. */
  updates: Pick<CodexUpdateService, "getSourceUpdateStatus" | "checkLatestRelease" | "updateSource">;
};

/** Owns project/source services and exposes their runtime-facing facade. */
export class ProjectRuntimeHandler implements ProjectSourcePort {
  /** Coordinates source persistence, synchronization, and project cache reads. */
  private readonly projectSourceService: ProjectSourceService;
  /** Detects and resolves source-owned project trust prompts. */
  private readonly projectTrustService: ProjectTrustService;
  /** Synchronizes project context folders into source-owned configuration. */
  private readonly projectContextService: ProjectContextService;
  /** Persists the UI-only project group tree. */
  private readonly projectGroupService: ProjectGroupService;
  /** Reads project statistics and persists local project tasks. */
  private readonly projectCacheDataService: ProjectCacheDataService;
  /** Coordinates release checks and standalone Codex source updates. */
  private readonly sourceUpdateRuntimeHandler: SourceUpdateRuntimeHandler;

  /** Stable source initialization adapter used by the runtime bootstrap. */
  readonly ensureSourcesInitialized = async (): Promise<void> => {
    await this.projectSourceService.ensureSourcesInitialized();
  };

  /** Stable source resolver adapter used by source-aware services. */
  readonly resolveSource = async (sourceId: string | null): Promise<CachedSource> => {
    return await this.projectSourceService.resolveSource(sourceId);
  };

  /** Stable strict source resolver adapter used by source-scoped requests. */
  readonly resolveRequestedSource = async (sourceId: string | null): Promise<CachedSource> => {
    const source = await this.resolveSource(sourceId);

    if (sourceId !== null && source.id !== sourceId) {
      throw new Error(`Codex source not found: ${sourceId}`);
    }

    return source;
  };

  /** Stable project cache adapter used by thread operations. */
  readonly cacheProject = async (
    projectPath: string | null,
    sourceId: string | null
  ): Promise<OpenCodexProject | null> => {
    return await this.projectSourceService.cacheProject(projectPath, sourceId);
  };

  /** Stable cached-project reader used by thread operations. */
  readonly readCachedProjects = async (): Promise<OpenCodexProject[]> => {
    return await this.projectSourceService.readCachedProjects();
  };

  /** Stable source-list adapter used by source update operations. */
  readonly listOpenCodexSources = async (): Promise<OpenCodexSource[]> => {
    return await this.projectSourceService.listOpenCodexSources();
  };

  /** Stable Codex stderr adapter used by the client pool. */
  readonly handleCodexStderr = (message: string, sourceId: string): void => {
    this.projectTrustService.handleCodexStderr(message, sourceId);
  };

  /**
   * Creates a project runtime handler and wires its focused services.
   *
   * @param options Cache, settings, client ports, and update callbacks.
   */
  constructor(options: ProjectRuntimeHandlerOptions) {
    this.projectSourceService = new ProjectSourceService({
      backendOptions: options.backendOptions,
      cacheRepository: options.cacheRepository,
      settings: options.settings,
      events: options.events,
      clients: options.clients,
      updates: options.updates
    });
    this.projectTrustService = new ProjectTrustService({
      backendOptions: options.backendOptions,
      settings: options.settings,
      events: options.events,
      clients: options.clients
    });
    this.projectContextService = new ProjectContextService({
      cacheRepository: options.cacheRepository,
      clients: options.clients
    });
    this.projectGroupService = new ProjectGroupService({
      cacheRepository: options.cacheRepository,
      events: options.events
    });
    this.projectCacheDataService = new ProjectCacheDataService({
      cacheRepository: options.cacheRepository
    });
    this.sourceUpdateRuntimeHandler = new SourceUpdateRuntimeHandler({
      settings: options.settings,
      projects: this.projectSourceService,
      updates: options.updates,
      hasActiveTurn: options.hasActiveTurn,
      clients: options.clients,
      events: options.events
    });
  }

  /** Lists cached projects and emits the project snapshot. */
  async listProjects(): Promise<OpenCodexProject[]> {
    return await this.projectSourceService.listProjects();
  }

  /** Lists the project group tree. */
  async listProjectGroups(): Promise<OpenCodexProjectGroupsSnapshot> {
    return await this.projectGroupService.listGroups();
  }

  /** Creates a project group. */
  async createProjectGroup(
    name: string,
    parentGroupId: string | null = null,
    color: OpenCodexSourceColor = "blue"
  ): Promise<OpenCodexProjectGroupsSnapshot> {
    return await this.projectGroupService.createGroup({ name, color, parentGroupId });
  }

  /** Updates a project group. */
  async updateProjectGroup(
    groupId: string,
    patch: { name?: string; color?: OpenCodexSourceColor; isCollapsed?: boolean }
  ): Promise<OpenCodexProjectGroupsSnapshot> {
    return await this.projectGroupService.updateGroup(groupId, patch);
  }

  /** Deletes a project group while retaining its children. */
  async deleteProjectGroup(groupId: string): Promise<OpenCodexProjectGroupsSnapshot> {
    return await this.projectGroupService.deleteGroup(groupId);
  }

  /** Assigns a project to a group or the ungrouped root. */
  async assignProjectToGroup(
    projectId: string,
    groupId: string | null
  ): Promise<OpenCodexProjectGroupsSnapshot> {
    return await this.projectGroupService.assignProject(projectId, groupId);
  }

  /** Lists configured sources. */
  async listSources(): Promise<OpenCodexSource[]> {
    return await this.projectSourceService.listSources();
  }

  /** Creates a Codex source. */
  async createSource(
    name: string,
    kind: OpenCodexSourceKind,
    settings: OpenCodexSourceSettingsPatch
  ): Promise<OpenCodexSource> {
    return await this.projectSourceService.createSource(name, kind, settings);
  }

  /** Synchronizes projects from one source or all sources. */
  async syncSources(sourceId: string | null): Promise<OpenCodexProject[]> {
    return await this.projectSourceService.syncSources(sourceId);
  }

  /** Refreshes the latest Codex release metadata and source snapshot. */
  async checkCodexRelease(force: boolean): Promise<OpenCodexCodexReleaseCheck> {
    return await this.sourceUpdateRuntimeHandler.checkCodexRelease(force);
  }

  /** Applies a standalone Codex update for one source. */
  async updateCodexSource(sourceId: string): Promise<OpenCodexSource[]> {
    return await this.sourceUpdateRuntimeHandler.updateCodexSource(sourceId);
  }

  /** Updates whether a project is hidden. */
  async setProjectHidden(projectId: string, isHidden: boolean): Promise<{ ok: true }> {
    return await this.projectSourceService.setProjectHidden(projectId, isHidden);
  }

  /** Updates a cached project's display name. */
  async updateProjectDisplayName(
    projectId: string,
    displayName: string | null
  ): Promise<OpenCodexProject> {
    return await this.projectSourceService.updateProjectDisplayName(projectId, displayName);
  }

  /** Updates cached project preferences. */
  async updateProjectPreferences(
    projectId: string,
    patch: Partial<OpenCodexProjectPreferences>
  ): Promise<OpenCodexProject> {
    return await this.projectSourceService.updateProjectPreferences(projectId, patch);
  }

  /** Synchronizes project context folders into the project Codex config. */
  async syncProjectContext(projectId: string): Promise<OpenCodexProject> {
    return await this.projectContextService.syncProjectContext(projectId);
  }

  /** Deletes a project from the local cache. */
  async deleteProject(projectId: string): Promise<{ ok: true }> {
    return await this.projectSourceService.deleteProject(projectId);
  }

  /** Deletes a non-default source. */
  async deleteSource(sourceId: string): Promise<{ ok: true }> {
    return await this.projectSourceService.deleteSource(sourceId);
  }

  /** Updates source metadata and launch settings. */
  async updateSource(
    sourceId: string,
    patch: Partial<Pick<OpenCodexSource, "name">> & {
      settings?: OpenCodexSourceSettingsPatch;
    }
  ): Promise<OpenCodexSource> {
    return await this.projectSourceService.updateSource(sourceId, patch);
  }

  /** Opens and caches a project path. */
  async openProject(
    projectPath: string,
    sourceId: string | null,
    createIfMissing: boolean
  ): Promise<OpenCodexProject> {
    return await this.projectSourceService.openProject(projectPath, sourceId, createIfMissing);
  }

  /** Opens the host project directory picker and caches the selected project. */
  async pickProjectDirectory(
    mode: "open" | "create",
    sourceId: string | null
  ): Promise<OpenCodexProject | null> {
    return await this.projectSourceService.pickProjectDirectory(mode, sourceId);
  }

  /** Opens the host directory picker for an external context folder. */
  async pickProjectContextFolder(): Promise<string | null> {
    return await this.projectSourceService.pickProjectContextFolder();
  }

  /** Reads aggregate token usage for a project. */
  async readProjectStatistics(
    projectPath: string,
    sourceId: string | null
  ): Promise<OpenCodexProjectStatistics> {
    return await this.projectCacheDataService.readProjectStatistics(projectPath, sourceId);
  }

  /** Lists local tasks configured for a project. */
  async listProjectTasks(projectId: string): Promise<OpenCodexProjectTask[]> {
    return await this.projectCacheDataService.listProjectTasks(projectId);
  }

  /** Creates a local project task. */
  async createProjectTask(
    projectId: string,
    title: string,
    description: string,
    status: OpenCodexProjectTaskStatus
  ): Promise<OpenCodexProjectTask> {
    return await this.projectCacheDataService.createProjectTask(
      projectId,
      title,
      description,
      status
    );
  }

  /** Updates a local project task. */
  async updateProjectTask(
    taskId: string,
    patch: {
      title?: string;
      description?: string;
      status?: OpenCodexProjectTaskStatus;
    }
  ): Promise<OpenCodexProjectTask> {
    return await this.projectCacheDataService.updateProjectTask(taskId, patch);
  }

  /** Deletes a local project task. */
  async deleteProjectTask(taskId: string): Promise<{ ok: true }> {
    return await this.projectCacheDataService.deleteProjectTask(taskId);
  }

  /** Trusts a project in Codex configuration. */
  async trustProject(projectPath: string): Promise<{ ok: true }> {
    return await this.projectTrustService.trustProject(projectPath);
  }

  /** Dismisses a pending project trust request. */
  dismissProjectTrustRequest(projectPath: string): void {
    this.projectTrustService.dismissProjectTrustRequest(projectPath);
  }
}
