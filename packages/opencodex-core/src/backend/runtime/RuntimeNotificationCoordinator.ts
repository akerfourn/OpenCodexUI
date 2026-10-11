import type { CodexNotification } from "@open-codex-ui/codex-rpc";

import type { ThreadTurnCache } from "../../ThreadTurnCache.js";
import { readObject, readString } from "../../mapping.js";
import type { CollaborationService } from "../collaboration/CollaborationService.js";
import type { NotificationService } from "../support/NotificationService.js";
import type { ProjectCommandService } from "../projects/ProjectCommandService.js";
import { StreamingNotificationBatcher } from "./StreamingNotificationBatcher.js";
import { TurnExecutionMetadataRecorder } from "./TurnExecutionMetadataRecorder.js";
import type { ThreadCacheService } from "../threads/ThreadCacheService.js";
import type { ThreadConversationService } from "../threads/ThreadConversationService.js";
import type { ThreadRuntimeHandler } from "../threads/ThreadRuntimeHandler.js";
import {
  mapThreadGoalClearedNotification,
  mapThreadGoalUpdatedNotification
} from "../threads/threadGoalMapping.js";
import { mapThreadTokenUsageNotification } from "../threads/threadTokenUsageMapping.js";
import type { RuntimeEventPort, RuntimeSettingsPort } from "./runtimePorts.js";
import type { UsageRuntimeService } from "../usage/UsageRuntimeService.js";

/** Dependencies used by the notification coordination pipeline. */
export type RuntimeNotificationCoordinatorOptions = {
  /** Records execution ownership before optional UI notification suppression. */
  recordWorkspaceNotification?(notification: CodexNotification, sourceId: string): void;
  /** Reads the current runtime settings. */
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  /** Reports receipt of one raw notification and its estimated payload size. */
  onRawReceived?(method: string, estimatedBytes: number): void;
  /** Reports synchronous processing time for one normalized notification. */
  onProcessed?(method: string, durationMs: number): void;
  /** Reports synchronous live-cache processing time when advanced metrics are enabled. */
  onLiveCacheProcessed?(method: string, durationMs: number): void;
  /** Checks whether notifications for a thread are temporarily suppressed. */
  threads: Pick<ThreadRuntimeHandler, "isThreadIgnored">;
  /** Records one raw notification in the runtime-owned event log. */
  events: Pick<RuntimeEventPort, "emit" | "recordRawNotification">;
  /** Handles rate-limit updates and turn completion in the usage runtime service. */
  usage: Pick<UsageRuntimeService, "handleRateLimitsUpdated" | "handleTurnCompleted">;
  /** Cache service used for token and execution metadata persistence. */
  threadCacheService: Pick<
    ThreadCacheService,
    "writeTokenUsage" | "writeTurnExecutionMetadata"
  >;
  /** In-memory thread and turn cache. */
  threadTurnCache: ThreadTurnCache;
  /** Collaboration notification adapter. */
  collaborationService: Pick<CollaborationService, "handleNotification"> &
    Partial<Pick<
      CollaborationService,
      "getSpawnExecutionMetadata" | "resolveSpawnExecutionMetadata"
    >>;
  /** Conversation notification adapter. */
  threadConversationService: Pick<
    ThreadConversationService,
    "recordStartedThread" | "recordNotification"
  >;
  /** Project-command notification adapter. */
  projectCommandService: Pick<ProjectCommandService, "handleNotification">;
  /** UI notification adapter. */
  notificationService: Pick<NotificationService, "handleNotification">;
};

/**
 * Owns the ordered processing pipeline for raw and streamed Codex notifications.
 *
 * The coordinator delegates thread suppression and usage accounting to their
 * owning services while retaining callbacks only for lifecycle and metrics concerns.
 */
export class RuntimeNotificationCoordinator {
  /** Combines high-frequency streaming notifications before processing them. */
  private readonly streamingNotificationBatcher: StreamingNotificationBatcher;
  /** Enriches and persists execution settings without changing pipeline ordering. */
  private readonly turnExecutionMetadataRecorder: TurnExecutionMetadataRecorder;
  /** Active turn identifiers grouped by Codex source. */
  private readonly activeTurnIdsBySourceId = new Map<string, Set<string>>();

