import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexBackendOptions } from "./types.js";
import { isPrereleaseVersion } from "./version.js";
import { createBackendServiceGraph } from "./backend/runtime/createBackendServiceGraph.js";
import type { BackendServiceGraph } from "./backend/runtime/BackendServiceGraph.js";
import { BackendRuntimeApis } from "./backend/runtime/api/BackendRuntimeApis.js";
import type {
  ApprovalsApi,
  AutomationApi,
  CollaborationApi,
  CodexUpdatesApi,
  DockerApi,
  DockerComposeApi,
  EventLogApi,
  GitApi,
  GroupsApi,
  HostApi,
  LogsApi,
  ModelsApi,
  PluginsApi,
  ProjectContextApi,
  ProjectTasksApi,
  ProjectTrustApi,
  ProjectsApi,
  SearchApi,
  SettingsApi,
  SourcesApi,
  ThreadsApi,
  UsageApi
} from "./backend/runtime/api/index.js";

/**
 * Coordinates backend services exposed to the UI transport.
 */
export class OpenCodexBackendRuntime {
  /** Whether this runtime belongs to an application pre-release build. */
  readonly isPrerelease: boolean;
  /** Fully wired services owned by this runtime instance. */
  private readonly services: BackendServiceGraph;
  /** Stable public facades backed by this runtime's private service graph. */
  private readonly apis: BackendRuntimeApis;

  /**
   * Creates a backend runtime and wires its internal services.
   *
   * @param options Host integration and persistence options.
   */
  constructor(private readonly options: OpenCodexBackendOptions) {
    this.isPrerelease = isPrereleaseVersion(options.appVersion);
    this.services = createBackendServiceGraph(options, this.isPrerelease);
    this.apis = new BackendRuntimeApis(this.services, options);
  }

  /** Public settings API. */
  get settings(): SettingsApi {
    return this.apis.settings;
  }

  /** Public project API. */
  get projects(): ProjectsApi {
    return this.apis.projects;
  }

  /** Public source API. */
  get sources(): SourcesApi {
    return this.apis.sources;
  }

  /** Public project-group API. */
  get groups(): GroupsApi {
    return this.apis.groups;
  }

  /** Public project-context API. */
  get context(): ProjectContextApi {
    return this.apis.context;
  }

  /** Public project-task API. */
  get tasks(): ProjectTasksApi {
    return this.apis.tasks;
  }

  /** Public project-trust API. */
  get trust(): ProjectTrustApi {
    return this.apis.trust;
  }

  /** Public Codex-update API. */
  get updates(): CodexUpdatesApi {
    return this.apis.updates;
  }

  /** Public thread and turn API. */
  get threads(): ThreadsApi {
    return this.apis.threads;
  }

  /** Public collaboration-event API. */
  get collaboration(): CollaborationApi {
    return this.apis.collaboration;
  }

  /** Public thread event-log API. */
  get eventLog(): EventLogApi {
    return this.apis.eventLog;
  }

  /** Public project automation API. */
  get automation(): AutomationApi {
    return this.apis.automation;
  }

  /** Public Git API. */
  get git(): GitApi {
    return this.apis.git;
  }

  /** Public host-local Docker API. */
  get docker(): DockerApi {
    return this.apis.docker;
  }

  /** Public source-scoped Docker Compose API. */
  get dockerCompose(): DockerComposeApi {
    return this.apis.dockerCompose;
  }

  /** Public application-log API. */
  get logs(): LogsApi {
    return this.apis.logs;
  }

  /** Public usage API. */
  get usage(): UsageApi {
    return this.apis.usage;
  }

  /** Public model-catalog API. */
  get models(): ModelsApi {
    return this.apis.models;
  }

  /** Public plugin API. */
  get plugins(): PluginsApi {
    return this.apis.plugins;
  }

  /** Public project-search API. */
  get search(): SearchApi {
    return this.apis.search;
  }

  /** Public host-integration API. */
  get host(): HostApi {
    return this.apis.host;
  }

  /** Public approval API. */
  get approvals(): ApprovalsApi {
    return this.apis.approvals;
  }

  /**
   * Checks whether any Codex source currently owns an active turn.
   *
   * @returns Whether at least one turn is active across all sources.
   */
  hasActiveTurns(): boolean {
    return this.services.notificationCoordinator.hasActiveTurns();
  }

  /**
   * Releases runtime resources.
   *
   * @returns Promise resolved when resources are disposed.
   */
  async dispose(): Promise<void> {
    this.services.notificationCoordinator.flushAll();
    await this.services.clientPool.dispose();
    await this.services.cacheRepository?.close();
  }

  /**
   * Sends initial settings, sources, projects, and models to the UI.
   *
   * @returns Success result.
   */
  async bootstrap(): Promise<{ ok: true }> {
    await this.services.projectRuntimeHandler.ensureSourcesInitialized();
    await this.services.codexUpdateService.checkLatestRelease(false);
    this.services.events.emit({
      type: "app.bootstrap",
      settings: this.settings.get(),
      sources: await this.services.projectRuntimeHandler.listOpenCodexSources(),
      projectPath: this.options.projectPath,
      appVersion: this.options.appVersion ?? null,
      isPrerelease: this.isPrerelease
    });
    await this.projects.list();
    await this.groups.list();
    await this.models.list();
    await this.usage.readLimits(this.settings.get().defaultSourceId, "bootstrap");
    return { ok: true };
  }

  /**
   * Converts request failures to protocol errors and starts recovery when possible.
   *
   * @param request Request that failed.
   * @param error Unknown thrown value.
   *
   * @returns Never returns because it rethrows the normalized error.
   */
  handleRequestError(request: OpenCodexRequest, error: unknown): never {
    return this.services.runtimeErrorCoordinator.handleRequestError(request, error);
  }
}
