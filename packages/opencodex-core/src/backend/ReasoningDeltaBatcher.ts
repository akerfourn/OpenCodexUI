import type { CodexNotification } from "@open-codex-ui/codex-rpc";

import { readObject, readString } from "../mapping.js";
import { readReasoningDeltaText } from "../mapping/activitySummary.js";

/** Delay used to combine consecutive reasoning fragments. */
export const REASONING_DELTA_BATCH_MS = 50;

type PendingReasoningDelta = {
  sourceId: string;
  threadId: string;
  turnId: string;
  itemId: string;
  method: string;
  segmentIndex: number | null;
  params: Record<string, unknown>;
  delta: string;
  timeout: ReturnType<typeof setTimeout> | null;
};

/** Callback used to re-enter the normal backend notification pipeline. */
export interface ReasoningDeltaBatcherOptions {
  /** Processes one normalized and batched notification. */
  process(notification: CodexNotification, sourceId: string): void;
}

/**
 * Combines high-frequency reasoning notifications before backend processing.
 */
export class ReasoningDeltaBatcher {
  /** Pending fragments keyed by source, turn, item, method, and segment. */
  private readonly pendingDeltas = new Map<string, PendingReasoningDelta>();
  /** Backend callback invoked when a batch is ready. */
  private readonly options: ReasoningDeltaBatcherOptions;

  /**
   * Creates a reasoning delta batcher.
   *
   * @param options Batched notification callback.
   */
  constructor(options: ReasoningDeltaBatcherOptions) {
    this.options = options;
  }

  /**
   * Buffers a reasoning delta or flushes earlier deltas before another event.
   *
   * @param notification Incoming Codex notification.
   * @param sourceId Source that produced the notification.
   *
   * @returns `true` when the notification was buffered and must not be processed yet.
   */
  handleNotification(notification: CodexNotification, sourceId: string): boolean {
    if (!isReasoningDeltaNotification(notification.method)) {
      this.flushBeforeNotification(notification, sourceId);
      return false;
    }

    const pendingDelta = createPendingReasoningDelta(notification, sourceId);

    if (pendingDelta === null) {
      return true;
    }

    this.flushOtherItemSegments(pendingDelta);
    this.enqueue(pendingDelta);
    return true;
  }

  /**
   * Flushes every pending delta while preserving insertion order.
   */
  flushAll(): void {
    for (const key of Array.from(this.pendingDeltas.keys())) {
      this.flush(key);
    }
  }

  /**
   * Flushes pending deltas owned by one Codex source.
   *
   * @param sourceId Source being closed.
   */
  flushSource(sourceId: string): void {
    this.flushMatching((pendingDelta) => pendingDelta.sourceId === sourceId);
  }

  /**
   * Adds a fragment to an existing batch or starts a new timer.
   *
   * @param pendingDelta Normalized reasoning fragment.
   */
  private enqueue(pendingDelta: PendingReasoningDelta): void {
    const key = createPendingReasoningDeltaKey(pendingDelta);
    const existing = this.pendingDeltas.get(key);

    if (existing !== undefined) {
      existing.delta += pendingDelta.delta;
      return;
    }

    pendingDelta.timeout = setTimeout(() => {
      this.flush(key);
    }, REASONING_DELTA_BATCH_MS);
    this.pendingDeltas.set(key, pendingDelta);
  }

  /**
   * Flushes a previous segment before buffering another segment of the same item.
   *
   * @param incomingDelta Fragment about to be buffered.
   */
  private flushOtherItemSegments(incomingDelta: PendingReasoningDelta): void {
    const incomingKey = createPendingReasoningDeltaKey(incomingDelta);

    this.flushMatching((pendingDelta, key) => (
      key !== incomingKey &&
      pendingDelta.sourceId === incomingDelta.sourceId &&
      pendingDelta.threadId === incomingDelta.threadId &&
      pendingDelta.turnId === incomingDelta.turnId &&
      pendingDelta.itemId === incomingDelta.itemId
    ));
  }

  /**
   * Flushes deltas that must precede an incoming non-reasoning notification.
   *
   * @param notification Incoming boundary notification.
   * @param sourceId Source that produced the notification.
   */
  private flushBeforeNotification(notification: CodexNotification, sourceId: string): void {
    const params = readObject(notification.params);
    const threadId = readString(params.threadId);
    const turnId = readString(params.turnId) || readString(readObject(params.turn).id);

    if (threadId.length === 0) {
      return;
    }

    if (turnId.length === 0 && !isThreadBoundaryNotification(notification.method)) {
      return;
    }

    this.flushMatching((pendingDelta) => (
      pendingDelta.sourceId === sourceId &&
      pendingDelta.threadId === threadId &&
      (turnId.length === 0 || pendingDelta.turnId === turnId)
    ));
  }

  /**
   * Flushes pending entries accepted by a predicate.
   *
   * @param predicate Entry selector.
   */
  private flushMatching(
    predicate: (pendingDelta: PendingReasoningDelta, key: string) => boolean
  ): void {
    const keys = Array.from(this.pendingDeltas.entries())
      .filter(([key, pendingDelta]) => predicate(pendingDelta, key))
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
    const pendingDelta = this.pendingDeltas.get(key);

    if (pendingDelta === undefined) {
      return;
    }

    if (pendingDelta.timeout !== null) {
      clearTimeout(pendingDelta.timeout);
    }

    this.pendingDeltas.delete(key);
    this.options.process({
      method: pendingDelta.method,
      params: {
        ...pendingDelta.params,
        delta: pendingDelta.delta
      }
    }, pendingDelta.sourceId);
  }
}

/**
 * Normalizes a supported reasoning delta for batching.
 *
 * @param notification Incoming Codex notification.
 * @param sourceId Source that produced the notification.
 *
 * @returns Pending delta, or `null` when the fragment has no displayable text.
 */
function createPendingReasoningDelta(
  notification: CodexNotification,
  sourceId: string
): PendingReasoningDelta | null {
  const params = readObject(notification.params);
  const threadId = readString(params.threadId);
  const turnId = readString(params.turnId);
  const itemId = readString(params.itemId);
  const delta = readReasoningDeltaText(params.delta);

  if (
    threadId.length === 0 ||
    turnId.length === 0 ||
    itemId.length === 0 ||
    delta.length === 0
  ) {
    return null;
  }

  return {
    sourceId,
    threadId,
    turnId,
    itemId,
    method: notification.method,
    segmentIndex: readReasoningSegmentIndex(notification.method, params),
    params: { ...params },
    delta,
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
 * Builds an unambiguous pending reasoning delta key.
 *
 * @param pendingDelta Normalized reasoning fragment.
 *
 * @returns Map key scoped to one source and reasoning segment.
 */
function createPendingReasoningDeltaKey(pendingDelta: PendingReasoningDelta): string {
  return [
    pendingDelta.sourceId,
    pendingDelta.threadId,
    pendingDelta.turnId,
    pendingDelta.itemId,
    pendingDelta.method,
    pendingDelta.segmentIndex ?? ""
  ].join("\u0000");
}

/**
 * Checks whether a notification carries append-only reasoning text.
 *
 * @param method Codex notification method.
 *
 * @returns `true` for supported reasoning delta methods.
 */
function isReasoningDeltaNotification(method: string): boolean {
  return method === "item/reasoning/summaryTextDelta" ||
    method === "item/reasoning/textDelta";
}

/**
 * Checks whether a thread-level event must follow all buffered reasoning.
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
