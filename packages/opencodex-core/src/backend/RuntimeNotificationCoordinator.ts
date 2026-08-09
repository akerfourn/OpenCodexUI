import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexTurnExecutionMetadata
} from "@open-codex-ui/opencodex-protocol";

import type { ThreadTurnCache } from "../ThreadTurnCache.js";
import { readObject, readString } from "../mapping.js";
import type { CollaborationService } from "./CollaborationService.js";
import type { NotificationService } from "./NotificationService.js";
import type { ProjectCommandService } from "./ProjectCommandService.js";
import { StreamingNotificationBatcher } from "./StreamingNotificationBatcher.js";
import type { ThreadCacheService } from "./ThreadCacheService.js";
import type { ThreadConversationService } from "./ThreadConversationService.js";
import { mapThreadTokenUsageNotification } from "./threadTokenUsageMapping.js";

/** Dependencies used by the notification coordination pipeline. */
export type RuntimeNotificationCoordinatorOptions = {
  /** Reads the current runtime settings. */
  getSettings(): OpenCodexSettings;
  /** Reports receipt of one raw notification and its estimated payload size. */
  onRawReceived?(method: string, estimatedBytes: number): void;
  /** Reports synchronous processing time for one normalized notification. */
  onProcessed?(method: string, durationMs: number): void;
  /** Reports synchronous live-cache processing time when advanced metrics are enabled. */
  onLiveCacheProcessed?(method: string, durationMs: number): void;
  /** Checks whether notifications for a thread are temporarily suppressed. */
  isThreadIgnored(threadId: string): boolean;
  /** Records one raw notification in the runtime-owned event log. */
  recordRawNotification(notification: CodexNotification, sourceId: string): void;
  /** Emits a normalized backend event. */
  emit(event: OpenCodexEvent): void;
  /** Handles a rate-limit update in the usage runtime service. */
  handleRateLimitsUpdated(sourceId: string, params: unknown): void;
  /** Handles completion of one Codex turn in the usage runtime service. */
  handleTurnCompleted(sourceId: string): void;
  /** Cache service used for token and execution metadata persistence. */
  threadCacheService: Pick<
    ThreadCacheService,
    "writeTokenUsage" | "writeTurnExecutionMetadata"
  >;
  /** In-memory thread and turn cache. */
  threadTurnCache: ThreadTurnCache;
  /** Collaboration notification adapter. */
  collaborationService: Pick<CollaborationService, "handleNotification">;
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
 * The coordinator deliberately keeps raw journaling and thread suppression as
 * callbacks. Those concerns belong to the runtime because they also cover
 * backend-emitted events and commit-message notification suppression.
 */
export class RuntimeNotificationCoordinator {
  /** Combines high-frequency streaming notifications before processing them. */
  private readonly streamingNotificationBatcher: StreamingNotificationBatcher;
  /** Active turn identifiers grouped by Codex source. */
  private readonly activeTurnIdsBySourceId = new Map<string, Set<string>>();

  /**
   * Creates a notification coordinator and its streaming batcher.
   *
   * @param options Narrow service and runtime callbacks.
   */
  constructor(
    /** Service adapters and runtime callbacks used by the pipeline. */
    private readonly options: RuntimeNotificationCoordinatorOptions
  ) {
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
    this.options.onRawReceived?.(
      notification.method,
      estimateNotificationBytes(notification.params)
    );
    const threadId = readString(readObject(notification.params).threadId);

    if (threadId.length > 0 && this.options.isThreadIgnored(threadId)) {
      return;
    }

    this.options.recordRawNotification(notification, sourceId);

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

      this.recordTurnExecutionNotification(notification, sourceId);
      this.trackActiveTurnNotification(notification, sourceId);
      this.options.projectCommandService.handleNotification(notification);
      this.options.notificationService.handleNotification(notification, sourceId);

      if (notification.method === "account/rateLimits/updated") {
        this.options.handleRateLimitsUpdated(sourceId, notification.params);
      }

      if (notification.method === "thread/tokenUsage/updated") {
        this.handleTokenUsageNotification(notification, sourceId);
      }

      if (notification.method === "turn/completed") {
        this.options.handleTurnCompleted(sourceId);
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
    const settings = this.options.getSettings();
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
   * Records execution metadata from turn-start and model-reroute notifications.
   *
   * @param notification Notification ready for cache processing.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  private recordTurnExecutionNotification(
    notification: CodexNotification,
    sourceId: string
  ): void {
    const params = readObject(notification.params);
    const threadId = readString(params.threadId);

    if (threadId.length === 0) {
      return;
    }

    if (notification.method === "turn/started") {
      const turnId = readString(readObject(params.turn).id);

      if (
        turnId.length === 0 ||
        this.options.threadTurnCache.getTurnExecutionMetadata(threadId, turnId) !== null
      ) {
        return;
      }

      const thread = this.options.threadTurnCache.get(threadId)?.thread;
      const metadata: OpenCodexTurnExecutionMetadata = {
        requestedModel: null,
        effectiveModel: thread?.model ?? null,
        requestedReasoningEffort: null,
        effectiveReasoningEffort: thread?.reasoningEffort ?? null,
        serviceTier: null
      };
      void this.options.threadCacheService.writeTurnExecutionMetadata(
        sourceId,
        threadId,
        turnId,
        metadata
      );
      return;
    }

    if (notification.method !== "model/rerouted") {
      return;
    }

    const turnId = readString(params.turnId);
    const toModel = readString(params.toModel);

    if (turnId.length === 0 || toModel.length === 0) {
      return;
    }

    const current = this.options.threadTurnCache.getTurnExecutionMetadata(threadId, turnId);
    const metadata: OpenCodexTurnExecutionMetadata = {
      requestedModel: current?.requestedModel ?? null,
      effectiveModel: toModel,
      requestedReasoningEffort: current?.requestedReasoningEffort ?? null,
      effectiveReasoningEffort: current?.effectiveReasoningEffort ?? null,
      serviceTier: current?.serviceTier ?? null
    };
    void this.options.threadCacheService.writeTurnExecutionMetadata(
      sourceId,
      threadId,
      turnId,
      metadata
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
    this.options.emit({ type: "thread.tokenUsage.updated", sourceId, usage });
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
