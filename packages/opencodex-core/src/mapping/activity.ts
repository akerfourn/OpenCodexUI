/**
 * Maps Codex activity payloads to UI activity records.
 */
import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexActivity,
  OpenCodexLanguage,
  OpenCodexMessage,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

import { getCoreLabels } from "./labels.js";
import { createId, readObject, readString } from "./primitives.js";

/**
 * Creates a streaming activity record from a Codex notification.
 *
 * @param notification Codex notification.
 *
 * @returns Activity record, or `null` when unsupported.
 */
export function createActivityFromNotification(notification: CodexNotification): OpenCodexActivity | null {
  const params = readObject(notification.params);
  const threadId = readString(params.threadId);
  const turnId = readString(params.turnId);
  const itemId = readString(params.itemId) || createId("activity");

  if (threadId.length === 0) {
    return null;
  }

  if (notification.method === "item/reasoning/summaryTextDelta") {
    return createActivity(itemId, threadId, "reasoning", turnId, readString(params.delta));
  }

  if (notification.method === "item/reasoning/textDelta") {
    return createActivity(itemId, threadId, "reasoning", turnId, readString(params.delta));
  }

  if (notification.method === "item/mcpToolCall/progress") {
    return createActivity(itemId, threadId, "mcpToolCall", turnId, readString(params.message));
  }

  if (notification.method === "command/exec/outputDelta") {
    return createActivity(itemId, threadId, "commandExecution", turnId, readString(params.delta));
  }

  if (notification.method === "item/fileChange/outputDelta") {
    return createActivity(itemId, threadId, "fileChange", turnId, readString(params.delta));
  }

  return null;
}

/**
 * Maps a raw activity item to a structured turn item.
 *
 * @param item Raw activity item.
 * @param language Language used for labels.
 *
 * @returns UI turn item, or `null` when unsupported.
 */
export function mapActivityTurnItem(
  item: Record<string, unknown>,
  language: OpenCodexLanguage
): OpenCodexTurnItem | null {
  const type = readString(item.type);

  if (type.length === 0) {
    return null;
  }

  const summary = summarizeActivityItem(item, language);
  const details = summarizeActivityDetails(item);
  const content = summary.length > 0 ? summary : summarizeActivityFallback(type, item, language);

  return {
    id: readString(item.id) || createId("activity"),
    role: "activity",
    content,
    status: "completed",
    createdAt: null,
    kind: type,
    summary: summary.length > 0 ? summary : null,
    details: details.length > 0 ? details : null
  };
}

/**
 * Maps a raw activity item to a flattened UI message.
 *
 * @param threadId Thread identifier.
 * @param item Raw activity item.
 * @param turnId Turn identifier.
 * @param turnDurationMs Turn duration in milliseconds.
 *
 * @returns UI message, or `null` when unsupported.
 */
export function mapActivityMessage(
  threadId: string,
  item: Record<string, unknown>,
  turnId: string,
  turnDurationMs: number | null
): OpenCodexMessage | null {
  const type = readString(item.type);

  if (type.length === 0) {
    return null;
  }

  const summary = summarizeActivityItem(item, "fr");
  const details = summarizeActivityDetails(item);
  const content = summary.length > 0 ? summary : summarizeActivityFallback(type, item, "fr");

  return {
    id: readString(item.id) || createId("activity"),
    threadId,
    role: "activity",
    content,
    status: "completed",
    createdAt: null,
    turnId,
    turnDurationMs,
    itemId: readString(item.id),
    kind: type,
    summary: summary.length > 0 ? summary : null,
    details: details.length > 0 ? details : null
  };
}

/**
 * Summarizes a known activity item.
 *
 * @param item Raw activity item.
 * @param language Language used for labels.
 *
 * @returns Summary text, or an empty string.
 */
function summarizeActivityItem(item: Record<string, unknown>, language: OpenCodexLanguage): string {
  const type = readString(item.type);
  const labels = getCoreLabels(language);

  if (type === "plan") {
    return readString(item.text);
  }

  if (type === "reasoning") {
    const summary = readReasoningSegments(item.summary);

    if (summary.length > 0) {
      return summary.join("\n");
    }

    return readReasoningSegments(item.content).join("\n");
  }

  if (type === "commandExecution") {
    return `${labels.command}: ${readString(item.command)}`;
  }

  if (type === "mcpToolCall") {
    return `${labels.mcpTool}: ${readString(item.server)} / ${readString(item.tool)}`;
  }

  return "";
}

/**
 * Reads reasoning text segments from Codex summary or content payloads.
 *
 * @param value Raw reasoning segment collection.
 *
 * @returns Text segments that can be displayed in the activity block.
 */
function readReasoningSegments(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readReasoningSegment(entry))
    .filter((entry) => entry.length > 0);
}

/**
 * Reads one reasoning text segment from supported Codex payload variants.
 *
 * @param value Raw reasoning segment.
 *
 * @returns Segment text, or an empty string.
 */
function readReasoningSegment(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return readString(readObject(value).text);
}

/**
 * Creates a fallback summary for activity types without a primary summary.
 *
 * @param type Activity type.
 * @param item Raw activity item.
 * @param language Language used for labels.
 *
 * @returns Fallback summary.
 */
function summarizeActivityFallback(
  type: string,
  item: Record<string, unknown>,
  language: OpenCodexLanguage
): string {
  const labels = getCoreLabels(language);

  if (type === "fileChange") {
    return `${labels.fileChange}: ${readString(item.status) || labels.inProgress}`;
  }

  if (type === "webSearch") {
    return `${labels.webSearch}: ${readString(item.query)}`;
  }

  if (type === "imageView") {
    return `Image: ${readString(item.path)}`;
  }

  if (type === "imageGeneration") {
    return labels.imageGeneration;
  }

  if (type === "dynamicToolCall") {
    return `${labels.dynamicTool}: ${readString(item.tool)}`;
  }

  if (type === "collabAgentToolCall") {
    return `${labels.collabAgent}: ${readString(item.tool)}`;
  }

  if (type === "enteredReviewMode") {
    return labels.enteredReviewMode;
  }

  if (type === "exitedReviewMode") {
    return labels.exitedReviewMode;
  }

  if (type === "contextCompaction") {
    return labels.contextCompaction;
  }

  if (type === "hookPrompt") {
    return "Hook";
  }

  return type;
}

/**
 * Serializes raw activity details.
 *
 * @param item Raw activity item.
 *
 * @returns JSON details, or an empty string when serialization fails.
 */
function summarizeActivityDetails(item: Record<string, unknown>): string {
  try {
    return JSON.stringify(item, null, 2);
  } catch {
    return "";
  }
}

/**
 * Creates a running activity record.
 *
 * @param id Activity identifier.
 * @param threadId Thread identifier.
 * @param kind Activity kind.
 * @param turnId Turn identifier.
 * @param content Activity content.
 *
 * @returns Activity record.
 */
function createActivity(
  id: string,
  threadId: string,
  kind: string,
  turnId: string,
  content: string
): OpenCodexActivity {
  return {
    id,
    threadId,
    kind,
    title: turnId.length > 0 ? turnId : undefined,
    content,
    status: "running"
  };
}
