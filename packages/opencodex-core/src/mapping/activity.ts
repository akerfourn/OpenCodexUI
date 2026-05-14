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

import {
  readActivityItemId,
  readCommandArray,
  readFunctionCallCommand,
  readReasoningDeltaText,
  readReasoningSegments,
  summarizeActivityDetails,
  summarizeActivityFallback,
  summarizeActivityItem,
  summarizeRawResponseItem
} from "./activitySummary.js";
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
    return createActivity(
      itemId,
      threadId,
      "reasoning",
      turnId,
      readReasoningDeltaText(params.delta)
    );
  }

  if (notification.method === "item/reasoning/textDelta") {
    return createActivity(
      itemId,
      threadId,
      "reasoning",
      turnId,
      readReasoningDeltaText(params.delta)
    );
  }

  if (notification.method === "item/mcpToolCall/progress") {
    return createActivity(itemId, threadId, "mcpToolCall", turnId, readString(params.message));
  }

  if (
    notification.method === "command/exec/outputDelta" ||
    notification.method === "item/commandExecution/outputDelta"
  ) {
    return createActivity(itemId, threadId, "commandExecution", turnId, readString(params.delta));
  }

  if (notification.method === "item/fileChange/outputDelta") {
    return createActivity(itemId, threadId, "fileChange", turnId, readString(params.delta));
  }

  if (notification.method === "item/fileChange/patchUpdated") {
    return createActivity(itemId, threadId, "fileChange", turnId, "patch updated");
  }

  if (notification.method === "item/commandExecution/terminalInteraction") {
    return createActivity(itemId, threadId, "commandExecution", turnId, readString(params.message));
  }

  if (notification.method === "turn/plan/updated") {
    return createActivity(
      createId("plan"),
      threadId,
      "plan",
      turnId,
      summarizePlanNotification(params)
    );
  }

  if (notification.method === "turn/diff/updated") {
    return createActivity(createId("diff"), threadId, "fileChange", turnId, readString(params.diff));
  }

  if (notification.method === "hook/started" || notification.method === "hook/completed") {
    return createHookActivity(notification.method, params, threadId, turnId);
  }

  if (notification.method === "item/started") {
    return createThreadItemActivity(readObject(params.item), threadId, turnId, "running");
  }

  if (notification.method === "item/completed") {
    return createThreadItemActivity(readObject(params.item), threadId, turnId, "completed");
  }

  if (notification.method === "rawResponseItem/completed") {
    return createRawResponseItemActivity(readObject(params.item), threadId, turnId);
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

  if (type === "reasoning" && summary.length === 0) {
    return null;
  }

  const details = summarizeActivityDetails(item);
  const content = summary.length > 0 ? summary : summarizeActivityFallback(type, item, language);
  const itemId = readActivityItemId(item);

  return {
    id: itemId,
    role: "activity",
    content,
    status: "completed",
    createdAt: null,
    kind: resolveActivityKind(type),
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

  if (type === "reasoning" && summary.length === 0) {
    return null;
  }

  const details = summarizeActivityDetails(item);
  const content = summary.length > 0 ? summary : summarizeActivityFallback(type, item, "fr");
  const itemId = readActivityItemId(item);

  return {
    id: itemId,
    threadId,
    role: "activity",
    content,
    status: "completed",
    createdAt: null,
    turnId,
    turnDurationMs,
    itemId,
    kind: resolveActivityKind(type),
    summary: summary.length > 0 ? summary : null,
    details: details.length > 0 ? details : null
  };
}

/**
 * Creates an activity from a streamed structured thread item.
 *
 * @param item Raw thread item.
 * @param threadId Thread identifier.
 * @param turnId Turn identifier.
 * @param status Activity status.
 *
 * @returns Activity record, or `null` when the item is a chat message.
 */
function createThreadItemActivity(
  item: Record<string, unknown>,
  threadId: string,
  turnId: string,
  status: OpenCodexActivity["status"]
): OpenCodexActivity | null {
  const type = readString(item.type);

  if (type === "userMessage" || type === "agentMessage") {
    return null;
  }

  const mappedItem = mapActivityTurnItem(item, "fr");

  if (mappedItem === null) {
    return createActivity(
      readString(item.id) || createId("activity"),
      threadId,
      type.length > 0 ? type : "unknown",
      turnId,
      summarizeActivityDetails(item),
      status
    );
  }

  return createActivity(
    mappedItem.id,
    threadId,
    mappedItem.kind ?? type,
    turnId,
    mappedItem.content,
    status,
    mappedItem.summary,
    mappedItem.details
  );
}

/**
 * Creates an activity from raw Responses API item notifications.
 *
 * @param item Raw response item.
 * @param threadId Thread identifier.
 * @param turnId Turn identifier.
 *
 * @returns Activity record, or `null` for normal assistant messages.
 */
function createRawResponseItemActivity(
  item: Record<string, unknown>,
  threadId: string,
  turnId: string
): OpenCodexActivity | null {
  const type = readString(item.type);

  if (type === "message") {
    return null;
  }

  if (type === "local_shell_call" || type === "function_call") {
    const action = readObject(item.action);
    const command = type === "local_shell_call"
      ? readCommandArray(action.command)
      : readFunctionCallCommand(item);

    return createActivity(
      readString(item.call_id) || createId("command"),
      threadId,
      readString(item.name) === "shell_command" || type === "local_shell_call"
        ? "commandExecution"
        : "dynamicToolCall",
      turnId,
      command.length > 0 ? command : summarizeRawResponseItem(item),
      readString(item.status) === "completed" ? "completed" : "running",
      command.length > 0 ? command : null,
      summarizeActivityDetails(item)
    );
  }

  if (type === "reasoning") {
    const content = readReasoningSegments(item.summary).join("\n")
      || readReasoningSegments(item.content).join("\n");

    return createActivity(
      createId("reasoning"),
      threadId,
      "reasoning",
      turnId,
      content,
      "completed",
      content.length > 0 ? content : null,
      summarizeActivityDetails(item)
    );
  }

  return createActivity(
    readString(item.call_id) || createId("raw"),
    threadId,
    type.length > 0 ? type : "rawResponseItem",
    turnId,
    summarizeRawResponseItem(item),
    "completed",
    null,
    summarizeActivityDetails(item)
  );
}

/**
 * Summarizes a plan update notification.
 *
 * @param params Notification parameters.
 *
 * @returns Plan summary.
 */
function summarizePlanNotification(params: Record<string, unknown>): string {
  const explanation = readString(params.explanation);
  const plan = Array.isArray(params.plan) ? params.plan : [];
  const steps = plan
    .map((entry) => readObject(entry))
    .map((entry) => {
      const status = readString(entry.status);
      const step = readString(entry.step);
      return status.length > 0 ? `${status}: ${step}` : step;
    })
    .filter((entry) => entry.length > 0);

  return [explanation, ...steps].filter((entry) => entry.length > 0).join("\n");
}

/**
 * Creates an activity from hook lifecycle notifications.
 *
 * @param method Notification method.
 * @param params Notification parameters.
 * @param threadId Thread identifier.
 * @param fallbackTurnId Turn identifier read from the common params.
 *
 * @returns Hook activity.
 */
function createHookActivity(
  method: string,
  params: Record<string, unknown>,
  threadId: string,
  fallbackTurnId: string
): OpenCodexActivity {
  const run = readObject(params.run);
  const turnId = readString(params.turnId) || fallbackTurnId;
  const eventName = readString(run.eventName);
  const sourcePath = readString(run.sourcePath);
  const status = method === "hook/completed" ? "completed" : "running";
  const content = [
    "Hook",
    eventName,
    sourcePath
  ].filter((entry) => entry.length > 0).join(": ");

  return createActivity(
    readString(run.id) || createId("hook"),
    threadId,
    "hookPrompt",
    turnId,
    content,
    status,
    content,
    summarizeActivityDetails(run)
  );
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
  content: string,
  status: OpenCodexActivity["status"] = "running",
  summary?: string | null,
  details?: string | null
): OpenCodexActivity {
  return {
    id,
    threadId,
    kind,
    title: turnId.length > 0 ? turnId : undefined,
    content,
    summary,
    details,
    status
  };
}

function resolveActivityKind(type: string): string {
  return type;
}
