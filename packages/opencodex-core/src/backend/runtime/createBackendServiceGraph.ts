import { ApplicationLogService } from "../ApplicationLogService.js";
import { ApprovalService } from "../ApprovalService.js";
import { CodexUpdateService } from "../CodexUpdateService.js";
import { GitRuntimeHandler } from "../GitRuntimeHandler.js";
import { HostIntegrationService } from "../HostIntegrationService.js";
import { ModelCatalogService } from "../ModelCatalogService.js";
import { OpenCodexClientPool } from "../OpenCodexClientPool.js";
import { PluginService } from "../PluginService.js";
import { ProjectAutomationRuntimeHandler } from "../ProjectAutomationRuntimeHandler.js";
import { ProjectSearchService } from "../ProjectSearchService.js";
import { ProjectRuntimeHandler } from "../ProjectRuntimeHandler.js";
import { RuntimeErrorCoordinator } from "../RuntimeErrorCoordinator.js";
import { RuntimeNotificationCoordinator } from "../RuntimeNotificationCoordinator.js";
import { ThreadRuntimeHandler } from "../ThreadRuntimeHandler.js";
import { UsageRuntimeService } from "../UsageRuntimeService.js";
import type { OpenCodexBackendOptions } from "../../types.js";
import { RuntimeEventDispatcher } from "./RuntimeEventDispatcher.js";
import { RuntimeSettingsStore } from "./RuntimeSettingsStore.js";
import type { BackendServiceGraph } from "./BackendServiceGraph.js";
import { handleClientClose } from "./clientCloseHandler.js";

/**
 * Builds the complete service graph for one backend runtime.
 *
 * A few services receive closures because their lifecycle callbacks form real
 * cycles. The closures are only invoked after construction, when the graph is
 * complete; no partially initialized service is exposed to callers.
 *
 * @param options Host integration and persistence options.
 * @param isPrerelease Whether this is an application pre-release build.
 * @returns Fully wired backend service graph.
 */
