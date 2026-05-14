/**
 * Applies rich live Codex notifications to the raw turn cache.
 */
import type { CodexNotification } from "@open-codex-ui/codex-rpc";

import type { ThreadTurnCache, ThreadTurnCacheEntry } from "../ThreadTurnCache.js";
import { readObject, readString } from "../mapping.js";
import {
  readCommandArray,
  readFunctionCallCommand,
  readReasoningDeltaText,
  readReasoningSegments
} from "../mapping/activitySummary.js";
import { createId } from "./turnInput.js";

export type LiveTurnMutation = {
  entry: ThreadTurnCacheEntry;
  turn: unknown;
};

/**
 * Applies a live Codex notification to the raw turn cache.
 *
 * @param threadTurnCache Raw turn cache.
 * @param notification Codex notification.
 *
 * @returns Updated cache entry and turn, or `null` when nothing was recorded.
 */
export function recordLiveNotification(
  threadTurnCache: ThreadTurnCache,
  notification: CodexNotification
): LiveTurnMutation | null {
  const params = readObject(notification.params);
  const threadId = readString(params.threadId);
  const turnId = readString(params.turnId) || readString(readObject(params.turn).id);

  if (threadId.length === 0) {
    return null;
  }

  if (notification.method === "turn/started" || notification.method === "turn/completed") {
    return threadTurnCache.recordLiveTurn(threadId, readObject(params.turn));
  }

  if (turnId.length === 0) {
    return null;
  }

  if (notification.method === "item/started" || notification.method === "item/completed") {
    return threadTurnCache.recordLiveItem(threadId, turnId, readObject(params.item));
  }

  if (notification.method === "item/agentMessage/delta") {
    return threadTurnCache.appendAgentMessageDelta(
      threadId,
      turnId,
      readString(params.itemId),
      readString(params.delta),
      params.phase
    );
  }

  if (notification.method === "item/reasoning/summaryTextDelta") {
    return threadTurnCache.appendReasoningDelta(
      threadId,
      turnId,
      readString(params.itemId),
      "summary",
      readReasoningDeltaText(params.delta)
    );
  }

  if (notification.method === "item/reasoning/textDelta") {
    return threadTurnCache.appendReasoningDelta(
      threadId,
      turnId,
      readString(params.itemId),
      "content",
      readReasoningDeltaText(params.delta)
    );
  }

  if (
    notification.method === "command/exec/outputDelta" ||
    notification.method === "item/commandExecution/outputDelta"
  ) {
    return threadTurnCache.appendActivityDelta(
      threadId,
      turnId,
      readString(params.itemId),
      "commandExecution",
      "aggregatedOutput",
      readString(params.delta)
    );
  }

  if (notification.method === "item/fileChange/outputDelta") {
    return threadTurnCache.appendActivityDelta(
      threadId,
      turnId,
      readString(params.itemId),
      "fileChange",
      "output",
      readString(params.delta)
    );
  }

  if (notification.method === "turn/plan/updated") {
    return threadTurnCache.recordLiveItem(threadId, turnId, createPlanTurnItem(turnId, params));
  }

  if (notification.method === "rawResponseItem/completed") {
    const item = createCachedRawResponseTurnItem(readObject(params.item));

    if (item === null) {
      return null;
    }

    return threadTurnCache.recordLiveItem(
      threadId,
      turnId,
      item
    );
  }

  return null;
}

/**
 * Decides whether a live cache mutation should be flushed to SQLite immediately.
 *
 * @param method Codex notification method.
 *
 * @returns `true` when the updated turn should be persisted.
 */
export function shouldPersistLiveNotification(method: string): boolean {
  return method === "item/started" ||
    method === "item/completed" ||
    method === "rawResponseItem/completed" ||
    method === "turn/plan/updated" ||
    method === "turn/completed";
}

function createPlanTurnItem(turnId: string, params: Record<string, unknown>): Record<string, unknown> {
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

  return {
    type: "plan",
    id: `plan-${turnId}`,
    text: [explanation, ...steps].filter((entry) => entry.length > 0).join("\n")
  };
}

function createCachedRawResponseTurnItem(item: Record<string, unknown>): Record<string, unknown> | null {
  const type = readString(item.type);

  if (type === "message") {
    return null;
  }

  if (type === "local_shell_call") {
    const action = readObject(item.action);
    return createCommandExecutionItem(
      readString(item.call_id) || createId("command"),
      readCommandArray(action.command),
      readString(action.working_directory),
      readString(item.status)
    );
  }

  if (type === "function_call") {
    const command = readFunctionCallCommand(item);

    if (command.length > 0) {
      return createCommandExecutionItem(
        readString(item.call_id) || createId("command"),
        command,
        "",
        readString(item.status)
      );
    }
  }

  if (type === "reasoning") {
    return {
      type: "reasoning",
      id: readString(item.id) || readString(item.call_id) || createId("reasoning"),
      summary: readReasoningSegments(item.summary),
      content: readReasoningSegments(item.content)
    };
  }

  return item;
}

function createCommandExecutionItem(
  id: string,
  command: string,
  cwd: string,
  status: string
): Record<string, unknown> {
  return {
    type: "commandExecution",
    id,
    command,
    cwd,
    processId: null,
    source: "agent",
    status: status === "completed" ? "completed" : "inProgress",
    commandActions: [],
    aggregatedOutput: null,
    exitCode: null,
    durationMs: null
  };
}
