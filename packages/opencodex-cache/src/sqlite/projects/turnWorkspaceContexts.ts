import type { Database } from "better-sqlite3";
import type { OpenCodexTurnWorkspaceContext } from "@open-codex-ui/opencodex-protocol";

/** Copies only correlated reservation evidence; snapshots never write this history. */
export function captureTurnWorkspaceContexts(database: Database, reservationId: string): void {
  const reservation = database.prepare("SELECT operation FROM workspace_execution_reservations WHERE id = ?")
    .get(reservationId) as { operation: string } | undefined;
  if (reservation?.operation !== "turn") {
    return;
  }
  const conflict = database.prepare(`SELECT 1 FROM workspace_execution_reservations AS reservation
    JOIN turn_workspace_contexts AS context
      ON context.thread_id = reservation.thread_id AND context.turn_id = reservation.turn_id
    WHERE reservation.id = ? AND (context.source_id != reservation.source_id
      OR context.project_id != reservation.project_id
      OR context.workspace_id != reservation.workspace_id OR context.cwd != reservation.cwd)
    LIMIT 1`).get(reservationId);
  if (conflict !== undefined) {
    throw new Error("Turn workspace context conflicts with immutable execution history.");
  }
  database.prepare(`INSERT OR IGNORE INTO turn_workspace_contexts
    (source_id, thread_id, turn_id, project_id, workspace_id, cwd)
    SELECT source_id, thread_id, turn_id, project_id, workspace_id, cwd
    FROM workspace_execution_reservations
    WHERE id = ? AND thread_id IS NOT NULL AND turn_id IS NOT NULL`).run(reservationId);
}

/** Reads retained evidence even after a source association or workspace is removed. */
export function readTurnWorkspaceContexts(
  database: Database,
  threadId: string
): OpenCodexTurnWorkspaceContext[] {
  return database.prepare(`SELECT source_id AS sourceId, thread_id AS threadId,
    turn_id AS turnId, project_id AS projectId, workspace_id AS workspaceId, cwd
    FROM turn_workspace_contexts WHERE thread_id = ? ORDER BY turn_id`)
    .all(threadId) as OpenCodexTurnWorkspaceContext[];
}

/** Overlays trusted evidence and explicitly removes any context embedded in RPC JSON. */
export function attachTurnWorkspaceContexts(
  database: Database,
  threadId: string,
  turns: unknown[]
): unknown[] {
  const contexts = new Map(readTurnWorkspaceContexts(database, threadId)
    .map((context) => [context.turnId, context]));
  return turns.map((turn) => {
    if (turn === null || typeof turn !== "object" || Array.isArray(turn)) {
      return turn;
    }
    const value = turn as Record<string, unknown>;
    const result = { ...value };
    delete result.openCodexUiWorkspace;
    const context = contexts.get(String(value.id));
    if (context !== undefined) {
      result.openCodexUiWorkspace = context;
    }
    return result;
  });
}
