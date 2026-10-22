import { WorkspaceMoveService } from "./backend/workspaces/WorkspaceMoveService.js";
import { WorkspaceRelocationService } from "./backend/workspaces/WorkspaceRelocationService.js";
import { MessageRenderingService } from "./backend/support/MessageRenderingService.js";
import { isDebugActive } from "@open-codex-ui/opencodex-protocol";
import { WorkspaceActivityGate } from "./backend/workspaces/WorkspaceActivityGate.js";
import { WorkspaceRemovalService } from "./backend/workspaces/WorkspaceRemovalService.js";
import { isInsideWorkspace } from "./backend/workspaces/WorkspaceRemovalRuntime.js";
import { requireLegacyWorkspaceAvailable, workspaceRequestSource } from "./backend/workspaces/workspaceRequestSource.js";
import { BrowserPermissionsService } from "./backend/browser/BrowserPermissionsService.js";
import { SourcePermissionsService } from "./backend/sources/SourcePermissionsService.js";
import { SourceInstancesService } from "./backend/sources/SourceInstancesService.js";
import type { ThreadPermissionsService } from "./backend/threads/ThreadPermissionsService.js";
import { DebugService } from "./backend/debug/DebugService.js";
import { requireToolWorkspace } from "./backend/workspaces/workspaceToolContext.js";
import { WorkspaceFilesService } from "./backend/files/WorkspaceFilesService.js";
import { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { CodexDictationService } from "./backend/dictation/CodexDictationService.js";
import { resolveSourceCommand } from "./backend/sources/sourceMapping.js";
import { resolveWorkspaceToolRequest } from "./backend/workspaces/workspaceToolContext.js";
import { initializeDefaultWorkspaceRoot } from "./backend/workspaces/initializeDefaultWorkspaceRoot.js";
import type { OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexBackendOptions } from "./types.js";
import { isPrereleaseVersion } from "./version.js";
import { createBackendServiceGraph } from "./backend/runtime/createBackendServiceGraph.js";
import type { BackendServiceGraph } from "./backend/runtime/BackendServiceGraph.js";
import { BackendRuntimeApis } from "./backend/runtime/api/BackendRuntimeApis.js";
import type { WorkspacesApi } from "./backend/runtime/api/PublicRuntimeApis.js";
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
  ProjectGoalsApi,
  ProjectTasksApi,
  ProjectTrustApi,
  ProjectsApi,
  SearchApi,
  SettingsApi,
  SourcesApi,
  ThreadsApi,
  TurnDiagnosticsApi,
  UsageApi
} from "./backend/runtime/api/index.js";

/**
 * Coordinates backend services exposed to the UI transport.
 */
export class OpenCodexBackendRuntime {
  /** Shares short-lived source activity with destructive lifecycle operations. */
  private readonly workspaceActivity = new WorkspaceActivityGate();
  /** Clean-only worktree removal with durable recovery, when persistent storage is available. */
  readonly workspaceRemovals: WorkspaceRemovalService | null;
  /** Durable movement of managed secondary checkouts. */
  readonly workspaceMoves: WorkspaceMoveService | null;
  /** Explicit source-aware metadata relocation, separate from physical movement. */
  readonly workspaceRelocations: WorkspaceRelocationService | null;
  /** Whether this runtime belongs to an application pre-release build. */
  readonly isPrerelease: boolean;
  /** Source-aware filesystem service for workspace documents. */
  readonly files: WorkspaceFilesService;
  /** Local debugger owns its lifecycle independently of Codex conversations. */
  readonly debug: DebugService;
  /** Durable presentation preferences never alter model inputs. */
  readonly messageRendering: MessageRenderingService;
  /** Source and conversation permissions saved by the Browser plugin. */
  readonly browserPermissions: BrowserPermissionsService;
  /** User-level Codex defaults belonging to explicit source connections. */
  readonly sourcePermissions: SourcePermissionsService;
  /** Lifecycle controls and content-free status for source-owned app-servers. */
  readonly sourceInstances: SourceInstancesService;
  /** Isolated experimental speech transcription, outside normal conversation execution. */
  readonly dictation: CodexDictationService;
  /** Fully wired services owned by this runtime instance. */
  private readonly services: BackendServiceGraph;
  /** Stable public facades backed by this runtime's private service graph. */
  private readonly apis: BackendRuntimeApis;
  /** Shares local storage initialization across simultaneous bootstrap requests. */
  private workspaceRootInitialization: Promise<void> | null = null;

