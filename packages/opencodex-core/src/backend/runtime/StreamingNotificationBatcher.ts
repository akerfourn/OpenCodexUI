import type { CodexNotification } from "@open-codex-ui/codex-rpc";

import { readObject, readString } from "../../mapping.js";
import {
  buildBatchedParams,
  createPendingNotificationKey,
  createPendingStreamingNotification,
  hasSameLogicalOwner,
  isBatchableNotification,
  type PendingStreamingNotification
} from "../threads/streamingNotificationPayload.js";

/** Delay used to combine consecutive high-frequency fragments. */
export const STREAMING_NOTIFICATION_BATCH_MS = 50;

/** Callback used to re-enter the normal backend notification pipeline. */
export interface StreamingNotificationBatcherOptions {
  /** Processes one normalized and batched notification. */
  process(notification: CodexNotification, sourceId: string): void;
}

/**
 * Combines high-frequency streaming notifications before backend processing.
 */
export class StreamingNotificationBatcher {
  /** Pending fragments keyed by source, owner, method, segment, and stream. */
  private readonly pendingNotifications = new Map<string, PendingStreamingNotification>();
  /** Backend callback invoked when a batch is ready. */
  private readonly options: StreamingNotificationBatcherOptions;

  /**
   * Creates a streaming notification batcher.
   *
   * @param options Batched notification callback.
   */
  constructor(options: StreamingNotificationBatcherOptions) {
    this.options = options;
  }

  /**
   * Buffers a streaming update or flushes earlier updates before another event.
   *
   * @param notification Incoming Codex notification.
   * @param sourceId Source that produced the notification.
   *
   * @returns `true` when the notification was buffered and must not be processed yet.
   */
  handleNotification(notification: CodexNotification, sourceId: string): boolean {
    if (!isBatchableNotification(notification.method)) {
      this.flushBeforeNotification(notification, sourceId);
      return false;
    }

    const pendingNotification = createPendingStreamingNotification(notification, sourceId);

    if (pendingNotification === null) {
      return true;
    }

    this.flushOtherOwnerStreams(pendingNotification);
    this.enqueue(pendingNotification);
    return true;
  }

  /**
   * Flushes every pending notification while preserving insertion order.
   */
  flushAll(): void {
    for (const key of Array.from(this.pendingNotifications.keys())) {
      this.flush(key);
    }
  }

  /**
   * Flushes pending notifications owned by one Codex source.
   *
   * @param sourceId Source being closed.
   */
  flushSource(sourceId: string): void {
    this.flushMatching((pendingNotification) => pendingNotification.sourceId === sourceId);
  }

  /**
   * Adds a fragment to an existing batch or starts a new timer.
   *
   * @param pendingNotification Normalized streaming fragment.
   */
  private enqueue(pendingNotification: PendingStreamingNotification): void {
    const key = createPendingNotificationKey(pendingNotification);
    const existing = this.pendingNotifications.get(key);

    if (existing !== undefined) {
      if (existing.mergeMode === "replace") {
        existing.params = pendingNotification.params;
        existing.chunks = pendingNotification.chunks;
        existing.capReached = pendingNotification.capReached;
        return;
      }

      existing.chunks.push(...pendingNotification.chunks);
      existing.capReached = existing.capReached || pendingNotification.capReached;
      return;
    }

    pendingNotification.timeout = setTimeout(() => {
      this.flush(key);
    }, STREAMING_NOTIFICATION_BATCH_MS);
    this.pendingNotifications.set(key, pendingNotification);
  }

  /**
   * Flushes another stream before buffering the same logical owner.
   *
   * @param incomingNotification Fragment about to be buffered.
   */
  private flushOtherOwnerStreams(incomingNotification: PendingStreamingNotification): void {
    const incomingKey = createPendingNotificationKey(incomingNotification);

    this.flushMatching((pendingNotification, key) => (
      key !== incomingKey &&
      hasSameLogicalOwner(pendingNotification, incomingNotification)
    ));
  }

  /**
   * Flushes streams that must precede an incoming immediate notification.
   *
   * @param notification Incoming boundary notification.
   * @param sourceId Source that produced the notification.
   */
  private flushBeforeNotification(notification: CodexNotification, sourceId: string): void {
    const params = readObject(notification.params);
    const processKey = readString(params.processHandle);

    if (notification.method === "process/exited" && processKey.length > 0) {
      this.flushMatching((pendingNotification) => (
        pendingNotification.sourceId === sourceId &&
        pendingNotification.processKey === processKey
      ));
      return;
    }

    const threadId = readString(params.threadId);
    const turnId = readString(params.turnId) || readString(readObject(params.turn).id);

    if (threadId.length === 0) {
      return;
    }

    if (turnId.length === 0 && !isThreadBoundaryNotification(notification.method)) {
      return;
    }

    this.flushMatching((pendingNotification) => (
      pendingNotification.sourceId === sourceId &&
      pendingNotification.threadId === threadId &&
      (turnId.length === 0 || pendingNotification.turnId === turnId)
    ));
  }

  /**
   * Flushes pending entries accepted by a predicate.
   *
   * @param predicate Entry selector.
   */
  private flushMatching(
    predicate: (pendingNotification: PendingStreamingNotification, key: string) => boolean
  ): void {
    const keys = Array.from(this.pendingNotifications.entries())
      .filter(([key, pendingNotification]) => predicate(pendingNotification, key))
      .map(([key]) => key);

    for (const key of keys) {
      this.flush(key);
    }
  }

  /**
   * Emits one pending batch and cancels its timer.
   *
   * @param key Pending delta key.
   */
  private flush(key: string): void {
    const pendingNotification = this.pendingNotifications.get(key);

    if (pendingNotification === undefined) {
      return;
    }

    if (pendingNotification.timeout !== null) {
      clearTimeout(pendingNotification.timeout);
    }

    this.pendingNotifications.delete(key);
    this.options.process({
      method: pendingNotification.method,
      params: buildBatchedParams(pendingNotification)
    }, pendingNotification.sourceId);
  }
}

/**
 * Checks whether a thread-level event must follow all buffered streams.
 *
 * @param method Codex notification method.
 *
 * @returns `true` for notifications that end or remove a thread stream.
 */
function isThreadBoundaryNotification(method: string): boolean {
  return method === "thread/closed" ||
    method === "thread/deleted" ||
    method === "thread/archived";
}
