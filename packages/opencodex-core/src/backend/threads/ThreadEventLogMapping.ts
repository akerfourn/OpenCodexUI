/**
 * Maps Codex notifications and backend events to safe thread event metadata.
 */
import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexThreadEventLogValue
} from "@open-codex-ui/opencodex-protocol";

import { readObject, readString } from "../../mapping.js";

export type EventLogTarget = {
  sourceId: string | null;
  threadId: string;
  turnId: string | null;
  itemId: string | null;
  details: Record<string, OpenCodexThreadEventLogValue>;
};

/**
 * Maps one raw notification to a thread target without retaining its payload.
 *
 * @param notification Raw Codex notification.
 * @param sourceId Source that produced the notification.
 * @returns Thread target, or `null` when the notification is not thread-scoped.
 */
export function readNotificationTarget(
  notification: CodexNotification,
  sourceId: string
): EventLogTarget | null {
  const params = readObject(notification.params);
  const threadId = readString(params.threadId);

  if (threadId.length === 0) {
    return null;
  }

  const turn = readObject(params.turn);
  const item = readObject(params.item);

  return {
    sourceId,
    threadId,
    turnId: readNonEmptyString(params.turnId) ?? readNonEmptyString(turn.id),
    itemId: readNonEmptyString(params.itemId) ?? readNonEmptyString(item.id),
    details: createNotificationDetails(notification.method, params, turn, item)
  };
}

/**
 * Maps a backend event to its safe thread metadata.
 *
 * @param event Backend event.
 * @returns Thread target, or `null` for unrelated events.
 */
export function readBackendEventTarget(event: OpenCodexEvent): EventLogTarget | null {
  switch (event.type) {
    case "thread.opened":
    case "thread.created":
      return {
        sourceId: event.thread.sourceId,
        threadId: event.thread.id,
        turnId: null,
        itemId: null,
        details: { turnCount: event.turns.length }
      };
    case "thread.discovered":
    case "thread.metadata.updated":
      return createTarget(event.thread.sourceId, event.thread.id, null, null);
    case "collaboration.updated":
      return createTarget(
        event.sourceId,
        event.event.threadId,
        event.event.turnId,
        event.event.callId,
        {
          action: event.event.action,
          status: event.event.status,
          receiverCount: event.event.receiverThreadIds.length
        }
      );
    case "thread.turns.prepended":
    case "thread.turns.synced":
      return createTarget(event.sourceId ?? null, event.threadId, null, null, {
        turnCount: event.turns.length,
        hasMoreOlderMessages: event.hasMoreOlderMessages
      });
    case "thread.sync.started":
    case "thread.sync.completed":
    case "thread.recovery.started":
    case "thread.recovery.completed":
    case "thread.renamed":
    case "thread.deleted":
      return createTarget(event.sourceId ?? null, event.threadId, null, null);
    case "thread.goal.updated":
      return createTarget(event.sourceId ?? null, event.threadId, null, null, {
        status: event.goal.status,
        tokenBudget: event.goal.tokenBudget,
        tokensUsed: event.goal.tokensUsed
      });
    case "thread.goal.cleared":
      return createTarget(event.sourceId ?? null, event.threadId, null, null);
    case "thread.tokenUsage.updated":
      return createTarget(event.sourceId ?? null, event.usage.threadId, event.usage.turnId, null, {
        totalTokens: event.usage.total.totalTokens,
        usedPercent: event.usage.usedPercent
      });
    case "message.started":
      return createTarget(event.sourceId ?? null, event.threadId, event.message.turnId ?? null, event.message.id, {
        phase: event.message.phase ?? null
      });
    case "message.delta":
      return createTarget(event.sourceId ?? null, event.threadId, event.turnId, event.messageId, {
        deltaLength: event.delta.length,
        phase: event.phase ?? null
      });
    case "message.completed":
      return createTarget(event.sourceId ?? null, event.threadId, null, event.messageId);
    case "activity.started":
    case "activity.updated":
      return createTarget(event.sourceId ?? null, event.threadId, null, event.activity.id, {
        activityKind: event.activity.kind,
        activityStatus: event.activity.status
      });
    case "activity.completed":
      return createTarget(event.sourceId ?? null, event.threadId, null, event.activityId);
    case "turn.started":
      return createTarget(event.sourceId ?? null, event.threadId, event.turnId, null);
    case "turn.completed":
      return createTarget(event.sourceId ?? null, event.threadId, event.turnId, null, {
        durationMs: event.durationMs
      });
    case "approval.requested":
      if (event.approval.threadId === undefined) {
        return null;
      }

      return createTarget(event.approval.sourceId ?? null, event.approval.threadId, null, null, {
        approvalKind: event.approval.kind
      });
    case "error":
      if (event.threadId === undefined) {
        return null;
      }

      return createTarget(event.sourceId ?? null, event.threadId, null, null, {
        recoverable: event.recoverable ?? false
      });
    default:
      return null;
  }
}

