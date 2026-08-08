/**
 * Reads and normalizes primitive values used by collaboration mapping.
 */
import type {
  OpenCodexCollaborationAction,
  OpenCodexCollaborationEvidence,
  OpenCodexCollaborationStatus,
  OpenCodexForkTurns
} from "@open-codex-ui/opencodex-protocol";

import type { CollaborationNormalizationContext } from "./collaboration.js";
import { readNullableString, readObject, readString } from "./primitives.js";

/**
 * Parsed plaintext envelope delivered through an inter-agent message.
 */
export type ParsedInterAgentEnvelope = {
  kind: "message" | "result";
  taskName: string | null;
  payload: string;
};

/**
 * Maps canonical V1 tool names to domain actions.
 */
export function readCanonicalAction(value: string): OpenCodexCollaborationAction | null {
  const actions: Record<string, OpenCodexCollaborationAction> = {
    spawnAgent: "spawn",
    sendInput: "message",
    resumeAgent: "resume",
    wait: "wait",
    closeAgent: "close"
  };

  return actions[value] ?? null;
}

/**
 * Maps V2 collaboration function names to domain actions.
 */
export function readV2Action(value: string): OpenCodexCollaborationAction | null {
  const actions: Record<string, OpenCodexCollaborationAction> = {
    spawn_agent: "spawn",
    send_message: "message",
    followup_task: "followup",
    interrupt_agent: "interrupt",
    wait_agent: "wait"
  };

  return actions[value] ?? null;
}

/**
 * Maps activity kinds to the least ambiguous domain action available.
 */
export function readSubAgentActivityAction(value: string): OpenCodexCollaborationAction | null {
  const actions: Record<string, OpenCodexCollaborationAction> = {
    started: "spawn",
    interacted: "message",
    interrupted: "interrupt"
  };

  return actions[value] ?? null;
}

/**
 * Reads canonical tool lifecycle status.
 */
export function readCanonicalStatus(
  value: unknown,
  lifecycle: "started" | "completed"
): OpenCodexCollaborationStatus {
  const status = readString(value);

  if (status === "completed") {
    return "completed";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "inProgress") {
    return "pending";
  }

  return lifecycle === "started" ? "pending" : "unknown";
}

/**
 * Parses plaintext JSON function arguments while ignoring encrypted fields.
 */
export function parseFunctionArguments(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || value.length === 0) {
    return {};
  }

  try {
    return readObject(JSON.parse(value));
  } catch {
    return {};
  }
}

/**
 * Reads the visible plaintext parts of an inter-agent message.
 */
export function readAgentMessageContent(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const text = value
    .map((entry) => readObject(entry))
    .filter((entry) => readString(entry.type) === "input_text")
    .map((entry) => readString(entry.text))
    .filter((entry) => entry.length > 0)
    .join("\n");

  return text.length > 0 ? text : null;
}

/**
 * Parses the stable completion envelope used for inter-agent deliveries.
 */
export function parseInterAgentEnvelope(value: string): ParsedInterAgentEnvelope | null {
  const lines = value.replaceAll("\r\n", "\n").split("\n");
  const messageType = readHeaderValue(lines, "Message Type:");

  if (messageType !== "MESSAGE" && messageType !== "FINAL_ANSWER") {
    return null;
  }

  const payloadIndex = lines.findIndex((line) => line.trim() === "Payload:");

  if (payloadIndex < 0) {
    return null;
  }

  const payload = lines.slice(payloadIndex + 1).join("\n").trim();

  return {
    kind: messageType === "FINAL_ANSWER" ? "result" : "message",
    taskName: readHeaderValue(lines, "Task name:"),
    payload
  };
}

/**
 * Normalizes the bounded parent-history selector accepted by V2.
 */
export function readForkTurns(value: unknown): OpenCodexForkTurns | null {
  if (value === "all" || value === "none") {
    return value;
  }

  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) {
    const parsedValue = Number.parseInt(value, 10);
    return Number.isSafeInteger(parsedValue) ? parsedValue : null;
  }

  return null;
}

/**
 * Reads canonical receiver status snapshots.
 */
export function readTargetAgentStatuses(value: unknown): Record<string, string> {
  const statuses: Record<string, string> = {};

  for (const [threadId, stateValue] of Object.entries(readObject(value))) {
    const status = readString(readObject(stateValue).status);

    if (threadId.length > 0 && status.length > 0) {
      statuses[threadId] = status;
    }
  }

  return statuses;
}

/**
 * Reads a string array while dropping empty and duplicate entries.
 */
export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? compactStrings(value.map((entry) => readString(entry)))
    : [];
}

/**
 * Merges string arrays while preserving first-observed order.
 */
export function mergeStrings(current: readonly string[], update: readonly string[]): string[] {
  return compactStrings([...current, ...update]);
}

/**
 * Merges evidence arrays while preserving first-observed order.
 */
export function mergeEvidence(
  current: readonly OpenCodexCollaborationEvidence[],
  update: readonly OpenCodexCollaborationEvidence[]
): OpenCodexCollaborationEvidence[] {
  return Array.from(new Set([...current, ...update]));
}

/**
 * Drops empty and duplicate strings while preserving order.
 */
export function compactStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

/**
 * Validates the source-aware minimum needed for a stable identity.
 */
export function isValidCollaborationContext(
  context: CollaborationNormalizationContext
): boolean {
  return context.sourceId.length > 0 && context.threadId.length > 0;
}

/**
 * Builds a deterministic event identifier scoped to one source and turn.
 */
export function createStableEventId(
  context: CollaborationNormalizationContext,
  externalId: string
): string {
  return [
    "collaboration",
    context.sourceId,
    context.threadId,
    readNullableString(context.turnId) ?? "-",
    externalId
  ].map(encodeURIComponent).join(":");
}

/**
 * Produces a deterministic FNV-1a hash for response items without an ID.
 */
export function stableHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Reads one case-sensitive header value from an inter-agent envelope.
 */
function readHeaderValue(lines: readonly string[], prefix: string): string | null {
  const line = lines.find((candidate) => candidate.startsWith(prefix));

  if (line === undefined) {
    return null;
  }

  const value = line.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}
