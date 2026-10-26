import { relocateWorkspace } from "./relocateWorkspace.js";
import { readWorkspaceActivity } from "./workspaceActivity.js";
import { updateWorkspaceWorkStatus } from "./workspaceWorkStatus.js";
import type { OpenCodexWorkspaceWorkStatusInput } from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexWorkspaceActivity } from "@open-codex-ui/opencodex-protocol";
import { SqliteWorkspaceMoveRepository } from "./SqliteWorkspaceMoveRepository.js";
import { validateWorkspaceName } from "./workspaceName.js";
import { registerDiscoveredWorkspaces } from "./registerDiscoveredWorkspaces.js";
import { SqliteWorkspaceCreationRepository } from "./SqliteWorkspaceCreationRepository.js";
import { SqliteWorkspaceRemovalRepository } from "./SqliteWorkspaceRemovalRepository.js";
import { captureTurnWorkspaceContexts, readTurnWorkspaceContexts } from "./turnWorkspaceContexts.js";
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { OpenCodexProjectWorkspace, OpenCodexTurnWorkspaceContext, OpenCodexWorkspaceDiscoverySkipped } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceCacheRepository, WorkspaceExecutionReservation } from "../../types/workspaces.js";
import { resolveProject } from "./projectResolver.js";
import { SqliteWorkspaceTransitionRepository } from "./SqliteWorkspaceTransitionRepository.js";

/** SQL projection shared by catalogue and execution-context reads. */
const workspaceColumns = `id, project_id AS projectId, source_id AS sourceId,
  path, name, is_primary AS isPrimary, managed, removed_at AS removedAt, compose_used AS composeUsed,
  work_status AS workStatus, completed_at AS completedAt,
  EXISTS(SELECT 1 FROM workspace_removals WHERE workspace_id = project_workspaces.id) AS removalPending,
  EXISTS(SELECT 1 FROM workspace_moves WHERE workspace_id = project_workspaces.id
    OR (primary_snapshot IS NOT NULL AND project_id = project_workspaces.project_id)) AS movePending`;
/** SQL projection for durable execution reservations. */
const reservationColumns = `id, workspace_id AS workspaceId, project_id AS projectId,
  source_id AS sourceId, cwd, thread_id AS threadId, turn_id AS turnId, state, operation`;

/** Raw projection with SQLite integer flags. */
interface WorkspaceRow extends Omit<OpenCodexProjectWorkspace, "isPrimary" | "managed" | "removalPending" | "composeUsed" | "movePending"> {
  /** SQLite flag retaining the need for Compose inactivity checks. */
  composeUsed: number;
  /** SQLite flag for a retained removal reservation. */
  removalPending: number;
  /** SQLite flag retaining an unresolved physical move. */
  movePending: number;
  /** Stored principal role flag. */
  isPrimary: number;
  /** Stored ownership flag. */
  managed: number;
}

/** Owns workspace identity and atomic lifecycle guards in the shared cache. */
export class SqliteWorkspaceCacheRepository implements WorkspaceCacheRepository {
  /** Physical moves hold their identities and destination paths across restarts. */
  readonly moves: SqliteWorkspaceMoveRepository;
  /** Removal intent remains durable without deleting conversation history. */
  readonly removals: SqliteWorkspaceRemovalRepository;
  /** Tracks pending creation without making its destination executable. */
  readonly creations: SqliteWorkspaceCreationRepository;
  /** Transition records cannot be completed by turn lifecycle events. */
  readonly transitions: SqliteWorkspaceTransitionRepository;
  /** Uses the facade's transaction-capable connection. */
  constructor(private readonly database: Database) {
    this.moves = new SqliteWorkspaceMoveRepository(database);
    this.removals = new SqliteWorkspaceRemovalRepository(database);
    this.creations = new SqliteWorkspaceCreationRepository(database);
    this.transitions = new SqliteWorkspaceTransitionRepository(database);
  }

  /** Records stack use before dispatch so later removal cannot skip Docker checks after restart. */
  async markComposeUsed(workspaceId: string): Promise<void> {
    const result = this.database.prepare(`UPDATE project_workspaces SET compose_used = 1
      WHERE id = ? AND removed_at IS NULL AND NOT EXISTS
        (SELECT 1 FROM workspace_removals WHERE workspace_id = ?)`)
      .run(workspaceId, workspaceId);
    if (result.changes !== 1) throw new Error("Workspace is unavailable or has a pending removal.");
  }

  /** Registers an explicitly verified batch while preserving all existing identities and roles. */
  async registerDiscovered(primaryWorkspaceId: string, sourceId: string, primaryPath: string,
    paths: string[]): Promise<OpenCodexWorkspaceDiscoverySkipped[]> {
    return registerDiscoveredWorkspaces(this.database, primaryWorkspaceId, sourceId, primaryPath, paths);
  }

  /** Reads immutable history independently of current workspace associations. */
  async listTurnContexts(threadId: string): Promise<OpenCodexTurnWorkspaceContext[]> {
    return readTurnWorkspaceContexts(this.database, threadId);
  }