/**
 * Creates a target while filtering absent optional metadata.
 *
 * @param sourceId Source identifier.
 * @param threadId Thread identifier.
 * @param turnId Turn identifier.
 * @param itemId Item identifier.
 * @param details Additional safe metadata.
 * @returns Event target.
 */
function createTarget(
  sourceId: string | null,
  threadId: string,
  turnId: string | null,
  itemId: string | null,
  details: Record<string, OpenCodexThreadEventLogValue> = {}
): EventLogTarget {
  return { sourceId, threadId, turnId, itemId, details };
}

/**
 * Extracts safe metadata from one raw notification without retaining content.
 *
 * @param method Notification method.
 * @param params Notification parameters.
 * @param turn Turn payload, when present.
 * @param item Item payload, when present.
 * @returns Scalar metadata.
 */
function createNotificationDetails(
  method: string,
  params: Record<string, unknown>,
  turn: Record<string, unknown>,
  item: Record<string, unknown>
): Record<string, OpenCodexThreadEventLogValue> {
  const details: Record<string, OpenCodexThreadEventLogValue> = {
    parameterKeys: Object.keys(params).sort().join(", ")
  };
  const itemType = readNonEmptyString(item.type);
  const itemStatus = readNonEmptyString(item.status);

  addString(details, "itemType", itemType);
  addString(details, "itemStatus", itemStatus);
  addCollaborationItemDetails(details, itemType, item);

  if (method === "turn/completed" || method === "turn/started") {
    addString(details, "turnStatus", readNonEmptyString(turn.status));
    addString(details, "itemsView", readNonEmptyString(turn.itemsView));
    addNumber(details, "turnItemCount", Array.isArray(turn.items) ? turn.items.length : null);
    addNumber(details, "durationMs", readNumber(turn.durationMs));
    addNumber(details, "completedAt", readNumber(turn.completedAt));
    addErrorDetails(details, turn.error);
  }

  if (method === "error") {
    addBoolean(details, "willRetry", params.willRetry === true ? true : null);
    addErrorDetails(details, params.error);
  }

  if (method === "thread/status/changed") {
    const status = readObject(params.status);
    addString(details, "status", readNonEmptyString(status.type));
    addStringArray(details, "activeFlags", status.activeFlags);
  }

  if (isDeltaNotification(method)) {
    addNumber(details, "deltaLength", readString(params.delta).length);
    addString(details, "phase", readNonEmptyString(params.phase));
  }

  if (method === "turn/plan/updated") {
    addNumber(details, "planStepCount", Array.isArray(params.plan) ? params.plan.length : null);
  }

  if (method === "turn/diff/updated") {
    addNumber(details, "diffLength", readString(params.diff).length);
  }

  if (method === "model/rerouted") {
    addString(details, "fromModel", readNonEmptyString(params.fromModel));
    addString(details, "toModel", readNonEmptyString(params.toModel));
    addString(details, "reason", readNonEmptyString(params.reason));
  }

  if (method === "model/verification") {
    addNumber(details, "verificationCount", Array.isArray(params.verifications) ? params.verifications.length : null);
  }

  if (method === "model/safetyBuffering/updated") {
    addString(details, "model", readNonEmptyString(params.model));
    addBoolean(details, "showBufferingUi", params.showBufferingUi === true ? true : null);
    addString(details, "fasterModel", readNonEmptyString(params.fasterModel));
    addNumber(details, "reasonCount", Array.isArray(params.reasons) ? params.reasons.length : null);
  }

  if (method === "hook/started" || method === "hook/completed") {
    const run = readObject(params.run);
    addString(details, "hookId", readNonEmptyString(run.id));
    addString(details, "hookEvent", readNonEmptyString(run.eventName));
    addString(details, "hookStatus", readNonEmptyString(run.status));
  }

  return details;
}

