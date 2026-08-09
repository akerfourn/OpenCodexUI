import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";

import type { ApplicationLogService } from "../ApplicationLogService.js";
import type { ApprovalService } from "../ApprovalService.js";
import type { CodexUpdateService } from "../CodexUpdateService.js";
import type { GitRuntimeHandler } from "../GitRuntimeHandler.js";
import type { HostIntegrationService } from "../HostIntegrationService.js";
import type { ModelCatalogService } from "../ModelCatalogService.js";
import type { OpenCodexClientPool } from "../OpenCodexClientPool.js";
import type { PluginService } from "../PluginService.js";
import type { ProjectAutomationRuntimeHandler } from "../ProjectAutomationRuntimeHandler.js";
import type { ProjectSearchService } from "../ProjectSearchService.js";
import type { ProjectRuntimeHandler } from "../ProjectRuntimeHandler.js";
import type { RuntimeErrorCoordinator } from "../RuntimeErrorCoordinator.js";
import type { RuntimeNotificationCoordinator } from "../RuntimeNotificationCoordinator.js";
import type { ThreadRuntimeHandler } from "../ThreadRuntimeHandler.js";
import type { UsageRuntimeService } from "../UsageRuntimeService.js";
import type { RuntimeEventDispatcher } from "./RuntimeEventDispatcher.js";
import type { RuntimeSettingsStore } from "./RuntimeSettingsStore.js";

/** All stateful services owned by one backend runtime instance. */
export type BackendServiceGraph = {
  /** Mutable settings shared by all runtime services. */
  readonly settings: RuntimeSettingsStore;
  /** Journal-aware event boundary shared by all runtime services. */
  readonly events: RuntimeEventDispatcher;
  /** Optional local cache repository owned by the runtime. */
  readonly cacheRepository: OpenCodexCacheRepository | null;
  /** Source-scoped Codex client pool. */
  readonly clientPool: OpenCodexClientPool;
  /** Ordered raw-notification processing pipeline. */
  readonly notificationCoordinator: RuntimeNotificationCoordinator;
  /** Project and source operations. */
  readonly projectRuntimeHandler: ProjectRuntimeHandler;
  /** Thread and turn operations. */
  readonly threadRuntimeHandler: ThreadRuntimeHandler;
  /** Git and commit-message operations. */
  readonly gitRuntimeHandler: GitRuntimeHandler;
  /** Project commands, rules, and tasks. */
  readonly projectAutomationRuntimeHandler: ProjectAutomationRuntimeHandler;
  /** Approval request and response handling. */
  readonly approvalService: ApprovalService;
  /** Plugin operations. */
  readonly pluginService: PluginService;
  /** Project file and skill searches. */
  readonly projectSearchService: ProjectSearchService;
  /** Application log persistence and queries. */
  readonly applicationLogService: ApplicationLogService;
  /** Host filesystem and process integrations. */
  readonly hostIntegrationService: HostIntegrationService;
  /** Model catalog loading and caching. */
  readonly modelCatalogService: ModelCatalogService;
  /** Usage limits, history, and diagnostics. */
  readonly usageRuntimeService: UsageRuntimeService;
  /** Codex release checks and updates. */
  readonly codexUpdateService: CodexUpdateService;
  /** Request and client error normalization. */
  readonly runtimeErrorCoordinator: RuntimeErrorCoordinator;
};