export function createBackendServiceGraph(
  options: OpenCodexBackendOptions,
  isPrerelease: boolean
): BackendServiceGraph {
  const settings = new RuntimeSettingsStore(options.settings);
  const events = new RuntimeEventDispatcher({ emitToHost: options.emit });
  const cacheRepository = options.cacheRepository ?? null;

  let approvalService!: ApprovalService;
  let clientPool!: OpenCodexClientPool;
  let codexUpdateService!: CodexUpdateService;
  let notificationCoordinator!: RuntimeNotificationCoordinator;
  let projectRuntimeHandler!: ProjectRuntimeHandler;
  let runtimeErrorCoordinator!: RuntimeErrorCoordinator;
  let threadRuntimeHandler!: ThreadRuntimeHandler;
  let usageRuntimeService!: UsageRuntimeService;

  const handleServerRequest = (
    request: Parameters<ApprovalService["handleServerRequest"]>[0],
    sourceId: string
  ): void => {
    approvalService.handleServerRequest(request, sourceId);
  };
  const handleClientError = (error: Error): void => {
    runtimeErrorCoordinator.handleClientError(error);
  };

  const applicationLogService = new ApplicationLogService({
    cacheRepository,
    events,
    logger: options.logger
  });

  clientPool = new OpenCodexClientPool({
    settings,
    appVersion: options.appVersion ?? null,
    resolveSource: (sourceId) => projectRuntimeHandler.resolveSource(sourceId),
    events,
    logger: options.logger,
    handleNotification: (notification, sourceId) => (
      notificationCoordinator.handleNotification(notification, sourceId)
    ),
    handleServerRequest,
    handleError: handleClientError,
    handleClose: (sourceId) => handleClientClose(sourceId, {
      notifications: notificationCoordinator,
      clients: clientPool,
      events
    }),
    handleStderr: (message, sourceId) => (
      projectRuntimeHandler.handleCodexStderr(message, sourceId)
    )
  });

  approvalService = new ApprovalService({
    settings,
    events,
    clients: clientPool
  });

  codexUpdateService = new CodexUpdateService({
    settings,
    saveSettings: async (nextSettings) => {
      await options.saveSettings?.(nextSettings);
    },
    refreshSources: async () => projectRuntimeHandler.listSources(),
    logger: options.logger
  });

  projectRuntimeHandler = new ProjectRuntimeHandler({
    backendOptions: options,
    cacheRepository,
    settings,
    events,
    clients: clientPool,
    hasActiveTurn: (sourceId) => notificationCoordinator.hasActiveTurn(sourceId),
    updates: codexUpdateService
  });

  usageRuntimeService = new UsageRuntimeService({
    cacheRepository,
    settings,
    projects: projectRuntimeHandler,
    clients: clientPool,
    isPrerelease,
    events,
    logs: applicationLogService,
    logger: options.logger
  });

  runtimeErrorCoordinator = new RuntimeErrorCoordinator({
    settings,
    logs: applicationLogService,
    events,
    recoverThread: (threadId) => threadRuntimeHandler.recoverThread(threadId)
  });

  threadRuntimeHandler = new ThreadRuntimeHandler({
    backendOptions: options,
    cacheRepository,
    settings,
    events,
    clients: clientPool,
    projects: projectRuntimeHandler,
    handleClientError
  });

  const gitRuntimeHandler = new GitRuntimeHandler({
    userDataPath: options.userDataPath,
    defaultPromptPath: options.defaultCommitPromptPath,
    generationPromptPath: options.generationCommitPromptPath,
    settings,
    clients: clientPool,
    threads: threadRuntimeHandler,
    usage: usageRuntimeService,
    logger: options.logger
  });

  const projectAutomationRuntimeHandler = new ProjectAutomationRuntimeHandler({
    cache: cacheRepository,
    userDataPath: options.userDataPath,
    settings,
    clients: clientPool,
    projects: projectRuntimeHandler,
    hasActiveTurn: (sourceId) => notificationCoordinator.hasActiveTurn(sourceId),
    events
  });

  const pluginService = new PluginService({ clients: clientPool });
  const projectSearchService = new ProjectSearchService({ clients: clientPool });
  const hostIntegrationService = new HostIntegrationService({
    settings,
    projectPath: options.projectPath,
    projects: projectRuntimeHandler,
    pickExecutableFile: options.pickExecutableFile,
    pickImageFiles: options.pickImageFiles,
    openExternalLink: options.openExternalLink,
    openProjectFolder: options.openProjectFolder,
    openProjectTerminal: options.openProjectTerminal
  });
  const modelCatalogService = new ModelCatalogService({
    cacheRepository,
    projects: projectRuntimeHandler,
    clients: clientPool,
    events,
    logger: options.logger
  });

  const threadNotificationAdapters = threadRuntimeHandler.getNotificationAdapters();
  notificationCoordinator = new RuntimeNotificationCoordinator({
    settings,
    onRawReceived: options.onCodexNotificationReceived,
    onProcessed: options.onCodexNotificationProcessed,
    onLiveCacheProcessed: options.onLiveCacheNotificationProcessed,
    threads: threadRuntimeHandler,
    events,
    usage: usageRuntimeService,
    ...threadNotificationAdapters,
    ...projectAutomationRuntimeHandler.getNotificationAdapter()
  });

  return {
    settings,
    events,
    cacheRepository,
    clientPool,
    notificationCoordinator,
    projectRuntimeHandler,
    threadRuntimeHandler,
    gitRuntimeHandler,
    projectAutomationRuntimeHandler,
    approvalService,
    pluginService,
    projectSearchService,
    applicationLogService,
    hostIntegrationService,
    modelCatalogService,
    usageRuntimeService,
    codexUpdateService,
    runtimeErrorCoordinator
  };
}
