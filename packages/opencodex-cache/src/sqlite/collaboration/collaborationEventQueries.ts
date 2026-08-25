/**
 * Reads and writes normalized source-aware collaboration events.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import type {
  OpenCodexCollaborationAction,
  OpenCodexCollaborationEvent,
  OpenCodexCollaborationEvidence,
  OpenCodexCollaborationStatus
} from "@open-codex-ui/opencodex-protocol";

import type {
  CachedCollaborationEvent,
  CachedCollaborationEventQuery
} from "../../types.js";
import type { CollaborationEventRow } from "../shared/rowTypes.js";
import {
  cloneCollaborationEvent,
  collaborationEventsEqual,
  mapCollaborationEventRow,
  serializeCollaborationEvent
} from "./collaborationEventSerialization.js";

/**
 * Inserts a new event or enriches an existing partial observation.
 *
 * @param database SQLite database connection.
 * @param event Normalized collaboration event.
 * @returns Persisted event with observation timestamps.
 */
export function upsertCollaborationEvent(
  database: BetterSqliteDatabase,
  event: OpenCodexCollaborationEvent
): CachedCollaborationEvent {
  validateCollaborationEvent(event);

  const existing = readCollaborationEvent(database, event.sourceId, event.id);
  const mergedEvent = existing === null ? cloneCollaborationEvent(event) : mergeEvents(existing, event);

  if (existing !== null && collaborationEventsEqual(existing, mergedEvent)) {
    return existing;
  }

  const now = new Date().toISOString();
  const persistedEvent: CachedCollaborationEvent = {
    ...mergedEvent,
    firstObservedAt: existing?.firstObservedAt ?? now,
    updatedAt: now
  };

  database
    .prepare(
      `
      INSERT INTO collaboration_events (
        id,
        source_id,
        thread_id,
        turn_id,
        call_id,
        action,
        tool_name,
        sender_thread_id,
        sender_agent_path,
        receiver_thread_ids_json,
        receiver_agent_paths_json,
        prompt,
        result,
        task_name,
        model,
        reasoning_effort,
        agent_role,
        fork_turns_json,
        status,
        target_agent_statuses_json,
        evidence_json,
        first_observed_at,
        updated_at
      )
      VALUES (
        @id,
        @sourceId,
        @threadId,
        @turnId,
        @callId,
        @action,
        @toolName,
        @senderThreadId,
        @senderAgentPath,
        @receiverThreadIdsJson,
        @receiverAgentPathsJson,
        @prompt,
        @result,
        @taskName,
        @model,
        @reasoningEffort,
        @agentRole,
        @forkTurnsJson,
        @status,
        @targetAgentStatusesJson,
        @evidenceJson,
        @firstObservedAt,
        @updatedAt
      )
      ON CONFLICT(source_id, id) DO UPDATE SET
        thread_id = excluded.thread_id,
        turn_id = excluded.turn_id,
        call_id = excluded.call_id,
        action = excluded.action,
        tool_name = excluded.tool_name,
        sender_thread_id = excluded.sender_thread_id,
        sender_agent_path = excluded.sender_agent_path,
        receiver_thread_ids_json = excluded.receiver_thread_ids_json,
        receiver_agent_paths_json = excluded.receiver_agent_paths_json,
        prompt = excluded.prompt,
        result = excluded.result,
        task_name = excluded.task_name,
        model = excluded.model,
        reasoning_effort = excluded.reasoning_effort,
        agent_role = excluded.agent_role,
        fork_turns_json = excluded.fork_turns_json,
        status = excluded.status,
        target_agent_statuses_json = excluded.target_agent_statuses_json,
        evidence_json = excluded.evidence_json,
        updated_at = excluded.updated_at
      `
    )
    .run(serializeCollaborationEvent(persistedEvent));

  return persistedEvent;
}

/**
 * Lists events matching source, routing, and optional hierarchy filters.
 *
 * @param database SQLite database connection.
 * @param query Source-aware collaboration query.
 * @returns Events ordered by first observation.
 */