/**
 * Adds content-free collaboration metadata for known and future item variants.
 *
 * @param details Metadata target.
 * @param itemType App Server item discriminator.
 * @param item Raw item payload.
 */
function addCollaborationItemDetails(
  details: Record<string, OpenCodexThreadEventLogValue>,
  itemType: string | null,
  item: Record<string, unknown>
): void {
  if (itemType === "collabAgentToolCall") {
    addString(details, "collaborationTool", readNonEmptyString(item.tool));
    addNumber(
      details,
      "receiverCount",
      Array.isArray(item.receiverThreadIds) ? item.receiverThreadIds.length : null
    );
    return;
  }

  if (itemType === "subAgentActivity") {
    addString(details, "collaborationActivity", readNonEmptyString(item.kind));
    addBoolean(details, "hasAgentThreadId", readNonEmptyString(item.agentThreadId) !== null);
    return;
  }

  if (itemType === "function_call") {
    addString(details, "functionNamespace", readNonEmptyString(item.namespace));
    addString(details, "functionName", readNonEmptyString(item.name));
    addBoolean(details, "hasArguments", readNonEmptyString(item.arguments) !== null);
    return;
  }

  if (itemType === "agent_message") {
    addBoolean(details, "hasAuthor", readNonEmptyString(item.author) !== null);
    addBoolean(details, "hasRecipient", readNonEmptyString(item.recipient) !== null);
  }
}

/**
 * Checks whether a notification contains high-frequency text or output data.
 *
 * @param method Notification method.
 * @returns Whether the notification should only be coalesced in the trace.
 */
function isDeltaNotification(method: string): boolean {
  return method.endsWith("Delta") || method.endsWith("/delta") || method === "item/fileChange/patchUpdated";
}

/**
 * Adds an error summary while omitting the original structured payload.
 *
 * @param details Metadata target.
 * @param value Raw error object.
 */
function addErrorDetails(
  details: Record<string, OpenCodexThreadEventLogValue>,
  value: unknown
): void {
  const error = readObject(value);
  const message = readNonEmptyString(error.message);

  addString(details, "errorMessage", message === null ? null : truncateMetadata(message));
  addString(details, "errorCode", readNonEmptyString(readObject(error.codexErrorInfo).code));
}

/**
 * Adds a non-empty string metadata field.
 *
 * @param details Metadata target.
 * @param key Field name.
 * @param value Field value.
 */
function addString(
  details: Record<string, OpenCodexThreadEventLogValue>,
  key: string,
  value: string | null
): void {
  if (value !== null && value.length > 0) {
    details[key] = value;
  }
}

/**
 * Adds an optional numeric metadata field.
 *
 * @param details Metadata target.
 * @param key Field name.
 * @param value Field value.
 */
function addNumber(
  details: Record<string, OpenCodexThreadEventLogValue>,
  key: string,
  value: number | null
): void {
  if (value !== null) {
    details[key] = value;
  }
}

/**
 * Adds an optional boolean metadata field.
 *
 * @param details Metadata target.
 * @param key Field name.
 * @param value Field value.
 */
function addBoolean(
  details: Record<string, OpenCodexThreadEventLogValue>,
  key: string,
  value: boolean | null
): void {
  if (value !== null) {
    details[key] = value;
  }
}

/**
 * Adds a string-array field as a compact comma-separated metadata value.
 *
 * @param details Metadata target.
 * @param key Field name.
 * @param value Unknown array payload.
 */
function addStringArray(
  details: Record<string, OpenCodexThreadEventLogValue>,
  key: string,
  value: unknown
): void {
  if (!Array.isArray(value)) {
    return;
  }

  const values = value.map(readString).filter((entry) => entry.length > 0);

  if (values.length > 0) {
    details[key] = values.join(", ");
  }
}

/**
 * Reads a non-empty string from an unknown value.
 *
 * @param value Unknown value.
 * @returns String or `null`.
 */
function readNonEmptyString(value: unknown): string | null {
  const stringValue = readString(value);
  return stringValue.length > 0 ? stringValue : null;
}

/**
 * Reads a finite number from an unknown value.
 *
 * @param value Unknown value.
 * @returns Number or `null`.
 */
function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Truncates free-form diagnostic messages before retaining them as metadata.
 *
 * @param value Diagnostic message.
 * @returns Bounded single-line message.
 */
function truncateMetadata(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}
