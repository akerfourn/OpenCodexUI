/**
 * Normalizes Codex V1 and V2 collaboration payloads into shared events.
 */
import type {
  OpenCodexCollaborationAction,
  OpenCodexCollaborationEvent,
  OpenCodexCollaborationStatus
} from "@open-codex-ui/opencodex-protocol";

import {
  compactStrings,
  createStableEventId,
  isValidCollaborationContext,
  mergeEvidence,
  mergeStrings,
  parseFunctionArguments,
  parseInterAgentEnvelope,
  readAgentMessageContent,
  readCanonicalAction,
  readCanonicalStatus,
  readForkTurns,
  readStringArray,
  readSubAgentActivityAction,
  readTargetAgentStatuses,
  readV2Action,
  stableHash
} from "./collaborationReaders.js";
import { readNullableString, readObject, readString } from "./primitives.js";

/**
 * Source-aware location of one App Server item being normalized.
 */
export type CollaborationNormalizationContext = {
  sourceId: string;
  threadId: string;
  turnId?: string | null;
};

/**
 * Lifecycle stage attached to a canonical thread item notification.
 */
export type CollaborationItemLifecycle = "started" | "completed";

/**
 * Normalizes a canonical collaboration-related `ThreadItem`.
 *
 * @param value Raw App Server thread item.
 * @param context Source, thread, and turn that observed the item.
 * @param lifecycle Started or completed item lifecycle.
 * @returns Normalized collaboration event, or `null` for unrelated items.
 */
export function normalizeCollaborationThreadItem(
  value: unknown,
  context: CollaborationNormalizationContext,
  lifecycle: CollaborationItemLifecycle = "completed"
): OpenCodexCollaborationEvent | null {
  if (!isValidCollaborationContext(context)) {
    return null;
  }

  const item = readObject(value);
  const type = readString(item.type);

  if (type === "collabAgentToolCall") {
    return normalizeCanonicalToolCall(item, context, lifecycle);
  }

  if (type === "subAgentActivity") {
    return normalizeSubAgentActivity(item, context, lifecycle);
  }

  return null;
}

/**
 * Normalizes a raw Responses API collaboration item.
 *
 * @param value Raw `ResponseItem` emitted by App Server.
 * @param context Source, thread, and turn that observed the item.
 * @returns Normalized collaboration event, or `null` for unrelated items.
 */
export function normalizeCollaborationResponseItem(
  value: unknown,
  context: CollaborationNormalizationContext
): OpenCodexCollaborationEvent | null {
  if (!isValidCollaborationContext(context)) {
    return null;
  }

  const item = readObject(value);
  const type = readString(item.type);

  if (type === "function_call") {
    return normalizeRawFunctionCall(item, context);
  }

  if (type === "agent_message") {
    return normalizeRawAgentMessage(item, context);
  }

  return null;
}

/**
 * Correlates partial events that share their source-aware stable identity.
 *
 * @param events Partial or duplicated collaboration events.
 * @returns Events in first-observed order with later evidence merged.
 */
export function correlateCollaborationEvents(
  events: readonly OpenCodexCollaborationEvent[]
): OpenCodexCollaborationEvent[] {
  const correlated = new Map<string, OpenCodexCollaborationEvent>();

  for (const event of events) {
    const existing = correlated.get(event.id);
    correlated.set(event.id, existing === undefined ? cloneEvent(event) : mergeEvents(existing, event));
  }

  return Array.from(correlated.values());
}

/**
 * Maps one V1 canonical collab tool call.
 */
function normalizeCanonicalToolCall(
  item: Record<string, unknown>,
  context: CollaborationNormalizationContext,
  lifecycle: CollaborationItemLifecycle
): OpenCodexCollaborationEvent | null {
  const callId = readString(item.id);
  const toolName = readString(item.tool);
  const action = readCanonicalAction(toolName);

  if (callId.length === 0 || action === null) {
    return null;
  }

  return createEvent(context, `call:${callId}`, {
    callId,
    action,
    toolName,
    senderThreadId: readNullableString(item.senderThreadId),
    receiverThreadIds: readStringArray(item.receiverThreadIds),
    prompt: readNullableString(item.prompt),
    model: readNullableString(item.model),
    reasoningEffort: readNullableString(item.reasoningEffort),
    status: readCanonicalStatus(item.status, lifecycle),
    targetAgentStatuses: readTargetAgentStatuses(item.agentsStates),
    evidence: ["canonicalItem"]
  });
}