  /**
   * Creates a backend runtime and wires its internal services.
   *
   * @param options Host integration and persistence options.
   */
  constructor(private readonly options: OpenCodexBackendOptions) {
    this.isPrerelease = isPrereleaseVersion(options.appVersion);
    this.services = createBackendServiceGraph(options, this.isPrerelease);
    this.apis = new BackendRuntimeApis(this.services, options);
    this.sourceInstances = new SourceInstancesService(this.services.projectRuntimeHandler,
      this.services.clientPool, this.services.cacheRepository);
    this.sourcePermissions = new SourcePermissionsService(this.services.projectRuntimeHandler,
      this.services.clientPool, this.services.cacheRepository);
    this.messageRendering = new MessageRenderingService(this.services.cacheRepository);
    this.browserPermissions = new BrowserPermissionsService(this.services.cacheRepository,
      this.services.projectRuntimeHandler, this.services.clientPool,
      () => this.services.notificationCoordinator.hasActiveTurns());
    this.files = new WorkspaceFilesService(this.services.cacheRepository,
      this.services.projectRuntimeHandler, this.services.clientPool, this.settings);
    this.debug = new DebugService(this.services.cacheRepository?.debug ?? null, async context => {
      const workspace = await requireToolWorkspace(this.services.cacheRepository, context.workspaceId, context.projectId);
      if (workspace.sourceId !== context.sourceId || workspace.path !== context.workspacePath) {
        throw new Error("Workspace context changed. Recreate the debug configuration.");
      }
      const source = await this.services.projectRuntimeHandler.resolveRequestedSource(context.sourceId);
      if (source.kind !== "local") throw new Error("Debug currently supports host-local sources only (no WSL, Docker or remote).");
    }, snapshot => options.emit({ type: "debug.state", snapshot }), options.debugAdapter, this.settings, this.files);
    this.workspaceRemovals = this.services.cacheRepository === null ? null : new WorkspaceRemovalService(
      this.services.cacheRepository.workspaces, this.services.clientPool, this.workspaceActivity, async removal => {
        this.services.projectAutomationRuntimeHandler.requireWorkspaceIdle(
          removal.workspaceId, removal.sourceId, removal.workspacePath);
        const session = this.debug.snapshot().session;
        if (isDebugActive(session) && session !== null
          && session.configuration.context.sourceId === removal.sourceId
          && isInsideWorkspace(session.configuration.context.workspacePath, removal.workspacePath)) {
          throw new Error("Stop the debug session in this workspace before removing it.");
        }
        await this.services.dockerComposeService.requireWorkspaceIdle(removal);
      });
    this.workspaceRelocations = this.services.cacheRepository === null ? null : new WorkspaceRelocationService(
      this.services.cacheRepository.workspaces, this.services.clientPool, this.workspaceActivity, async (workspace, destination) => {
        for (const location of [workspace.path, destination]) {
          this.services.projectAutomationRuntimeHandler.requireWorkspaceIdle(workspace.id, workspace.sourceId!, location);
          const session = this.debug.snapshot().session;
          if (isDebugActive(session) && session !== null && session.configuration.context.sourceId === workspace.sourceId
            && isInsideWorkspace(session.configuration.context.workspacePath, location)) {
            throw new Error("Stop the debug session before relocating this workspace.");
          }
        }
        await this.services.dockerComposeService.requireWorkspaceIdle({ workspaceId: workspace.id,
          projectId: workspace.projectId, sourceId: workspace.sourceId!, workspacePath: destination }, workspace.path);
      });
    this.workspaceMoves = this.services.cacheRepository === null ? null : new WorkspaceMoveService(
      this.services.cacheRepository.workspaces, this.services.clientPool, this.workspaceActivity, async move => {
        for (const location of [move.workspacePath, move.destinationPath]) {
          this.services.projectAutomationRuntimeHandler.requireWorkspaceIdle(move.workspaceId, move.sourceId, location);
          const session = this.debug.snapshot().session;
          if (isDebugActive(session) && session !== null && session.configuration.context.sourceId === move.sourceId
            && isInsideWorkspace(session.configuration.context.workspacePath, location)) {
            throw new Error("Stop the debug session before moving this workspace.");
          }
        }
        await this.services.dockerComposeService.requireWorkspaceIdle(move);
      }, () => this.settings.get().workspaceRoots ?? []);
    this.dictation = new CodexDictationService(async (sourceId) => {
      const source = await this.services.projectRuntimeHandler.resolveSource(sourceId);
      return new CodexAppServerClient({
        command: resolveSourceCommand(source, this.settings.get().codexCommand),
        clientInfo: { name: "OpenCodexUI_dictation", version: options.appVersion ?? "unknown" },
        experimentalApi: true, requestTimeoutMs: 20_000
      });
    });
  }

