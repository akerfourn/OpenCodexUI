import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceCacheRepository, WorkspaceExecutionReservation } from "../../types/workspaces.js";
import { normalizeProjectPath } from "../../projectIdentity.js";
import { resolveProject } from "./projectResolver.js";

/** SQL projection shared by catalogue and execution-context reads. */
const workspaceColumns = `id, project_id AS projectId, source_id AS sourceId,
  path, is_primary AS isPrimary, managed, removed_at AS removedAt`;
/** SQL projection for durable execution reservations. */
const reservationColumns = `id, workspace_id AS workspaceId, project_id AS projectId,
  source_id AS sourceId, cwd, thread_id AS threadId, turn_id AS turnId, state`;

/** Raw projection with SQLite integer flags. */
interface WorkspaceRow extends Omit<OpenCodexProjectWorkspace, "isPrimary" | "managed"> {
  /** Stored principal role flag. */
  isPrimary: number;
  /** Stored ownership flag. */
  managed: number;
}

/** Owns workspace identity and atomic lifecycle guards in the shared cache. */
export class SqliteWorkspaceCacheRepository implements WorkspaceCacheRepository {
  /** Uses the facade's transaction-capable connection. */
  constructor(private readonly database: Database) {}

  /** Lists all retained workspace identities for a logical project. */
  async list(projectId: string): Promise<OpenCodexProjectWorkspace[]> {
    const rows = this.database.prepare(`SELECT ${workspaceColumns}
      FROM project_workspaces WHERE project_id = ? ORDER BY is_primary DESC, id`)
      .all(projectId) as WorkspaceRow[];
    return rows.map(mapWorkspace);
  }

  /** Reads a workspace without interpreting its source-local path. */
  async get(workspaceId: string): Promise<OpenCodexProjectWorkspace | null> {
    return this.read(workspaceId);
  }

  /** Reads the stable thread association rather than the incoming RPC cwd. */
  async getForThread(threadId: string): Promise<OpenCodexProjectWorkspace | null> {
    const row = this.database.prepare("SELECT current_workspace_id AS id FROM threads WHERE id = ?")
      .get(threadId) as { id: string | null } | undefined;
    return row?.id === null || row?.id === undefined ? null : this.read(row.id);
  }

  /** Shares creation and index resolution within one transaction. */
  async resolvePath(path: string, sourceId: string): Promise<OpenCodexProjectWorkspace> {
    return this.database.transaction(() => {
      const project = resolveProject(this.database, path, sourceId);
      if (project === null) {
        throw new Error("Workspace path is required.");
      }
      return this.requireWorkspace(project.workspaceId);
    })();
  }

  /** Changes a thread association only when no execution owns the thread. */
  async select(threadId: string, workspaceId: string): Promise<void> {
    this.database.transaction(() => {
      const workspace = this.requireWorkspace(workspaceId);
      this.requireAvailable(workspace);
      this.requireThread(workspace, threadId);
      const reserved = this.database.prepare(`SELECT id FROM workspace_execution_reservations
        WHERE thread_id = ?`).get(threadId);
      if (reserved !== undefined) {
        throw new Error("Thread has a reserved or active workspace execution.");
      }
      this.database.prepare("UPDATE threads SET current_workspace_id = ?, cwd = ? WHERE id = ?")
        .run(workspaceId, workspace.path, threadId);
    })();
  }

  /** Relocates identity after backend validation; aliases never drive automatic adoption. */
  async relocate(workspaceId: string, path: string): Promise<void> {
    const normalizedPath = normalizeProjectPath(path);
    if (normalizedPath === null) {
      throw new Error("Workspace path is required.");
    }
    this.database.transaction(() => {
      const workspace = this.requireWorkspace(workspaceId);
      this.requireAvailable(workspace);
      this.requireUnreserved(workspaceId);
      if (workspace.path === normalizedPath) {
        return;
      }
      const now = new Date().toISOString();
      this.database.prepare(`INSERT INTO workspace_path_aliases
        (workspace_id, path, valid_from, valid_until)
        VALUES (?, ?, COALESCE((SELECT MAX(valid_until) FROM workspace_path_aliases
          WHERE workspace_id = ?), (SELECT created_at FROM projects WHERE id = ?)), ?)`)
        .run(workspaceId, workspace.path, workspaceId, workspace.projectId, now);
      this.database.prepare("UPDATE project_workspaces SET path = ? WHERE id = ?")
        .run(normalizedPath, workspaceId);
      if (workspace.isPrimary) {
        this.database.prepare("UPDATE projects SET path = ?, updated_at = ? WHERE id = ?")
          .run(normalizedPath, now, workspace.projectId);
      }
      this.database.prepare("UPDATE threads SET cwd = ? WHERE current_workspace_id = ?")
        .run(normalizedPath, workspaceId);
    })();
  }