/**
 * Maps a V2 sub-agent activity marker.
 */
function normalizeSubAgentActivity(
  item: Record<string, unknown>,
  context: CollaborationNormalizationContext,
  lifecycle: CollaborationItemLifecycle
): OpenCodexCollaborationEvent | null {
  const callId = readString(item.id);
  const kind = readString(item.kind);
  const action = readSubAgentActivityAction(kind);

  if (callId.length === 0 || action === null) {
    return null;
  }

  return createEvent(context, `call:${callId}`, {
    callId,
    action,
    toolName: null,
    senderThreadId: context.threadId,
    receiverThreadIds: compactStrings([readString(item.agentThreadId)]),
    receiverAgentPaths: compactStrings([readString(item.agentPath)]),
    status: lifecycle === "started" ? "pending" : "completed",
    evidence: ["canonicalItem"]
  });
}

/**
 * Maps a raw V2 collaboration function call and its arguments.
 */
function normalizeRawFunctionCall(
  item: Record<string, unknown>,
  context: CollaborationNormalizationContext
): OpenCodexCollaborationEvent | null {
  const toolName = readString(item.name);
  const namespace = readString(item.namespace);
  const action = readV2Action(toolName);
  const callId = readString(item.call_id);

  if (
    action === null
    || callId.length === 0
    || (namespace.length > 0 && namespace !== "collaboration")
  ) {
    return null;
  }

  const argumentsValue = parseFunctionArguments(item.arguments);
  const targetPath = readNullableString(argumentsValue.target);
  const prompt = readNullableString(argumentsValue.message ?? argumentsValue.prompt);
  const forkTurns = action === "spawn" && argumentsValue.fork_turns === undefined
    ? "all"
    : readForkTurns(argumentsValue.fork_turns);

  return createEvent(context, `call:${callId}`, {
    callId,
    action,
    toolName,
    senderThreadId: context.threadId,
    receiverAgentPaths: targetPath === null ? [] : [targetPath],
    prompt,
    taskName: readNullableString(argumentsValue.task_name),
    model: readNullableString(argumentsValue.model),
    reasoningEffort: readNullableString(argumentsValue.reasoning_effort),
    agentRole: readNullableString(argumentsValue.agent_type),
    forkTurns,
    status: "unknown",
    evidence: ["rawFunctionCall"]
  });
}

/**
 * Maps a raw model-visible message exchanged between agents.
 */
function normalizeRawAgentMessage(
  item: Record<string, unknown>,
  context: CollaborationNormalizationContext
): OpenCodexCollaborationEvent | null {
  const senderAgentPath = readNullableString(item.author);
  const receiverAgentPath = readNullableString(item.recipient);

  if (senderAgentPath === null && receiverAgentPath === null) {
    return null;
  }

  const readableContent = readAgentMessageContent(item.content);
  const envelope = readableContent === null ? null : parseInterAgentEnvelope(readableContent);
  const action = envelope?.kind === "result" ? "result" : "message";
  const externalId = readNullableString(item.id) ?? stableHash(JSON.stringify({
    author: senderAgentPath,
    recipient: receiverAgentPath,
    content: item.content
  }));
  const message = envelope?.payload ?? readableContent;

  return createEvent(context, `agent:${externalId}`, {
    callId: null,
    action,
    toolName: null,
    senderAgentPath,
    receiverThreadIds: receiverAgentPath === null ? [] : [context.threadId],
    receiverAgentPaths: receiverAgentPath === null ? [] : [receiverAgentPath],
    prompt: action === "message" ? message : null,
    result: action === "result" ? message : null,
    taskName: envelope?.taskName ?? null,
    status: "completed",
    evidence: ["rawAgentMessage"]
  });
}

