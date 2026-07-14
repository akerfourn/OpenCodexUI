import type { CodexNotification } from "@open-codex-ui/codex-rpc";

import { readObject, readString } from "../mapping.js";
import { readReasoningDeltaText } from "../mapping/activitySummary.js";

/** Delay used to combine consecutive high-frequency fragments. */
export const STREAMING_NOTIFICATION_BATCH_MS = 50;

type PendingStreamingNotification = {
  sourceId: string;
  threadId: string;
  turnId: string;
  itemId: string;
  processKey: string;
  method: string;
  segmentIndex: number | null;
  stream: string;
  params: Record<string, unknown>;
  payloadField: "delta" | "deltaBase64" | "message";
  payloadEncoding: "base64" | "text";
  chunks: string[];
  capReached: boolean;
  timeout: ReturnType<typeof setTimeout> | null;
};

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
 * Normalizes a supported streaming notification for batching.
 *
 * @param notification Incoming Codex notification.
 * @param sourceId Source that produced the notification.
 *
 * @returns Pending notification, or `null` when the fragment is invalid or empty.
 */
function createPendingStreamingNotification(
  notification: CodexNotification,
  sourceId: string
): PendingStreamingNotification | null {
  const params = readObject(notification.params);

  if (
    notification.method === "item/reasoning/summaryTextDelta" ||
    notification.method === "item/reasoning/textDelta"
  ) {
    return createChatPendingNotification(
      notification,
      sourceId,
      params,
      "delta",
      readReasoningDeltaText(params.delta),
      readReasoningSegmentIndex(notification.method, params)
    );
  }

  if (notification.method === "item/commandExecution/outputDelta") {
    return createChatPendingNotification(
      notification,
      sourceId,
      params,
      "delta",
      readString(params.delta)
    );
  }

  if (notification.method === "item/mcpToolCall/progress") {
    return createChatPendingNotification(
      notification,
      sourceId,
      params,
      "message",
      readString(params.message)
    );
  }

  if (notification.method === "process/outputDelta") {
    return createProcessPendingNotification(
      notification,
      sourceId,
      params,
      "processHandle"
    );
  }

  if (notification.method === "command/exec/outputDelta") {
    const legacyDelta = readString(params.delta);

    if (legacyDelta.length > 0) {
      return createChatPendingNotification(
        notification,
        sourceId,
        params,
        "delta",
        legacyDelta
      );
    }

    return createProcessPendingNotification(
      notification,
      sourceId,
      params,
      "processId"
    );
  }

  return null;
}

/**
 * Creates a pending notification owned by a chat item.
 *
 * @param notification Incoming Codex notification.
 * @param sourceId Source that produced the notification.
 * @param params Notification parameters.
 * @param payloadField Text field to restore after batching.
 * @param chunk Normalized text fragment.
 * @param segmentIndex Optional reasoning segment index.
 *
 * @returns Pending chat notification, or `null` when identifiers are missing.
 */
function createChatPendingNotification(
  notification: CodexNotification,
  sourceId: string,
  params: Record<string, unknown>,
  payloadField: "delta" | "message",
  chunk: string,
  segmentIndex: number | null = null
): PendingStreamingNotification | null {
  const threadId = readString(params.threadId);
  const turnId = readString(params.turnId);
  const itemId = readString(params.itemId);

  if (
    threadId.length === 0 ||
    turnId.length === 0 ||
    itemId.length === 0 ||
    chunk.length === 0
  ) {
    return null;
  }

  return {
    sourceId,
    threadId,
    turnId,
    itemId,
    processKey: "",
    method: notification.method,
    segmentIndex,
    stream: "",
    params: { ...params },
    payloadField,
    payloadEncoding: "text",
    chunks: [chunk],
    capReached: false,
    timeout: null
  };
}

/**
 * Creates a pending notification owned by a connection-scoped process.
 *
 * @param notification Incoming Codex notification.
 * @param sourceId Source that produced the notification.
 * @param params Notification parameters.
 * @param processKeyField Field containing the process identifier.
 *
 * @returns Pending process notification, or `null` when payload is invalid.
 */