  /** Captures immutable context and guards against concurrent selection or relocation. */
  async reserve(workspaceId: string, threadId: string | null): Promise<WorkspaceExecutionReservation> {
    return this.database.transaction(() => {
      const workspace = this.requireWorkspace(workspaceId);
      this.requireAvailable(workspace);
      if (threadId !== null) {
        this.requireThread(workspace, threadId);
        if (this.database.prepare(`SELECT id FROM workspace_execution_reservations
          WHERE source_id = ? AND thread_id = ?`).get(workspace.sourceId, threadId) !== undefined) {
          throw new Error("Thread has an unresolved workspace execution; reconcile before retrying.");
        }
        const thread = this.database.prepare("SELECT current_workspace_id AS id FROM threads WHERE id = ?")
          .get(threadId) as { id: string | null };
        if (thread.id !== workspaceId) {
          throw new Error("Thread workspace changed before execution could be reserved.");
        }
      }
      const id = randomUUID();
      this.database.prepare(`INSERT INTO workspace_execution_reservations
        (id, workspace_id, project_id, source_id, cwd, thread_id, state)
        VALUES (?, ?, ?, ?, ?, ?, 'preparing')`)
        .run(id, workspaceId, workspace.projectId, workspace.sourceId, workspace.path, threadId);
      return this.database.prepare(`SELECT ${reservationColumns}
        FROM workspace_execution_reservations WHERE id = ?`).get(id) as WorkspaceExecutionReservation;
    })();
  }

  /** Attaches a newly created thread to its reserved context. */
  async bindThread(reservationId: string, threadId: string): Promise<void> {
    this.database.transaction(() => {
      const reservation = this.database.prepare(`SELECT ${reservationColumns}
        FROM workspace_execution_reservations WHERE id = ?`).get(reservationId) as
        WorkspaceExecutionReservation | undefined;
      if (reservation === undefined || reservation.state !== "preparing") {
        throw new Error("Workspace execution is no longer preparing.");
      }
      this.requireThread(this.requireWorkspace(reservation.workspaceId), threadId);
      this.database.prepare("UPDATE workspace_execution_reservations SET thread_id = ? WHERE id = ?")
        .run(threadId, reservationId);
      this.database.prepare("UPDATE threads SET current_workspace_id = ?, cwd = ? WHERE id = ?")
        .run(reservation.workspaceId, reservation.cwd, threadId);
    })();
  }

  /** Writes intent before the turn-start RPC, so ambiguous failures survive restart. */
  async submitting(reservationId: string): Promise<void> {
    const result = this.database.prepare(`UPDATE workspace_execution_reservations SET state = 'submitting'
      WHERE id = ? AND state = 'preparing' AND thread_id IS NOT NULL`)
      .run(reservationId);
    if (result.changes !== 1) {
      throw new Error("Workspace execution is not ready for submission.");
    }
  }

  /** Joins a response with any already observed start/completion notification. */
  async acknowledge(reservationId: string, turnId: string): Promise<void> {
    this.database.transaction(() => {
      const result = this.database.prepare(`UPDATE workspace_execution_reservations SET turn_id = ?,
        acknowledged = 1, state = CASE WHEN state = 'completed' THEN state ELSE 'running' END
        WHERE id = ? AND (turn_id IS NULL OR turn_id = ?)`)
        .run(turnId, reservationId, turnId);
      if (result.changes !== 1) {
        throw new Error("Turn response does not match the reserved workspace execution.");
      }
      this.database.prepare("DELETE FROM workspace_execution_reservations WHERE id = ? AND state = 'completed'")
        .run(reservationId);
    })();
  }