  /**
   * Creates a notification coordinator and its streaming batcher.
   *
   * @param options Narrow service ports and runtime callbacks.
   */
  constructor(
    /** Service adapters and runtime callbacks used by the pipeline. */
    private readonly options: RuntimeNotificationCoordinatorOptions
  ) {
    this.turnExecutionMetadataRecorder = new TurnExecutionMetadataRecorder({
      threadTurnCache: options.threadTurnCache,
      threadCacheService: options.threadCacheService,
      collaborationService: options.collaborationService
    });
    this.streamingNotificationBatcher = new StreamingNotificationBatcher({
      process: (notification, sourceId) => this.processNotification(notification, sourceId)
    });
  }

  /**
   * Handles a raw notification received from one Codex source.
   *
   * @param notification Raw Codex notification.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  handleNotification(notification: CodexNotification, sourceId: string): void {
    this.options.recordWorkspaceNotification?.(notification, sourceId);
    this.options.onRawReceived?.(
      notification.method,
      estimateNotificationBytes(notification.params)
    );
    const threadId = readString(readObject(notification.params).threadId);

    if (threadId.length > 0 && this.options.threads.isThreadIgnored(threadId)) {
      return;
    }

    this.options.events.recordRawNotification(notification, sourceId);

    if (this.streamingNotificationBatcher.handleNotification(notification, sourceId)) {
      return;
    }

    this.processNotification(notification, sourceId);
  }

  /**
   * Flushes all pending streamed notifications.
   *
   * @returns Nothing.
   */
  flushAll(): void {
    this.streamingNotificationBatcher.flushAll();
  }

  /**
   * Flushes pending streamed notifications for one source.
   *
   * @param sourceId Source whose pending notifications should be processed.
   * @returns Nothing.
   */
  flushSource(sourceId: string): void {
    this.streamingNotificationBatcher.flushSource(sourceId);
  }

  /**
   * Checks whether a source currently owns an active turn.
   *
   * @param sourceId Source identifier.
   * @returns Whether at least one turn is active for the source.
   */
  hasActiveTurn(sourceId: string): boolean {
    return (this.activeTurnIdsBySourceId.get(sourceId)?.size ?? 0) > 0;
  }