function createProcessPendingNotification(
  notification: CodexNotification,
  sourceId: string,
  params: Record<string, unknown>,
  processKeyField: "processHandle" | "processId"
): PendingStreamingNotification | null {
  const processKey = readString(params[processKeyField]);
  const stream = readString(params.stream);
  const chunk = readString(params.deltaBase64);

  if (
    processKey.length === 0 ||
    (stream !== "stdout" && stream !== "stderr") ||
    chunk.length === 0
  ) {
    return null;
  }

  return {
    sourceId,
    threadId: "",
    turnId: "",
    itemId: "",
    processKey,
    method: notification.method,
    segmentIndex: null,
    stream,
    params: { ...params },
    payloadField: "deltaBase64",
    payloadEncoding: "base64",
    chunks: [chunk],
    capReached: params.capReached === true,
    timeout: null
  };
}

/**
 * Reads the segment index used to avoid merging distinct reasoning parts.
 *
 * @param method Reasoning notification method.
 * @param params Notification parameters.
 *
 * @returns Segment index, or `null` when absent.
 */
function readReasoningSegmentIndex(
  method: string,
  params: Record<string, unknown>
): number | null {
  const value = method === "item/reasoning/summaryTextDelta"
    ? params.summaryIndex
    : params.contentIndex;

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Builds an unambiguous pending streaming notification key.
 *
 * @param pendingNotification Normalized streaming fragment.
 *
 * @returns Map key scoped to one source and ordered stream.
 */
function createPendingNotificationKey(
  pendingNotification: PendingStreamingNotification
): string {
  return [
    pendingNotification.sourceId,
    pendingNotification.threadId,
    pendingNotification.turnId,
    pendingNotification.itemId,
    pendingNotification.processKey,
    pendingNotification.method,
    pendingNotification.segmentIndex ?? "",
    pendingNotification.stream
  ].join("\u0000");
}

/**
 * Checks whether a notification carries an append-only streaming payload.
 *
 * @param method Codex notification method.
 *
 * @returns `true` for supported high-frequency notification methods.
 */
function isBatchableNotification(method: string): boolean {
  return method === "item/reasoning/summaryTextDelta" ||
    method === "item/reasoning/textDelta" ||
    method === "item/commandExecution/outputDelta" ||
    method === "item/mcpToolCall/progress" ||
    method === "process/outputDelta" ||
    method === "command/exec/outputDelta";
}

/**
 * Checks whether two pending notifications belong to one ordered stream owner.
 *
 * @param first Existing pending notification.
 * @param second Incoming pending notification.
 *
 * @returns `true` when switching keys must flush the existing notification.
 */
function hasSameLogicalOwner(
  first: PendingStreamingNotification,
  second: PendingStreamingNotification
): boolean {
  if (first.sourceId !== second.sourceId) {
    return false;
  }

  if (first.processKey.length > 0 || second.processKey.length > 0) {
    return first.processKey.length > 0 && first.processKey === second.processKey;
  }

  return first.threadId === second.threadId &&
    first.turnId === second.turnId &&
    first.itemId === second.itemId;
}

/**
 * Combines buffered text or base64 chunks without corrupting binary boundaries.
 *
 * @param pendingNotification Notification batch ready to process.
 *
 * @returns Combined payload using the original transport encoding.
 */
function combineChunks(pendingNotification: PendingStreamingNotification): string {
  if (pendingNotification.payloadEncoding === "text") {
    return pendingNotification.chunks.join("");
  }

  const buffers = pendingNotification.chunks.map((chunk) => Buffer.from(chunk, "base64"));
  return Buffer.concat(buffers).toString("base64");
}

/**
 * Restores a combined payload into the original notification parameters.
 *
 * @param pendingNotification Notification batch ready to process.
 *
 * @returns Plain notification parameters for the normal backend pipeline.
 */
function buildBatchedParams(
  pendingNotification: PendingStreamingNotification
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    ...pendingNotification.params,
    [pendingNotification.payloadField]: combineChunks(pendingNotification)
  };

  if (pendingNotification.payloadEncoding === "base64") {
    params.capReached = pendingNotification.capReached;
  }

  return params;
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
