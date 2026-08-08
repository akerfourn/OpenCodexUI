/**
 * Serializes normalized collaboration events at the SQLite boundary.
 */
import type {
  OpenCodexCollaborationAction,
  OpenCodexCollaborationEvent,
  OpenCodexCollaborationEvidence,
  OpenCodexCollaborationStatus,
  OpenCodexForkTurns
} from "@open-codex-ui/opencodex-protocol";

import type { CachedCollaborationEvent } from "../types.js";
import type { CollaborationEventRow } from "./rowTypes.js";

const collaborationActions = new Set<OpenCodexCollaborationAction>([
  "spawn",
  "message",
  "followup",
  "interrupt",
  "wait",
  "resume",
  "close",
  "result"
]);
const collaborationStatuses = new Set<OpenCodexCollaborationStatus>([
  "pending",
  "completed",
  "failed",
  "unknown"
]);
const collaborationEvidence = new Set<OpenCodexCollaborationEvidence>([
  "canonicalItem",
  "rawFunctionCall",
  "rawAgentMessage",
  "structuralInference"
]);

/**
 * Maps one persisted row back to its normalized event contract.
 */
export function mapCollaborationEventRow(row: CollaborationEventRow): CachedCollaborationEvent {
  return {
    id: row.id,
    sourceId: row.source_id,
    threadId: row.thread_id,
    turnId: row.turn_id,
    callId: row.call_id,
    action: parseAction(row.action),
    toolName: row.tool_name,
    senderThreadId: row.sender_thread_id,
    senderAgentPath: row.sender_agent_path,
    receiverThreadIds: parseStringArray(row.receiver_thread_ids_json),
    receiverAgentPaths: parseStringArray(row.receiver_agent_paths_json),
    prompt: row.prompt,
    result: row.result,
    taskName: row.task_name,
    model: row.model,
    reasoningEffort: row.reasoning_effort,
    agentRole: row.agent_role,
    forkTurns: parseForkTurns(row.fork_turns_json),
    status: parseStatus(row.status),
    targetAgentStatuses: parseStringRecord(row.target_agent_statuses_json),
    evidence: parseEvidence(row.evidence_json),
    firstObservedAt: row.first_observed_at,
    updatedAt: row.updated_at
  };
}

/**
 * Clones only protocol fields, excluding cache-specific metadata.
 */
export function cloneCollaborationEvent(
  event: OpenCodexCollaborationEvent
): OpenCodexCollaborationEvent {
  return {
    id: event.id,
    sourceId: event.sourceId,
    threadId: event.threadId,
    turnId: event.turnId,
    callId: event.callId,
    action: event.action,
    toolName: event.toolName,
    senderThreadId: event.senderThreadId,
    senderAgentPath: event.senderAgentPath,
    receiverThreadIds: [...event.receiverThreadIds],
    receiverAgentPaths: [...event.receiverAgentPaths],
    prompt: event.prompt,
    result: event.result,
    taskName: event.taskName,
    model: event.model,
    reasoningEffort: event.reasoningEffort,
    agentRole: event.agentRole,
    forkTurns: event.forkTurns,
    status: event.status,
    targetAgentStatuses: { ...event.targetAgentStatuses },
    evidence: [...event.evidence]
  };
}

/**
 * Serializes one event for named SQLite parameters.
 */
export function serializeCollaborationEvent(
  event: CachedCollaborationEvent
): Record<string, unknown> {
  return {
    id: event.id,
    sourceId: event.sourceId,
    threadId: event.threadId,
    turnId: event.turnId,
    callId: event.callId,
    action: event.action,
    toolName: event.toolName,
    senderThreadId: event.senderThreadId,
    senderAgentPath: event.senderAgentPath,
    receiverThreadIdsJson: JSON.stringify(event.receiverThreadIds),
    receiverAgentPathsJson: JSON.stringify(event.receiverAgentPaths),
    prompt: event.prompt,
    result: event.result,
    taskName: event.taskName,
    model: event.model,
    reasoningEffort: event.reasoningEffort,
    agentRole: event.agentRole,
    forkTurnsJson: event.forkTurns === null ? null : JSON.stringify(event.forkTurns),
    status: event.status,
    targetAgentStatusesJson: JSON.stringify(event.targetAgentStatuses),
    evidenceJson: JSON.stringify(event.evidence),
    firstObservedAt: event.firstObservedAt,
    updatedAt: event.updatedAt
  };
}

/**
 * Compares normalized event fields while ignoring cache timestamps.
 */
export function collaborationEventsEqual(
  cached: CachedCollaborationEvent,
  event: OpenCodexCollaborationEvent
): boolean {
  return JSON.stringify(cloneCollaborationEvent(cached))
    === JSON.stringify(cloneCollaborationEvent(event));
}

/**
 * Parses a persisted collaboration action and rejects corrupted rows.
 */
function parseAction(value: string): OpenCodexCollaborationAction {
  if (collaborationActions.has(value as OpenCodexCollaborationAction)) {
    return value as OpenCodexCollaborationAction;
  }

  throw new Error(`Unsupported cached collaboration action: ${value}`);
}

/**
 * Parses a persisted collaboration status and rejects corrupted rows.
 */
function parseStatus(value: string): OpenCodexCollaborationStatus {
  if (collaborationStatuses.has(value as OpenCodexCollaborationStatus)) {
    return value as OpenCodexCollaborationStatus;
  }

  throw new Error(`Unsupported cached collaboration status: ${value}`);
}

/**
 * Parses known evidence values and ignores future unsupported entries.
 */
function parseEvidence(value: string): OpenCodexCollaborationEvidence[] {
  return parseStringArray(value).filter(
    (entry): entry is OpenCodexCollaborationEvidence =>
      collaborationEvidence.has(entry as OpenCodexCollaborationEvidence)
  );
}

/**
 * Parses a JSON array of strings with a safe empty fallback.
 */
function parseStringArray(value: string): string[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/**
 * Parses a JSON object containing string values.
 */
function parseStringRecord(value: string): Record<string, string> {
  const parsed = parseJson(value);

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );
}

/**
 * Parses a persisted fork-history selector.
 */
function parseForkTurns(value: string | null): OpenCodexForkTurns | null {
  if (value === null) {
    return null;
  }

  const parsed = parseJson(value);

  if (parsed === "all" || parsed === "none") {
    return parsed;
  }

  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

/**
 * Parses JSON without allowing cache corruption to escape this boundary.
 */
function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
