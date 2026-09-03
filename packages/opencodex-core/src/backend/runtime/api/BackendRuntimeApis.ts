import type { OpenCodexBackendOptions } from "../../../types.js";
import type { BackendServiceGraph } from "../BackendServiceGraph.js";
import { AutomationApi } from "./AutomationApi.js";
import { DockerApi } from "./DockerApi.js";
import { DockerComposeApi } from "./DockerComposeApi.js";
import { GitApi } from "./GitApi.js";
import {
  CodexUpdatesApi,
  GroupsApi,
  ProjectContextApi,
  ProjectTasksApi,
  ProjectTrustApi,
  ProjectsApi,
  SourcesApi
} from "./ProjectApis.js";
import {
  ApprovalsApi,
  HostApi,
  LogsApi,
  ModelsApi,
  PluginsApi,
  SearchApi,
  SettingsApi,
  UsageApi
} from "./SupportApis.js";
import { CollaborationApi, EventLogApi, ThreadsApi } from "./ThreadApis.js";
import { TurnDiagnosticsApi } from "./TurnDiagnosticsApi.js";

/**
 * Public, stable API facades owned by one backend runtime.
 *
 * The underlying service graph remains private to the runtime. Each property
 * is constructed exactly once so callers can safely retain a facade reference
 * across requests without exposing the implementation handlers themselves.
 */
export class BackendRuntimeApis {
  /** Runtime settings reads and updates. */
  readonly settings: SettingsApi;
  /** Project operations. */
  readonly projects: ProjectsApi;
  /** Configured Codex source operations. */
  readonly sources: SourcesApi;
  /** Project group operations. */
  readonly groups: GroupsApi;
  /** Project context-folder operations. */
  readonly context: ProjectContextApi;
  /** Project task operations. */
  readonly tasks: ProjectTasksApi;
  /** Project trust operations. */
  readonly trust: ProjectTrustApi;
  /** Codex release and source update operations. */
  readonly updates: CodexUpdatesApi;
  /** Thread and turn operations. */
  readonly threads: ThreadsApi;
  /** Collaboration-event queries. */
  readonly collaboration: CollaborationApi;
  /** Thread event-log queries. */
  readonly eventLog: EventLogApi;
  /** Developer-mode per-turn diagnostic queries. */
  readonly turnDiagnostics: TurnDiagnosticsApi;
  /** Project command and rule operations. */
  readonly automation: AutomationApi;
  /** Git and commit-message operations. */
  readonly git: GitApi;
  /** Host-local Docker operations. */
  readonly docker: DockerApi;
  /** Source-scoped Docker Compose operations. */
  readonly dockerCompose: DockerComposeApi;
  /** Application log operations. */
  readonly logs: LogsApi;
  /** Usage-limit and usage-history operations. */
  readonly usage: UsageApi;
  /** Codex model catalog operations. */
  readonly models: ModelsApi;
  /** Plugin marketplace operations. */
  readonly plugins: PluginsApi;
  /** Project file and skill search operations. */
  readonly search: SearchApi;
  /** Host filesystem, picker, and process operations. */
  readonly host: HostApi;
  /** Approval resolution operations. */
  readonly approvals: ApprovalsApi;

  /**
   * Builds all public facades for one backend service graph.
   *
   * @param services Private service graph owned by the runtime.
   * @param options Runtime host options used for settings persistence.
   */
  constructor(services: BackendServiceGraph, options: OpenCodexBackendOptions) {
    this.settings = new SettingsApi(services.settings, options.saveSettings);
    this.projects = new ProjectsApi(services.projectRuntimeHandler);
    this.sources = new SourcesApi(services.projectRuntimeHandler);
    this.groups = new GroupsApi(services.projectRuntimeHandler);
    this.context = new ProjectContextApi(services.projectRuntimeHandler);
    this.tasks = new ProjectTasksApi(services.projectRuntimeHandler);
    this.trust = new ProjectTrustApi(services.projectRuntimeHandler);
    this.updates = new CodexUpdatesApi(services.projectRuntimeHandler);
    this.threads = new ThreadsApi(services.threadRuntimeHandler);
    this.collaboration = new CollaborationApi(services.threadRuntimeHandler);
    this.eventLog = new EventLogApi(services.threadRuntimeHandler);
    this.turnDiagnostics = new TurnDiagnosticsApi(services.events);
    this.automation = new AutomationApi(services.projectAutomationRuntimeHandler);
    this.git = new GitApi(services.gitRuntimeHandler);
    this.docker = new DockerApi(services.dockerHostService);
    this.dockerCompose = new DockerComposeApi(services.dockerComposeService);
    this.logs = new LogsApi(services.applicationLogService);
    this.usage = new UsageApi(services.usageRuntimeService);
    this.models = new ModelsApi(services.modelCatalogService, services.settings);
    this.plugins = new PluginsApi(services.pluginService);
    this.search = new SearchApi(services.projectSearchService);
    this.host = new HostApi(services.hostIntegrationService);
    this.approvals = new ApprovalsApi(services.approvalService);
  }
}
