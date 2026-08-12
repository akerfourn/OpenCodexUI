import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexCollaborationEvent,
  OpenCodexCollaborationQuery,
  OpenCodexEvent,
  OpenCodexThreadEventLogPage
} from "@open-codex-ui/opencodex-protocol";

import type { ThreadTurnCache } from "../ThreadTurnCache.js";
import type { CollaborationService } from "./CollaborationService.js";
import { toError } from "./errors.js";
import type { NotificationService } from "./NotificationService.js";
import type { RuntimeEventPort } from "./runtime/runtimePorts.js";
import type { ThreadCacheService } from "./ThreadCacheService.js";
import type { ThreadConversationService } from "./ThreadConversationService.js";
import { ThreadNotificationSuppressionRegistry } from "./ThreadNotificationSuppressionRegistry.js";

/** Adapters consumed by the ordered notification coordinator. */
export type ThreadRuntimeNotificationAdapters = {
  readonly threadCacheService: Pick<
    ThreadCacheService,
    "writeTokenUsage" | "writeTurnExecutionMetadata"
  >;
  readonly threadTurnCache: ThreadTurnCache;
  readonly collaborationService: Pick<CollaborationService, "handleNotification">;
  readonly threadConversationService: Pick<
    ThreadConversationService,
    "recordStartedThread" | "recordNotification"
  >;
  readonly notificationService: Pick<NotificationService, "handleNotification">;
};

/** Dependencies shared by thread notification operations. */
export type ThreadRuntimeNotificationsOptions = {
  events: RuntimeEventPort;
  threadTurnCache: ThreadTurnCache;
  threadCacheService: ThreadCacheService;
  collaborationService: CollaborationService;
  threadConversationService: ThreadConversationService;
  handleClientError(error: Error): void;
};

/** Owns thread notification adapters, suppression, journaling, and callbacks. */
export class ThreadRuntimeNotifications {
  private readonly suppressions = new ThreadNotificationSuppressionRegistry();
  private notificationService: NotificationService | null = null;

  /** Creates notification infrastructure around the shared thread services. */
  constructor(private readonly options: ThreadRuntimeNotificationsOptions) {}

  /** Attaches the notification service after its cyclic callbacks are constructed. */
  attachNotificationService(notificationService: NotificationService): void {
    this.notificationService = notificationService;
  }

  /** Suppresses transient notifications for one thread. */
  ignore(threadId: string): void {
    this.suppressions.ignore(threadId);
  }

  /** Releases transient notification suppression for one thread. */
  release(threadId: string): void {
    this.suppressions.release(threadId);
  }

  /** Returns whether notifications for one thread are suppressed. */
  isIgnored(threadId: string): boolean {
    return this.suppressions.has(threadId);
  }

  /** Records a raw notification in the bounded event log. */
  recordRaw(notification: CodexNotification, sourceId: string): void {
    this.options.events.recordRawNotification(notification, sourceId);
  }

  /** Emits a backend event through the runtime event port. */
  emit(event: OpenCodexEvent): void {
    this.options.events.emit(event);
  }

  /** Reads the bounded metadata trace for one thread. */
  readEventLog(
    threadId: string,
    sourceId: string | null,
    limit: number
  ): OpenCodexThreadEventLogPage {
    return this.options.events.readThreadEventLog(threadId, sourceId, limit);
  }

  /** Lists normalized collaboration events for an explicit query. */
  async listCollaborationEvents(
    query: OpenCodexCollaborationQuery
  ): Promise<OpenCodexCollaborationEvent[]> {
    return await this.options.collaborationService.listEvents(query);
  }

  /** Returns the exact shared adapters used by notification processing. */
  getAdapters(): ThreadRuntimeNotificationAdapters {
    if (this.notificationService === null) {
      throw new Error("Thread notification service is not attached.");
    }

    return {
      threadCacheService: this.options.threadCacheService,
      threadTurnCache: this.options.threadTurnCache,
      collaborationService: this.options.collaborationService,
      threadConversationService: this.options.threadConversationService,
      notificationService: this.notificationService
    };
  }

  /** Applies a Codex-generated title to memory and cache. */
  applyCodexThreadTitle(threadId: string, title: string, sourceId: string): void {
    const cacheEntry = this.options.threadTurnCache.updateCodexThreadTitle(threadId, title);

    if (cacheEntry !== null) {
      this.emit({ type: "thread.metadata.updated", thread: cacheEntry.thread });
    }

    void this.options.threadCacheService.writeCodexTitle(threadId, title);
  }

  /** Applies a Codex-generated deletion to cache and UI. */
  applyCodexThreadDeleted(threadId: string, sourceId: string): void {
    void this.options.threadConversationService
      .forgetDeletedThread(threadId, sourceId)
      .catch((error: unknown) => {
        this.options.handleClientError(toError(error));
      });
  }

  /** Refreshes a completed turn after Codex persists its items. */
  syncCompletedTurn(threadId: string, sourceId: string): void {
    void this.options.threadConversationService
      .syncCompletedTurn(threadId, sourceId)
      .catch((error: unknown) => {
        this.options.handleClientError(toError(error));
      });
  }
}
