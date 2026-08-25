import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";

import { ThreadTurnCache } from "../../ThreadTurnCache.js";
import type { OpenCodexBackendOptions } from "../../types.js";
import { CollaborationService } from "../collaboration/CollaborationService.js";
import { NotificationService } from "../support/NotificationService.js";
import { ThreadCacheService } from "./ThreadCacheService.js";
import { ThreadConversationService } from "./ThreadConversationService.js";
import {
  ThreadRuntimeNotifications,
  type ThreadRuntimeNotificationAdapters
} from "./ThreadRuntimeNotifications.js";
import type {
  ClientPort,
  ProjectSourcePort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "../runtime/runtimePorts.js";

/** Dependencies needed to construct the thread runtime handler. */
export type ThreadRuntimeHandlerOptions = {
  /** Original backend options used by cache and conversation services. */
  backendOptions: OpenCodexBackendOptions;
  /** Cache repository shared by thread and collaboration services. */
  cacheRepository: OpenCodexCacheRepository | null;
  /** Reads the current mutable settings snapshot. */
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  /** Emits runtime events and records the thread event journal. */
  events: RuntimeEventPort;
  /** Provides source-aware Codex client lifecycle operations. */
  clients: Pick<ClientPort, "ensureClient">;
  /** Provides source resolution and project-cache operations. */
  projects: Pick<
    ProjectSourcePort,
    "resolveSource" | "cacheProject" | "readCachedProjects"
  >;
  /** Handles asynchronous client failures raised by thread callbacks. */
  handleClientError(error: Error): void;
};

export type { ThreadRuntimeNotificationAdapters } from "./ThreadRuntimeNotifications.js";

/** Complete service graph owned by one thread runtime handler. */
export type ThreadRuntimeServices = {
  threadConversationService: ThreadConversationService;
  notifications: ThreadRuntimeNotifications;
};

/**
 * Creates the cohesive thread service graph with shared instance identity.
 *
 * @param options Runtime service dependencies.
 * @returns Constructed thread runtime services.
 */
export function createThreadRuntimeServices(
  options: ThreadRuntimeHandlerOptions
): ThreadRuntimeServices {
  const threadTurnCache = new ThreadTurnCache();
  const threadCacheService = new ThreadCacheService({
    cacheRepository: options.cacheRepository,
    threadTurnCache,
    settings: options.settings,
    events: options.events,
    logger: options.backendOptions.logger
  });
  const collaborationService = new CollaborationService({
    cacheRepository: options.cacheRepository,
    events: options.events,
    logger: options.backendOptions.logger
  });
  const threadConversationService = new ThreadConversationService({
    backendOptions: options.backendOptions,
    threadTurnCache,
    threadCacheService,
    settings: options.settings,
    events: options.events,
    clients: options.clients,
    projects: options.projects,
    collaborationService,
    handleClientError: options.handleClientError
  });
  const notifications = new ThreadRuntimeNotifications({
    events: options.events,
    threadTurnCache,
    threadCacheService,
    collaborationService,
    threadConversationService,
    handleClientError: options.handleClientError
  });
  const notificationService = new NotificationService({
    events: options.events,
    applyCodexThreadTitle: (threadId, title, sourceId) => {
      notifications.applyCodexThreadTitle(threadId, title, sourceId);
    },
    applyCodexThreadDeleted: (threadId, sourceId) => {
      notifications.applyCodexThreadDeleted(threadId, sourceId);
    },
    syncCompletedTurn: (threadId, sourceId) => {
      notifications.syncCompletedTurn(threadId, sourceId);
    }
  });
  notifications.attachNotificationService(notificationService);

  return {
    threadConversationService,
    notifications
  };
}
