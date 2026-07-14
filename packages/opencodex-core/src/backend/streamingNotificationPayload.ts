import type { CodexNotification } from "@open-codex-ui/codex-rpc";

import { readObject, readString } from "../mapping.js";
import { readReasoningDeltaText } from "../mapping/activitySummary.js";

/** Normalized notification waiting to be merged and emitted. */
export interface PendingStreamingNotification {
  sourceId: string;
  threadId: string;
  turnId: string;
  itemId: string;
  processKey: string;
  method: string;
  segmentIndex: number | null;
  stream: string;
  params: Record<string, unknown>;
  payloadField: "delta" | "deltaBase64" | "diff" | "message" | null;
  payloadEncoding: "base64" | "text";
  mergeMode: "append" | "replace";
  chunks: string[];
  capReached: boolean;
  timeout: ReturnType<typeof setTimeout> | null;
}

/**
 * Normalizes a supported streaming notification for batching.
 *
 * @param notification Incoming Codex notification.
 * @param sourceId Source that produced the notification.
 *
 * @returns Pending notification, or `null` when the fragment is invalid or empty.
 */
export function createPendingStreamingNotification(
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

  if (notification.method === "item/fileChange/outputDelta") {
    return createChatPendingNotification(
      notification,
      sourceId,
      params,
      "delta",
      readString(params.delta)
    );
  }

  if (notification.method === "item/fileChange/patchUpdated") {
    return createFilePatchPendingNotification(notification, sourceId, params);
  }

  if (notification.method === "turn/diff/updated") {
    return createTurnDiffPendingNotification(notification, sourceId, params);
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
    mergeMode: "append",
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
    mergeMode: "append",
    chunks: [chunk],
    capReached: params.capReached === true,
    timeout: null
  };
}

/**
 * Creates a replace-only pending snapshot for one file-change item.
 *
 * @param notification Incoming Codex notification.
 * @param sourceId Source that produced the notification.
 * @param params Notification parameters.
 *
 * @returns Pending patch snapshot, or `null` when payload is invalid.
 */
function createFilePatchPendingNotification(
  notification: CodexNotification,
  sourceId: string,
  params: Record<string, unknown>
): PendingStreamingNotification | null {
  const threadId = readString(params.threadId);
  const turnId = readString(params.turnId);
  const itemId = readString(params.itemId);

  if (
    threadId.length === 0 ||
    turnId.length === 0 ||
    itemId.length === 0 ||
    !Array.isArray(params.changes)
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
    segmentIndex: null,
    stream: "",
    params: {
      ...params,
      changes: params.changes.map((change) => ({ ...readObject(change) }))
    },
    payloadField: null,
    payloadEncoding: "text",
    mergeMode: "replace",
    chunks: [],
    capReached: false,
    timeout: null
  };
}

/**
 * Creates a replace-only pending snapshot for the aggregated turn diff.
 *
 * @param notification Incoming Codex notification.
 * @param sourceId Source that produced the notification.
 * @param params Notification parameters.
 *
 * @returns Pending turn diff, or `null` when identifiers are missing.
 */
function createTurnDiffPendingNotification(
  notification: CodexNotification,
  sourceId: string,
  params: Record<string, unknown>
): PendingStreamingNotification | null {
  const threadId = readString(params.threadId);
  const turnId = readString(params.turnId);

  if (threadId.length === 0 || turnId.length === 0) {
    return null;
  }

  return {
    sourceId,
    threadId,
    turnId,
    itemId: "",
    processKey: "",
    method: notification.method,
    segmentIndex: null,
    stream: "",
    params: { ...params },
    payloadField: "diff",
    payloadEncoding: "text",
    mergeMode: "replace",
    chunks: [readString(params.diff)],
    capReached: false,
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
export function createPendingNotificationKey(
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
 * Checks whether a notification carries a supported high-frequency payload.
 *
 * @param method Codex notification method.
 *
 * @returns `true` for supported high-frequency notification methods.
 */
export function isBatchableNotification(method: string): boolean {
  return method === "item/reasoning/summaryTextDelta" ||
    method === "item/reasoning/textDelta" ||
    method === "item/commandExecution/outputDelta" ||
    method === "item/fileChange/outputDelta" ||
    method === "item/fileChange/patchUpdated" ||
    method === "item/mcpToolCall/progress" ||
    method === "process/outputDelta" ||
    method === "command/exec/outputDelta" ||
    method === "turn/diff/updated";
}

/**
 * Checks whether two pending notifications belong to one ordered stream owner.
 *
 * @param first Existing pending notification.
 * @param second Incoming pending notification.
 *
 * @returns `true` when switching keys must flush the existing notification.
 */
export function hasSameLogicalOwner(
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
export function buildBatchedParams(
  pendingNotification: PendingStreamingNotification
): Record<string, unknown> {
  const params: Record<string, unknown> = { ...pendingNotification.params };

  if (pendingNotification.payloadField !== null) {
    params[pendingNotification.payloadField] = combineChunks(pendingNotification);
  }

  if (pendingNotification.payloadEncoding === "base64") {
    params.capReached = pendingNotification.capReached;
  }

  return params;
}
