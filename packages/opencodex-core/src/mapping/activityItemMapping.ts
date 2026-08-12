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
  readReasoningSegments,
  summarizeActivityDetails,
  summarizeActivityFallback,
  summarizeActivityItem,
  summarizeRawResponseItem
} from "./activitySummary.js";
import { readV2Action } from "./collaborationReaders.js";
import { createActivity, readPlanSnapshot } from "./activityHelpers.js";
import { createId, readObject, readString } from "./primitives.js";

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
  const plan = type === "plan" ? readPlanSnapshot(item) : null;

  return {
    id: itemId,
    role: "activity",
    content,
    status: "completed",
    createdAt: null,
    kind: resolveActivityKind(type),
    summary: summary.length > 0 ? summary : null,
    details: details.length > 0 ? details : null,
    plan
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
  const plan = type === "plan" ? readPlanSnapshot(item) : null;

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
    details: details.length > 0 ? details : null,
    plan
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
export function createThreadItemActivity(
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
export function createRawResponseItemActivity(
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
    const functionName = readString(item.name);
    const functionNamespace = readString(item.namespace);
    const command = type === "local_shell_call"
      ? readCommandArray(action.command)
      : readFunctionCallCommand(item);
    const isCollaborationCall = type === "function_call" && (
      functionNamespace === "collaboration"
      || (functionNamespace.length === 0 && readV2Action(functionName) !== null)
    );
    const activityKind = resolveRawFunctionActivityKind(
      type,
      functionName,
      isCollaborationCall
    );

    return createActivity(
      readString(item.call_id) || createId("command"),
      threadId,
      activityKind,
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

/** Resolves a semantic UI kind for raw shell, collaboration, and dynamic calls. */
function resolveRawFunctionActivityKind(
  responseItemType: string,
  functionName: string,
  isCollaborationCall: boolean
): string {
  if (isCollaborationCall) {
    return "subAgentActivity";
  }

  if (responseItemType === "local_shell_call" || functionName === "shell_command") {
    return "commandExecution";
  }

  return "dynamicToolCall";
}

/**
 * Resolves a raw activity type to the protocol kind.
 *
 * @param type Raw activity type.
 * @returns Activity kind.
 */
function resolveActivityKind(type: string): string {
  return type;
}
