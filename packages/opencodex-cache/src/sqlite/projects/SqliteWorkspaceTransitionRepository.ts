import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { WorkspaceTransitionRecord, WorkspaceTransitionRepository } from "../../types/workspaceTransitions.js";

/** SQL projection keeps persisted paths and identities independent of later remote responses. */
const columns = `id, thread_id AS threadId, project_id AS projectId, source_id AS sourceId,
  from_workspace_id AS fromWorkspaceId, to_workspace_id AS toWorkspaceId,
  from_path AS fromPath, to_path AS toPath, state, expectation_json AS expectationJson`;

/** Owns transactional transition persistence without invoking Codex or interpreting its permissions. */
export class SqliteWorkspaceTransitionRepository implements WorkspaceTransitionRepository {
  /** Shares the workspace repository's connection and transaction boundaries. */
  constructor(private readonly database: Database) {}

  /** Reserves both same-project/source locations after checking all existing blockers. */
  async begin(threadId: string, workspaceId: string): Promise<WorkspaceTransitionRecord> {
    return this.database.transaction(() => {
      const pair = this.database.prepare(`SELECT a.id AS fromWorkspaceId, b.id AS toWorkspaceId,
        a.path AS fromPath, b.path AS toPath, a.project_id AS projectId, a.source_id AS sourceId
        FROM threads t JOIN project_workspaces a ON a.id = t.current_workspace_id
        JOIN project_workspaces b ON b.id = ?
        WHERE t.id = ? AND a.project_id = b.project_id AND a.source_id = b.source_id
          AND t.project_id = a.project_id AND t.source_id = a.source_id
          AND a.removed_at IS NULL AND b.removed_at IS NULL AND a.source_id IS NOT NULL`)
        .get(workspaceId, threadId) as Omit<WorkspaceTransitionRecord,
          "id" | "threadId" | "state" | "expectationJson"> | undefined;
      if (pair === undefined) {
        throw new Error("Transition requires available workspaces in the thread's project and source.");
      }
      const ids = [pair.fromWorkspaceId, pair.toWorkspaceId];
      const executions = this.database.prepare(`SELECT id FROM workspace_execution_reservations
        WHERE thread_id = ? OR workspace_id IN (?, ?)`).get(threadId, ...ids);
      const transitions = this.database.prepare(`SELECT id FROM workspace_transitions
        WHERE thread_id = ? OR from_workspace_id IN (?, ?) OR to_workspace_id IN (?, ?)`)
        .get(threadId, ...ids, ...ids);
      if (executions !== undefined || transitions !== undefined) {
        throw new Error("Workspace has an unresolved execution or transition; reconcile before retrying.");
      }
      const id = randomUUID();
      this.database.prepare(`INSERT INTO workspace_transitions
        (id, thread_id, project_id, source_id, from_workspace_id, to_workspace_id, from_path, to_path, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preparing')`)
        .run(id, threadId, pair.projectId, pair.sourceId, ...ids, pair.fromPath, pair.toPath);
      return this.require(id);
    })();
  }

  /** Reads pending transitions even after process restart. */
  async getForThread(threadId: string): Promise<WorkspaceTransitionRecord | null> {
    return this.database.prepare(`SELECT ${columns} FROM workspace_transitions WHERE thread_id = ?`)
      .get(threadId) as WorkspaceTransitionRecord | undefined ?? null;
  }

  /** Includes both original and destination workspaces. */
  async list(workspaceId: string): Promise<WorkspaceTransitionRecord[]> {
    return this.database.prepare(`SELECT ${columns} FROM workspace_transitions
      WHERE from_workspace_id = ? OR to_workspace_id = ? ORDER BY id`)
      .all(workspaceId, workspaceId) as WorkspaceTransitionRecord[];
  }

  /** Writes dispatch before remote effects and prevents recovery from silently changing the contract. */
  async submitting(id: string, expectationJson: string): Promise<void> {
    JSON.parse(expectationJson);
    const result = this.database.prepare(`UPDATE workspace_transitions
      SET state = 'submitting', expectation_json = ? WHERE id = ?
      AND (expectation_json IS NULL OR expectation_json = ?)`)
      .run(expectationJson, id, expectationJson);
    if (result.changes !== 1) {
      throw new Error("Workspace transition expectation changed or reservation disappeared.");
    }
  }

  /** Never releases a transition whose remote effects may have occurred. */
  async fail(id: string): Promise<void> {
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM workspace_transitions WHERE id = ? AND state = 'preparing'").run(id);
      this.database.prepare("UPDATE workspace_transitions SET state = 'uncertain' WHERE id = ?").run(id);
    })();
  }

  /** Updates association and compatibility cwd in the same transaction as releasing both locations. */
  async commit(id: string): Promise<void> {
    this.database.transaction(() => {
      const transition = this.require(id);
      if (transition.state !== "submitting") {
        throw new Error("Workspace transition has not been submitted for verification.");
      }
      this.database.prepare("DELETE FROM workspace_transitions WHERE id = ?").run(id);
      const result = this.database.prepare(`UPDATE threads SET current_workspace_id = ?, cwd = ?
        WHERE id = ? AND current_workspace_id = ? AND source_id = ? AND project_id = ?`)
        .run(transition.toWorkspaceId, transition.toPath, transition.threadId,
          transition.fromWorkspaceId, transition.sourceId, transition.projectId);
      if (result.changes !== 1) {
        throw new Error("Thread association changed during workspace transition.");
      }
    })();
  }

  /** Fails explicitly for stale operation identifiers. */
  private require(id: string): WorkspaceTransitionRecord {
    const row = this.database.prepare(`SELECT ${columns} FROM workspace_transitions WHERE id = ?`)
      .get(id) as WorkspaceTransitionRecord | undefined;
    if (row === undefined) {
      throw new Error("Workspace transition does not exist.");
    }
    return row;
  }
}