  /**
   * Checks whether any Codex source currently owns an active turn.
   *
   * @returns Whether at least one turn is active across all sources.
   */
  hasActiveTurns(): boolean {
    for (const activeTurnIds of this.activeTurnIdsBySourceId.values()) {
      if (activeTurnIds.size > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Clears active-turn state when a source client closes.
   *
   * @param sourceId Source identifier.
   * @returns Nothing.
   */
  clearSourceActiveTurns(sourceId: string): void {
    this.activeTurnIdsBySourceId.delete(sourceId);
  }

  /**
   * Processes one immediate or already-batched notification.
   *
   * @param notification Notification ready for backend processing.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   * @throws Synchronous errors from downstream services.
   */
  private processNotification(notification: CodexNotification, sourceId: string): void {
    const startedAt = performance.now();

    try {
      this.recordLiveCacheNotification(notification);
      void this.options.collaborationService.handleNotification(notification, sourceId);

      if (notification.method === "thread/started") {
        const thread = readObject(notification.params).thread;
        void this.options.threadConversationService.recordStartedThread(thread, sourceId);
      }

      this.turnExecutionMetadataRecorder.recordNotification(notification, sourceId);
      this.trackActiveTurnNotification(notification, sourceId);
      this.options.projectCommandService.handleNotification(notification);
      this.options.notificationService.handleNotification(notification, sourceId);

      if (notification.method === "account/rateLimits/updated") {
        this.options.usage.handleRateLimitsUpdated(sourceId, notification.params);
      }

      if (notification.method === "thread/tokenUsage/updated") {
        this.handleTokenUsageNotification(notification, sourceId);
      }

      if (notification.method === "thread/goal/updated") {
        this.handleThreadGoalUpdatedNotification(notification, sourceId);
      }

      if (notification.method === "thread/goal/cleared") {
        this.handleThreadGoalClearedNotification(notification, sourceId);
      }

      if (notification.method === "turn/completed") {
        this.options.usage.handleTurnCompleted(sourceId);
      }
    } finally {
      this.options.onProcessed?.(
        notification.method,
        performance.now() - startedAt
      );
    }
  }

  /**
   * Records live notification data and optional cache timing metrics.
   *
   * @param notification Notification ready for cache processing.
   * @returns Nothing.
   */
  private recordLiveCacheNotification(notification: CodexNotification): void {
    const settings = this.options.settings.getSettings();
    const shouldMeasure = settings.developerMode &&
      settings.advancedPerformanceMonitoringEnabled;

    if (!shouldMeasure) {
      this.options.threadConversationService.recordNotification(notification);
      return;
    }

    const startedAt = performance.now();
    this.options.threadConversationService.recordNotification(notification);
    this.options.onLiveCacheProcessed?.(
      notification.method,
      performance.now() - startedAt
    );
  }

  /**
   * Updates the in-memory and persisted token usage snapshot.
   *
   * @param notification Token usage notification.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  private handleTokenUsageNotification(
    notification: CodexNotification,
    sourceId: string
  ): void {
    const usage = mapThreadTokenUsageNotification(notification.params);

    if (usage === null) {
      return;
    }

    const cacheEntry = this.options.threadTurnCache.get(usage.threadId);

    if (cacheEntry !== null) {
      cacheEntry.tokenUsage = usage;
    }

    void this.options.threadCacheService.writeTokenUsage(sourceId, usage);
    this.options.events.emit({ type: "thread.tokenUsage.updated", sourceId, usage });
  }

  /** Emits a normalized UI event for a native goal update. */
  private handleThreadGoalUpdatedNotification(
    notification: CodexNotification,
    sourceId: string
  ): void {
    const goalUpdate = mapThreadGoalUpdatedNotification(notification.params);

    if (goalUpdate === null) {
      return;
    }

    this.options.events.emit({
      type: "thread.goal.updated",
      sourceId,
      threadId: goalUpdate.threadId,
      goal: goalUpdate.goal
    });
  }

  /** Emits a normalized UI event for a native goal clear. */
  private handleThreadGoalClearedNotification(
    notification: CodexNotification,
    sourceId: string
  ): void {
    const threadId = mapThreadGoalClearedNotification(notification.params);

    if (threadId === null) {
      return;
    }

    this.options.events.emit({
      type: "thread.goal.cleared",
      sourceId,
      threadId
    });
  }

  /**
   * Updates source-scoped active turn state for a turn boundary notification.
   *
   * @param notification Notification ready for processing.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  private trackActiveTurnNotification(notification: CodexNotification, sourceId: string): void {
    const params = readObject(notification.params);

    if (notification.method === "turn/started") {
      const turnId = readString(readObject(params.turn).id);

      if (turnId.length > 0) {
        this.addActiveTurn(sourceId, turnId);
      }
      return;
    }

    if (notification.method === "turn/completed") {
      const turnId = readString(readObject(params.turn).id);

      if (turnId.length > 0) {
        this.removeActiveTurn(sourceId, turnId);
      }
    }
  }

  /**
   * Adds one turn identifier to a source's active set.
   *
   * @param sourceId Source identifier.
   * @param turnId Turn identifier.
   * @returns Nothing.
   */
  private addActiveTurn(sourceId: string, turnId: string): void {
    const activeTurnIds = this.activeTurnIdsBySourceId.get(sourceId) ?? new Set<string>();
    activeTurnIds.add(turnId);
    this.activeTurnIdsBySourceId.set(sourceId, activeTurnIds);
  }

  /**
   * Removes one turn identifier from a source's active set.
   *
   * @param sourceId Source identifier.
   * @param turnId Turn identifier.
   * @returns Nothing.
   */
  private removeActiveTurn(sourceId: string, turnId: string): void {
    const activeTurnIds = this.activeTurnIdsBySourceId.get(sourceId);

    if (activeTurnIds === undefined) {
      return;
    }

    activeTurnIds.delete(turnId);

    if (activeTurnIds.size === 0) {
      this.activeTurnIdsBySourceId.delete(sourceId);
    }
  }
}

/**
 * Estimates streamed notification volume without serializing or retaining content.
 *
 * @param value Raw notification parameters.
 * @returns Total length of known high-volume string fields.
 */
function estimateNotificationBytes(value: unknown): number {
  const params = readObject(value);
  const fieldNames = ["delta", "deltaBase64", "diff", "message", "output"];
  let estimatedBytes = 0;

  for (const fieldName of fieldNames) {
    const fieldValue = params[fieldName];

    if (typeof fieldValue === "string") {
      estimatedBytes += fieldValue.length;
    }
  }

  return estimatedBytes;
}
