/**
 * Provides hashing, cloning, and metadata helpers for turn diagnostics.
 */
import { createHash } from "node:crypto";

import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexThreadEventLogValue,
  OpenCodexTurnDiagnostic,
  OpenCodexTurnDiagnosticInput,
  OpenCodexTurnDiagnosticRequest
} from "@open-codex-ui/opencodex-protocol";

import { readObject, readString } from "../../mapping.js";

const COALESCED_EVENT_SUFFIXES = ["Delta", "/delta"];

/** Creates scalar metadata describing the captured request. */
export function createRequestDetails(
  request: OpenCodexTurnDiagnosticRequest
): Record<string, OpenCodexThreadEventLogValue> {
  return {
    rpcMethod: request.rpcMethod,
    inputTextLength: request.text.length,
    inputTextHash: request.textHash,
    inputElementCount: request.input.length,
    model: request.model,
    reasoningEffort: request.reasoningEffort,
    serviceTier: request.serviceTier,
    resumedExistingThread: request.resumedExistingThread
  };
}

/** Adds safe hashes and lengths to raw notification metadata. */
export function addNotificationDetails(
  notification: CodexNotification,
  details: Record<string, OpenCodexThreadEventLogValue>
): Record<string, OpenCodexThreadEventLogValue> {
  const next = { ...details };

  if (notification.method === "item/agentMessage/delta") {
    const delta = readString(readObject(notification.params).delta);
    next.deltaHash = hashText(delta);
  }

  return next;
}

/** Adds content-free comparisons to normalized backend event metadata. */
export function addBackendEventDetails(
  event: OpenCodexEvent,
  details: Record<string, OpenCodexThreadEventLogValue>
): Record<string, OpenCodexThreadEventLogValue> {
  const next = { ...details };

  if (event.type === "message.started") {
    next.messageTextLength = event.message.content.length;
    next.messageTextHash = hashText(event.message.content);
  }

  if (event.type === "message.delta") {
    next.deltaHash = hashText(event.delta);
  }

  return next;
}

/** Returns whether a thread-level signal can be attached to an active trace. */
export function isThreadLevelDiagnosticEvent(eventName: string): boolean {
  return eventName === "thread/status/changed" ||
    eventName === "thread/tokenUsage/updated" ||
    eventName === "error";
}

/** Returns whether adjacent events should be represented as one aggregate. */
export function isCoalescibleEvent(eventName: string): boolean {
  return COALESCED_EVENT_SUFFIXES.some((suffix) => eventName.endsWith(suffix)) ||
    eventName === "message.delta";
}

/** Merges aggregate counters while retaining the latest metadata values. */
export function mergeDetails(
  previous: Record<string, OpenCodexThreadEventLogValue>,
  incoming: Record<string, OpenCodexThreadEventLogValue>
): Record<string, OpenCodexThreadEventLogValue> {
  const merged = { ...previous, ...incoming };

  for (const key of ["deltaLength", "messageTextLength"]) {
    const previousValue = previous[key];
    const incomingValue = incoming[key];

    if (typeof previousValue === "number" && typeof incomingValue === "number") {
      merged[key] = previousValue + incomingValue;
    }
  }

  return merged;
}

/** Adds one message identifier once. */
export function addMessageId(diagnostic: OpenCodexTurnDiagnostic, messageId: string): void {
  if (messageId.length > 0 && !diagnostic.response.assistantMessageIds.includes(messageId)) {
    diagnostic.response.assistantMessageIds.push(messageId);
  }
}

/** Adds an anomaly code once. */
export function addAnomaly(diagnostic: OpenCodexTurnDiagnostic, anomaly: string): void {
  if (!diagnostic.anomalies.includes(anomaly)) {
    diagnostic.anomalies.push(anomaly);
  }
}

/** Creates an empty output summary. */
export function createEmptyResponse(): OpenCodexTurnDiagnostic["response"] {
  return {
    assistantMessageIds: [],
    outputDeltaCount: 0,
    outputLength: 0,
    outputHash: null
  };
}

/** Classifies a Codex turn status for the dedicated diagnostic view. */
export function classifyTurnStatus(status: string): OpenCodexTurnDiagnostic["status"] {
  const normalized = status.toLowerCase();

  if (
    normalized.includes("fail") ||
    normalized.includes("error") ||
    normalized.includes("interrupt") ||
    normalized.includes("cancel")
  ) {
    return "failed";
  }

  return "completed";
}

/** Hashes content without retaining it in the diagnostic trace. */
export function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

/** Clones one diagnostic input element before crossing the transport boundary. */
export function cloneDiagnosticInput(
  input: OpenCodexTurnDiagnosticInput
): OpenCodexTurnDiagnosticInput {
  return { ...input };
}

/** Clones the diagnostic DTO while leaving internal hashers private. */
export function cloneDiagnostic(
  diagnostic: OpenCodexTurnDiagnostic
): OpenCodexTurnDiagnostic {
  return {
    ...diagnostic,
    requests: diagnostic.requests.map((request) => ({
      ...request,
      input: request.input.map(cloneDiagnosticInput),
      response: { ...request.response }
    })),
    response: {
      ...diagnostic.response,
      assistantMessageIds: [...diagnostic.response.assistantMessageIds]
    },
    events: diagnostic.events.map((event) => ({
      ...event,
      details: { ...event.details }
    })),
    anomalies: [...diagnostic.anomalies]
  };
}

/** Bounds free-form error text retained in the in-memory trace. */
export function truncate(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 400 ? `${normalized.slice(0, 397)}...` : normalized;
}

/** Normalizes a positive bounded collection limit. */
export function normalizeLimit(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

/** Builds the source-aware key used by the diagnostic ring buffers. */
export function createThreadKey(sourceId: string | null, threadId: string): string {
  return `${sourceId ?? "orphan"}:${threadId}`;
}