/**
 * Creates one event with explicit defaults for unavailable evidence.
 */
function createEvent(
  context: CollaborationNormalizationContext,
  externalId: string,
  patch: Partial<OpenCodexCollaborationEvent> & Pick<
    OpenCodexCollaborationEvent,
    "action" | "status" | "evidence"
  >
): OpenCodexCollaborationEvent {
  return {
    id: createStableEventId(context, externalId),
    sourceId: context.sourceId,
    threadId: context.threadId,
    turnId: readNullableString(context.turnId),
    callId: patch.callId ?? null,
    action: patch.action,
    toolName: patch.toolName ?? null,
    senderThreadId: patch.senderThreadId ?? null,
    senderAgentPath: patch.senderAgentPath ?? null,
    receiverThreadIds: patch.receiverThreadIds ?? [],
    receiverAgentPaths: patch.receiverAgentPaths ?? [],
    prompt: patch.prompt ?? null,
    result: patch.result ?? null,
    taskName: patch.taskName ?? null,
    model: patch.model ?? null,
    reasoningEffort: patch.reasoningEffort ?? null,
    agentRole: patch.agentRole ?? null,
    forkTurns: patch.forkTurns ?? null,
    status: patch.status,
    targetAgentStatuses: patch.targetAgentStatuses ?? {},
    evidence: [...patch.evidence]
  };
}

/**
 * Merges two representations of the same logical event.
 */
function mergeEvents(
  current: OpenCodexCollaborationEvent,
  update: OpenCodexCollaborationEvent
): OpenCodexCollaborationEvent {
  return {
    ...current,
    callId: update.callId ?? current.callId,
    action: chooseAction(current, update),
    toolName: update.toolName ?? current.toolName,
    senderThreadId: update.senderThreadId ?? current.senderThreadId,
    senderAgentPath: update.senderAgentPath ?? current.senderAgentPath,
    receiverThreadIds: mergeStrings(current.receiverThreadIds, update.receiverThreadIds),
    receiverAgentPaths: mergeStrings(current.receiverAgentPaths, update.receiverAgentPaths),
    prompt: update.prompt ?? current.prompt,
    result: update.result ?? current.result,
    taskName: update.taskName ?? current.taskName,
    model: update.model ?? current.model,
    reasoningEffort: update.reasoningEffort ?? current.reasoningEffort,
    agentRole: update.agentRole ?? current.agentRole,
    forkTurns: update.forkTurns ?? current.forkTurns,
    status: chooseStatus(current.status, update.status),
    targetAgentStatuses: {
      ...current.targetAgentStatuses,
      ...update.targetAgentStatuses
    },
    evidence: mergeEvidence(current.evidence, update.evidence)
  };
}

/**
 * Clones collection fields so correlation never exposes caller-owned arrays.
 */
function cloneEvent(event: OpenCodexCollaborationEvent): OpenCodexCollaborationEvent {
  return {
    ...event,
    receiverThreadIds: [...event.receiverThreadIds],
    receiverAgentPaths: [...event.receiverAgentPaths],
    targetAgentStatuses: { ...event.targetAgentStatuses },
    evidence: [...event.evidence]
  };
}

/**
 * Prefers the more precise raw function action over an activity fallback.
 */
function chooseAction(
  current: OpenCodexCollaborationEvent,
  update: OpenCodexCollaborationEvent
): OpenCodexCollaborationAction {
  if (update.evidence.includes("rawFunctionCall")) {
    return update.action;
  }

  return current.action;
}

/**
 * Resolves lifecycle status without letting partial evidence downgrade it.
 */
function chooseStatus(
  current: OpenCodexCollaborationStatus,
  update: OpenCodexCollaborationStatus
): OpenCodexCollaborationStatus {
  const priority: Record<OpenCodexCollaborationStatus, number> = {
    unknown: 0,
    pending: 1,
    completed: 2,
    failed: 3
  };

  const currentPriority = priority[current];
  const updatePriority = priority[update];
  return updatePriority > currentPriority ? update : current;
}