  /** Keeps lifecycle exclusion around tool dispatch, including file saves and process startup. */
  async runWorkspaceRequest(request: OpenCodexRequest, action: () => Promise<unknown>): Promise<unknown> {
    if (request.type === "projectWorkspaces.remove" || request.type === "projectWorkspaces.removals.reconcile"
      || request.type === "projectWorkspaces.relocate" || request.type === "projectWorkspaces.move"
      || request.type === "projectWorkspaces.moves.reconcile") {
      return await action();
    }
    let debugSource: string | null = null;
    if (request.type === "debug") {
      await this.debug.initialize();
      const snapshot = this.debug.snapshot();
      const action = request.action;
      if (action.kind === "start") {
        debugSource = snapshot.preferences.configurations.find(item => item.id === action.configurationId)?.context.sourceId ?? null;
      } else if ("context" in action && typeof action.context === "object") {
        debugSource = action.context.sourceId;
      } else debugSource = snapshot.session?.configuration.context.sourceId ?? null;
    }
    const sourceId = await workspaceRequestSource(this.services.cacheRepository, request, debugSource,
      this.settings.get().defaultSourceId ?? null);
    return await this.workspaceActivity.run(sourceId, async () => {
      await requireLegacyWorkspaceAvailable(this.services.cacheRepository, request, sourceId);
      return await action();
    });
  }

  /** Resolves physical tool identity before transport dispatch. */
  async resolveToolRequest(request: OpenCodexRequest): Promise<OpenCodexRequest> {
    return await resolveWorkspaceToolRequest(this.services.cacheRepository, request);
  }

  /** Effective permissions of an existing source-owned conversation. */
  get threadPermissions(): ThreadPermissionsService {
    return this.services.threadRuntimeHandler.permissions;
  }

  /** Public settings API. */
  get settings(): SettingsApi {
    return this.apis.settings;
  }

  /** Public project API. */
  get projects(): ProjectsApi {
    return this.apis.projects;
  }

  /** Preparatory workspace API; execution targets are resolved by the backend. */
  get workspaces(): WorkspacesApi {
    return this.services.threadRuntimeHandler.workspaces;
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

  /** Public project-goal catalogue API. */
  get goals(): ProjectGoalsApi {
    return this.apis.goals;
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

  /** Public developer-mode per-turn diagnostic API. */
  get turnDiagnostics(): TurnDiagnosticsApi {
    return this.apis.turnDiagnostics;
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
    await this.debug.dispose();
    await this.dictation.dispose();
    this.services.notificationCoordinator.flushAll();
    await this.services.clientPool.dispose();
    await this.services.applicationLogService.dispose();
    await this.services.cacheRepository?.close();
  }

  /**
   * Sends initial settings, sources, projects, and models to the UI.
   *
   * @returns Success result.
   */
  async bootstrap(): Promise<{ ok: true }> {
    await this.debug.initialize();
    await this.services.applicationLogService.start();
    await this.services.projectRuntimeHandler.ensureSourcesInitialized();
    await this.ensureDefaultWorkspaceRoot();
    await this.services.codexUpdateService.checkLatestRelease(false);
    this.services.events.emit({
      type: "app.bootstrap",
      settings: this.settings.get(),
      sources: await this.services.projectRuntimeHandler.listOpenCodexSources(),
      sourceInstances: await this.sourceInstances.list(),
      projectPath: this.options.projectPath,
      appVersion: this.options.appVersion ?? null,
      isPrerelease: this.isPrerelease
    });
    this.options.emit({ type: "debug.state", snapshot: this.debug.snapshot() });
    await this.projects.list();
    await this.groups.list();
    await this.models.list();
    await this.usage.readLimits(this.settings.get().defaultSourceId, "bootstrap");
    return { ok: true };
  }

  /** Initializes storage before publishing settings, allowing retries after an I/O failure. */
  private async ensureDefaultWorkspaceRoot(): Promise<void> {
    this.workspaceRootInitialization ??= this.initializeWorkspaceStorage();
    try {
      await this.workspaceRootInitialization;
    } finally {
      this.workspaceRootInitialization = null;
    }
  }

  /** Resolves persisted source identities before preparing a host-local storage directory. */
  private async initializeWorkspaceStorage(): Promise<void> {
    const sources = await this.services.cacheRepository?.listSources() ?? [];
    await initializeDefaultWorkspaceRoot(this.options.userDataPath, sources, this.settings);
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