  /** Lists all retained workspace identities for a logical project. */
  async list(projectId: string): Promise<OpenCodexProjectWorkspace[]> {
    const rows = this.database.prepare(`SELECT ${workspaceColumns}
      FROM project_workspaces WHERE project_id = ? ORDER BY is_primary DESC, id`)
      .all(projectId) as WorkspaceRow[];
    return rows.map(mapWorkspace);
  }

  /** Reads complete cached activity independently of UI chat filters and source connectivity. */
  async activity(projectId: string): Promise<OpenCodexWorkspaceActivity[]> {
    return readWorkspaceActivity(this.database, projectId);
  }

  /** Renames only secondary metadata; identity, physical path and history stay intact. */
  async rename(projectId: string, workspaceId: string, name: string): Promise<void> {
    const normalized = validateWorkspaceName(name);
    const result = this.database.prepare(`UPDATE project_workspaces SET name = ?
      WHERE id = ? AND project_id = ? AND is_primary = 0 AND removed_at IS NULL`)
      .run(normalized, workspaceId, projectId);
    if (result.changes !== 1) throw new Error("Only an available secondary workspace of this project can be renamed.");
  }

  /** Returns the committed metadata without contacting the source or rewriting execution history. */
  async setWorkStatus(input: OpenCodexWorkspaceWorkStatusInput): Promise<OpenCodexProjectWorkspace> {
    return this.database.transaction(() => {
      updateWorkspaceWorkStatus(this.database, input);
      return this.requireWorkspace(input.workspaceId);
    })();
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
      if (this.database.prepare("SELECT id FROM workspace_transitions WHERE thread_id = ?")
        .get(threadId) !== undefined) {
        throw new Error("Thread has an unresolved workspace transition.");
      }
      const reserved = this.database.prepare(`SELECT id FROM workspace_execution_reservations
        WHERE thread_id = ?`).get(threadId);
      if (reserved !== undefined) {
        throw new Error("Thread has a reserved or active workspace execution.");
      }
      this.database.prepare("UPDATE threads SET current_workspace_id = ?, cwd = ? WHERE id = ?")
        .run(workspaceId, workspace.path, threadId);
    })();
  }

  /** Reads latest historical paths without treating them as current filesystem ownership. */
  async listPathAliases(workspaceId: string): Promise<string[]> {
    const rows = this.database.prepare(`SELECT path FROM workspace_path_aliases
      WHERE workspace_id = ? ORDER BY id DESC`).all(workspaceId) as { path: string }[];
    return rows.map(row => row.path);
  }

  /** Ignores obsolete reloads after an explicit switch to another workspace. */
  async getThreadRelocationPath(threadId: string): Promise<string | null> {
    const row = this.database.prepare(`SELECT r.previous_path AS path FROM workspace_thread_relocations r
      JOIN threads t ON t.id = r.thread_id AND t.current_workspace_id = r.workspace_id
      WHERE r.thread_id = ?`).get(threadId) as { path: string } | undefined;
    return row?.path ?? null;
  }

  /** A verified same-association reload is safe to retry if its local acknowledgement was lost. */
  async confirmThreadRelocation(threadId: string, workspaceId: string, path: string): Promise<void> {
    this.database.prepare(`DELETE FROM workspace_thread_relocations WHERE thread_id = ? AND workspace_id = ?
      AND EXISTS (SELECT 1 FROM threads t JOIN project_workspaces w ON w.id = t.current_workspace_id
        WHERE t.id = ? AND w.id = ? AND w.path = ?)`).run(threadId, workspaceId, threadId, workspaceId, path);
  }

  /** Relocates identity after backend validation; aliases never drive automatic adoption. */
  async relocate(workspaceId: string, path: string, expectedPath?: string): Promise<void> {
    relocateWorkspace(this.database, workspaceId, path, expectedPath);
  }

  /** Captures immutable context and guards against concurrent selection or relocation. */
  async reserve(workspaceId: string, threadId: string | null,
    operation: WorkspaceExecutionReservation["operation"] = "turn"): Promise<WorkspaceExecutionReservation> {
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
        (id, workspace_id, project_id, source_id, cwd, thread_id, state, operation)
        VALUES (?, ?, ?, ?, ?, ?, 'preparing', ?)`)
        .run(id, workspaceId, workspace.projectId, workspace.sourceId, workspace.path, threadId, operation);
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

  /** Records new-thread dispatch without inventing a thread identifier before the reply. */
  async submittingCreation(reservationId: string): Promise<void> {
    const result = this.database.prepare(`UPDATE workspace_execution_reservations SET state = 'submitting'
      WHERE id = ? AND state = 'preparing' AND thread_id IS NULL AND operation = 'turn'`).run(reservationId);
    if (result.changes !== 1) throw new Error("New conversation is not ready for submission.");
  }

  /** Requires positive creation evidence and a persisted matching thread before releasing the guard. */
  async confirmCreation(reservationId: string, threadId: string): Promise<void> {
    const result = this.database.prepare(`DELETE FROM workspace_execution_reservations
      WHERE id = ? AND state = 'submitting' AND thread_id IS NULL AND operation = 'turn'
      AND EXISTS (SELECT 1 FROM threads t WHERE t.id = ?
        AND t.current_workspace_id = workspace_execution_reservations.workspace_id
        AND t.source_id = workspace_execution_reservations.source_id
        AND t.project_id = workspace_execution_reservations.project_id
        AND t.cwd = workspace_execution_reservations.cwd)`).run(reservationId, threadId);
    if (result.changes !== 1) throw new Error("Created conversation does not match its reserved workspace.");
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
        WHERE id = ? AND operation IN ('turn', 'review', 'compact')
          AND (turn_id IS NULL OR turn_id = ?)`)
        .run(turnId, reservationId, turnId);
      if (result.changes !== 1) {
        throw new Error("Turn response does not match the reserved workspace execution.");
      }
      captureTurnWorkspaceContexts(this.database, reservationId);
      this.database.prepare("DELETE FROM workspace_execution_reservations WHERE id = ? AND state = 'completed'")
        .run(reservationId);
    })();
  }

  /** Releases synchronous rollback; asynchronous maintenance waits for its correlated completion. */
  async acknowledgeMaintenance(reservationId: string, turnId?: string): Promise<void> {
    // Review acknowledgement needs the existing early-event correlation transaction.
    const row = this.database.prepare(`SELECT operation, state FROM workspace_execution_reservations WHERE id = ?`)
      .get(reservationId) as { operation: string; state: string } | undefined;
    if (row === undefined || !["review", "compact", "rollback"].includes(row.operation)
      || row.state === "preparing") {
      throw new Error("Maintenance reservation is not ready for acknowledgement.");
    }
    if (row.operation === "review") {
      if (turnId === undefined || turnId.length === 0) {
        throw new Error("Review returned no turn id; reconcile before retrying.");
      }
      await this.acknowledge(reservationId, turnId);
      return;
    }
    this.database.transaction(() => {
      if (row.operation === "rollback") {
        this.database.prepare("DELETE FROM workspace_execution_reservations WHERE id = ?").run(reservationId);
        return;
      }
      this.database.prepare("UPDATE workspace_execution_reservations SET acknowledged = 1 WHERE id = ?")
        .run(reservationId);
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
            AND operation IN ('turn', 'review', 'compact') AND state IN ('submitting', 'uncertain')`)
          .run(turnId, sourceId, threadId);
      } else {
        this.database.prepare(`UPDATE workspace_execution_reservations SET state = 'completed'
          WHERE source_id = ? AND thread_id = ? AND turn_id = ?`).run(sourceId, threadId, turnId);
      }
      const reservation = this.database.prepare(`SELECT id FROM workspace_execution_reservations
        WHERE source_id = ? AND thread_id = ? AND turn_id = ?`).get(sourceId, threadId, turnId) as
        { id: string } | undefined;
      if (reservation !== undefined) {
        captureTurnWorkspaceContexts(this.database, reservation.id);
      }
      if (completed) {
        this.database.prepare(`DELETE FROM workspace_execution_reservations
          WHERE source_id = ? AND thread_id = ? AND turn_id = ? AND acknowledged = 1`)
          .run(sourceId, threadId, turnId);
      }
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

  /** Reads reservation identity independently of the mutable thread catalogue. */
  async getReservationForThread(threadId: string): Promise<WorkspaceExecutionReservation | null> {
    const reservation = this.database.prepare(`SELECT ${reservationColumns}
      FROM workspace_execution_reservations WHERE thread_id = ?`).get(threadId) as
      WorkspaceExecutionReservation | undefined;
    return reservation ?? null;
  }

  /** Persists the positive RPC outcome before any local deletion or emitted event. */
  async confirmDeletion(reservationId: string): Promise<void> {
    const result = this.database.prepare(`UPDATE workspace_execution_reservations SET acknowledged = 1
      WHERE id = ? AND operation = 'delete' AND state IN ('submitting', 'uncertain')`).run(reservationId);
    if (result.changes !== 1) {
      throw new Error("Deletion reservation is not ready for confirmation.");
    }
  }

  /** Requires a persisted successful delete response rather than a missing thread. */
  async isDeletionConfirmed(reservationId: string): Promise<boolean> {
    return this.database.prepare(`SELECT id FROM workspace_execution_reservations
      WHERE id = ? AND operation = 'delete' AND acknowledged = 1`).get(reservationId) !== undefined;
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
    if (workspace.movePending === true) throw new Error("Workspace has a pending move.");
    if (workspace.removalPending === true) throw new Error("Workspace has a pending removal.");
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
}

/** Converts integer storage flags to structured-clone-compatible DTO values. */
function mapWorkspace(row: WorkspaceRow): OpenCodexProjectWorkspace {
  const { removalPending, composeUsed, movePending, ...fields } = row;
  const workspace: OpenCodexProjectWorkspace = { ...fields, isPrimary: row.isPrimary === 1, managed: row.managed === 1 };
  if (composeUsed === 1) workspace.composeUsed = true;
  if (movePending === 1) workspace.movePending = true;
  if (removalPending === 1) workspace.removalPending = true;
  return workspace;
}