export function listCollaborationEvents(
  database: BetterSqliteDatabase,
  query: CachedCollaborationEventQuery
): CachedCollaborationEvent[] {
  if (query.sourceId.length === 0) {
    throw new Error("A source id is required to list collaboration events.");
  }

  const rows = database
    .prepare(
      `
      WITH RECURSIVE descendant_threads(id) AS (
        SELECT @rootThreadId
        WHERE @rootThreadId IS NOT NULL

        UNION

        SELECT threads.id
        FROM threads
        INNER JOIN descendant_threads
          ON threads.parent_thread_id = descendant_threads.id
        WHERE threads.source_id = @sourceId
      )
      SELECT collaboration_events.*
      FROM collaboration_events
      WHERE collaboration_events.source_id = @sourceId
        AND (@threadId IS NULL OR collaboration_events.thread_id = @threadId)
        AND (
          @senderThreadId IS NULL
          OR collaboration_events.sender_thread_id = @senderThreadId
        )
        AND (
          @receiverThreadId IS NULL
          OR EXISTS (
            SELECT 1
            FROM json_each(collaboration_events.receiver_thread_ids_json)
            WHERE json_each.value = @receiverThreadId
          )
        )
        AND (
          @rootThreadId IS NULL
          OR collaboration_events.thread_id IN (SELECT id FROM descendant_threads)
          OR collaboration_events.sender_thread_id IN (SELECT id FROM descendant_threads)
          OR EXISTS (
            SELECT 1
            FROM json_each(collaboration_events.receiver_thread_ids_json)
            WHERE json_each.value IN (SELECT id FROM descendant_threads)
          )
        )
      ORDER BY collaboration_events.first_observed_at ASC,
        collaboration_events.sequence ASC
      LIMIT @limit
      `
    )
    .all({
      sourceId: query.sourceId,
      threadId: normalizeFilter(query.threadId),
      senderThreadId: normalizeFilter(query.senderThreadId),
      receiverThreadId: normalizeFilter(query.receiverThreadId),
      rootThreadId: normalizeFilter(query.rootThreadId),
      limit: normalizeLimit(query.limit)
    }) as CollaborationEventRow[];

  return rows.map(mapCollaborationEventRow);
}

/**
 * Reads one event by its source-scoped identity.
 */
function readCollaborationEvent(
  database: BetterSqliteDatabase,
  sourceId: string,
  eventId: string
): CachedCollaborationEvent | null {
  const row = database
    .prepare(
      `
      SELECT *
      FROM collaboration_events
      WHERE source_id = ? AND id = ?
      `
    )
    .get(sourceId, eventId) as CollaborationEventRow | undefined;

  return row === undefined ? null : mapCollaborationEventRow(row);
}

/**
 * Merges a later partial observation into an existing event.
 */
function mergeEvents(
  current: CachedCollaborationEvent,
  update: OpenCodexCollaborationEvent
): OpenCodexCollaborationEvent {
  if (current.threadId !== update.threadId) {
    throw new Error(`Collaboration event ${update.id} cannot change its observed thread.`);
  }

  if (current.turnId !== null && update.turnId !== null && current.turnId !== update.turnId) {
    throw new Error(`Collaboration event ${update.id} cannot change its observed turn.`);
  }

  return {
    id: current.id,
    sourceId: current.sourceId,
    threadId: current.threadId,
    turnId: update.turnId ?? current.turnId,
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
 * Prefers the exact raw V2 action over a generic activity marker.
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
 * Preserves the most advanced or terminal event status.
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

  return priority[update] > priority[current] ? update : current;
}

/**
 * Merges unique strings while retaining their observation order.
 */
function mergeStrings(current: readonly string[], update: readonly string[]): string[] {
  return Array.from(new Set([...current, ...update].filter((value) => value.length > 0)));
}

/**
 * Merges unique evidence values while retaining their observation order.
 */
function mergeEvidence(
  current: readonly OpenCodexCollaborationEvidence[],
  update: readonly OpenCodexCollaborationEvidence[]
): OpenCodexCollaborationEvidence[] {
  return Array.from(new Set([...current, ...update]));
}

/**
 * Validates the minimum source-aware event identity.
 */
function validateCollaborationEvent(event: OpenCodexCollaborationEvent): void {
  if (event.id.length === 0 || event.sourceId.length === 0 || event.threadId.length === 0) {
    throw new Error("Collaboration events require non-empty id, sourceId, and threadId fields.");
  }
}

/**
 * Converts empty optional filters to their unbounded representation.
 */
function normalizeFilter(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value;
}

/**
 * Bounds collaboration reads to keep accidental global queries inexpensive.
 */
function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 2_000;
  }

  return Math.min(10_000, Math.max(1, Math.floor(value)));
}