  /** Uses matching lifecycle events; unrelated or late completions cannot free a reservation. */
  async observeTurn(sourceId: string, threadId: string, turnId: string, completed: boolean): Promise<void> {
    this.database.transaction(() => {
      if (!completed) {
        this.database.prepare(`UPDATE workspace_execution_reservations SET turn_id = ?, state = 'running'
          WHERE source_id = ? AND thread_id = ? AND turn_id IS NULL
            AND state IN ('submitting', 'uncertain')`).run(turnId, sourceId, threadId);
        return;
      }
      this.database.prepare(`UPDATE workspace_execution_reservations SET state = 'completed'
        WHERE source_id = ? AND thread_id = ? AND turn_id = ?`).run(sourceId, threadId, turnId);
      this.database.prepare(`DELETE FROM workspace_execution_reservations
        WHERE source_id = ? AND thread_id = ? AND turn_id = ? AND acknowledged = 1`)
        .run(sourceId, threadId, turnId);
    })();
  }

  /** Removes safe failures and retains ambiguous external effects for reconciliation. */
  async fail(reservationId: string): Promise<void> {
    this.database.transaction(() => {
      this.database.prepare(`DELETE FROM workspace_execution_reservations
        WHERE id = ? AND state IN ('preparing', 'completed')`).run(reservationId);
      this.database.prepare("UPDATE workspace_execution_reservations SET state = 'uncertain' WHERE id = ?")
        .run(reservationId);
    })();
  }

  /** Lists durable blockers, including operations interrupted by a process crash. */
  async listReservations(workspaceId: string): Promise<WorkspaceExecutionReservation[]> {
    return this.database.prepare(`SELECT ${reservationColumns}
      FROM workspace_execution_reservations WHERE workspace_id = ? ORDER BY id`)
      .all(workspaceId) as WorkspaceExecutionReservation[];
  }

  /** Releases a reservation after source reconciliation has established inactivity. */
  async release(reservationId: string): Promise<void> {
    this.database.prepare("DELETE FROM workspace_execution_reservations WHERE id = ?").run(reservationId);
  }

  /** Reads SQLite flags as protocol booleans. */
  private read(id: string): OpenCodexProjectWorkspace | null {
    const row = this.database.prepare(`SELECT ${workspaceColumns} FROM project_workspaces WHERE id = ?`)
      .get(id) as WorkspaceRow | undefined;
    return row === undefined ? null : mapWorkspace(row);
  }

  /** Rejects missing identities instead of falling back to an active project. */
  private requireWorkspace(id: string): OpenCodexProjectWorkspace {
    const workspace = this.read(id);
    if (workspace === null) {
      throw new Error("Workspace does not exist.");
    }
    return workspace;
  }

  /** Rejects orphan and logically removed workspaces before any execution. */
  private requireAvailable(workspace: OpenCodexProjectWorkspace): void {
    if (workspace.sourceId === null || workspace.removedAt !== null) {
      throw new Error("Workspace has no execution source or has been removed.");
    }
  }

  /** Enforces same-project and same-source ownership for thread mutations. */
  private requireThread(workspace: OpenCodexProjectWorkspace, threadId: string): void {
    const thread = this.database.prepare("SELECT project_id, source_id FROM threads WHERE id = ?")
      .get(threadId) as { project_id: string | null; source_id: string | null } | undefined;
    if (thread?.project_id !== workspace.projectId || thread.source_id !== workspace.sourceId) {
      throw new Error("Thread and workspace must belong to the same project and source.");
    }
  }

  /** Protects a physical location while any operation has captured it. */
  private requireUnreserved(workspaceId: string): void {
    if (this.database.prepare("SELECT id FROM workspace_execution_reservations WHERE workspace_id = ?")
      .get(workspaceId) !== undefined) {
      throw new Error("Workspace has a reserved or active execution.");
    }
  }
}

/** Converts integer storage flags to structured-clone-compatible DTO values. */
function mapWorkspace(row: WorkspaceRow): OpenCodexProjectWorkspace {
  return { ...row, isPrimary: row.isPrimary === 1, managed: row.managed === 1 };
}
