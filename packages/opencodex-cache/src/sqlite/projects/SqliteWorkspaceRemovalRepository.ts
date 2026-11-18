import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceRemovalRepository } from "../../types/workspaceRemovals.js";

/** Explicit DTO projection preserves frozen source paths across restarts. */
const columns = `id, workspace_id AS workspaceId, project_id AS projectId, source_id AS sourceId,
  primary_workspace_id AS primaryWorkspaceId, project_path AS projectPath,
  workspace_path AS workspacePath, repository_path AS repositoryPath, state, git_exit_code AS gitExitCode,
  deferred_state AS deferredState, requested_at AS requestedAt, blocked_reason AS blockedReason`;

/** SQLite nullable fields are omitted from legacy removal DTOs. */
interface RemovalRow extends Omit<OpenCodexWorkspaceRemoval, "deferredState" | "requestedAt" | "blockedReason"> {
  deferredState: OpenCodexWorkspaceRemoval["deferredState"] | null;
  requestedAt: string | null;
  blockedReason: string | null;
}

/** Keeps pre-existing journal payloads unchanged when automatic deletion was not requested. */
function toRemoval(row: RemovalRow): OpenCodexWorkspaceRemoval {
  const { deferredState, requestedAt, blockedReason, ...removal } = row;
  if (deferredState == null) return removal;
  return { ...removal, deferredState, requestedAt: requestedAt ?? undefined, blockedReason };
}

/** Persists removal intent separately from retained workspace and conversation history. */
export class SqliteWorkspaceRemovalRepository implements WorkspaceRemovalRepository {
  /** Shares the cache connection for atomic identity guards and publication. */
  constructor(private readonly database: Database) {}

  /** Refuses primary/external workspaces and all durable execution or transition blockers. */
  async begin(projectId: string, workspaceId: string, sourceId: string,
    primaryWorkspaceId: string, repositoryPath: string, deferred = false): Promise<OpenCodexWorkspaceRemoval> {
    return this.database.transaction(() => {
      const workspace = this.database.prepare(`SELECT path FROM project_workspaces
        WHERE id = ? AND project_id = ? AND source_id = ? AND is_primary = 0 AND managed = 1
          AND removed_at IS NULL`).get(workspaceId, projectId, sourceId) as { path: string } | undefined;
      const primary = this.database.prepare(`SELECT path FROM project_workspaces
        WHERE id = ? AND project_id = ? AND source_id = ? AND is_primary = 1 AND removed_at IS NULL`)
        .get(primaryWorkspaceId, projectId, sourceId) as { path: string } | undefined;
      if (workspace === undefined || primary === undefined) {
        throw new Error("Only a managed secondary workspace with an available primary can be removed.");
      }
      if (this.database.prepare(`SELECT id FROM workspace_execution_reservations WHERE workspace_id = ?`)
        .get(workspaceId) !== undefined || this.database.prepare(`SELECT id FROM workspace_transitions
          WHERE from_workspace_id = ? OR to_workspace_id = ?`).get(workspaceId, workspaceId) !== undefined) {
        throw new Error("Workspace has an active or unresolved execution or transition.");
      }
      const id = randomUUID();
      this.database.prepare(`INSERT INTO workspace_removals
        (id, workspace_id, project_id, source_id, primary_workspace_id, project_path,
          workspace_path, repository_path, state, deferred_state, requested_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preparing', ?, ?)`)
        .run(id, workspaceId, projectId, sourceId, primaryWorkspaceId, primary.path, workspace.path, repositoryPath,
          deferred ? "queued" : null, deferred ? new Date().toISOString() : null);
      return this.require(id);
    })();
  }

  /** Reads one operation without inferring completion from application memory. */
  async get(id: string): Promise<OpenCodexWorkspaceRemoval | null> {
    const row = this.database.prepare(`SELECT ${columns} FROM workspace_removals WHERE id = ?`)
      .get(id) as RemovalRow | undefined;
    return row === undefined ? null : toRemoval(row);
  }

  /** Lists unresolved operations, including those interrupted by a crash. */
  async list(projectId: string): Promise<OpenCodexWorkspaceRemoval[]> {
    const rows = this.database.prepare(`SELECT ${columns} FROM workspace_removals WHERE project_id = ? ORDER BY id`)
      .all(projectId) as RemovalRow[];
    return rows.map(toRemoval);
  }

  /** Lists only undispatched automatic requests, across explicit project/source identities. */
  async queued(): Promise<OpenCodexWorkspaceRemoval[]> {
    const rows = this.database.prepare(`SELECT ${columns} FROM workspace_removals
      WHERE deferred_state = 'queued' AND state = 'preparing'
        AND NOT EXISTS (SELECT 1 FROM workspace_removals AS active
          WHERE active.source_id = workspace_removals.source_id
            AND active.repository_path = workspace_removals.repository_path
            AND (active.deferred_state IS NULL OR active.deferred_state = 'processing'))
      ORDER BY requested_at, id`).all() as RemovalRow[];
    return rows.map(toRemoval);
  }

  /** Atomically claims one request; repository exclusion also protects uncertain earlier removals. */
  async claim(id: string): Promise<boolean> {
    const result = this.database.prepare(`UPDATE workspace_removals SET deferred_state = 'processing'
      WHERE id = ? AND state = 'preparing' AND deferred_state = 'queued'
        AND NOT EXISTS (SELECT 1 FROM workspace_removals AS active
          WHERE active.source_id = workspace_removals.source_id
            AND active.repository_path = workspace_removals.repository_path
            AND (active.deferred_state IS NULL OR active.deferred_state = 'processing'))`).run(id);
    return result.changes === 1;
  }

  /** Records waiting or blocked intent only before any destructive dispatch. */
  async defer(id: string, reason: string | null): Promise<void> {
    const result = this.database.prepare(`UPDATE workspace_removals SET deferred_state = ?, blocked_reason = ?
      WHERE id = ? AND state = 'preparing' AND deferred_state = 'processing'`)
      .run(reason === null ? "queued" : "blocked", reason, id);
    if (result.changes !== 1) throw new Error("A dispatched removal cannot return to the queue.");
  }

  /** Cancels or retries only the owning project's undispatched intent, including offline. */
  async updateDeferred(id: string, projectId: string, sourceId: string, action: "cancel" | "retry"): Promise<void> {
    this.database.transaction(() => {
      const removal = this.require(id);
      if (removal.projectId !== projectId || removal.sourceId !== sourceId || removal.state !== "preparing"
        || !["queued", "blocked"].includes(removal.deferredState ?? "")) {
        throw new Error("Only this project's waiting or blocked removal can be changed.");
      }
      if (action === "cancel") this.database.prepare("DELETE FROM workspace_removals WHERE id = ?").run(id);
      else this.database.prepare(`UPDATE workspace_removals SET deferred_state = 'queued', blocked_reason = NULL
        WHERE id = ?`).run(id);
    })();
  }

  /** Crosses the dispatch boundary only once. */
  async submitting(id: string): Promise<void> {
    const result = this.database.prepare(`UPDATE workspace_removals SET state = 'submitting'
      WHERE id = ? AND state = 'preparing' AND (deferred_state IS NULL OR deferred_state = 'processing')`)
      .run(id);
    if (result.changes !== 1) throw new Error("Removal is not ready for dispatch.");
  }

  /** Saves a positively observed process exit before any further I/O. */
  async confirmGit(id: string, exitCode: number): Promise<void> {
    if (!Number.isSafeInteger(exitCode)) throw new Error("A complete Git exit code is required.");
    const result = this.database.prepare(`UPDATE workspace_removals SET git_exit_code = ?
      WHERE id = ? AND state = 'submitting'`).run(exitCode, id);
    if (result.changes !== 1) throw new Error("Removal is not awaiting Git completion.");
  }

  /** Retains the reservation after dispatch; preparation has no destructive effects. */
  async fail(id: string): Promise<void> {
    this.database.transaction(() => {
      this.database.prepare(`DELETE FROM workspace_removals
        WHERE id = ? AND state = 'preparing' AND deferred_state IS NULL`).run(id);
      this.database.prepare("UPDATE workspace_removals SET state = 'uncertain' WHERE id = ? AND state = 'submitting'").run(id);
    })();
  }

  /** Refuses cancellation while a dispatched process may still remove files. */
  async cancel(id: string): Promise<void> {
    this.database.transaction(() => {
      const removal = this.require(id);
      if (removal.state !== "preparing" && (removal.gitExitCode === null || removal.gitExitCode === 0)) {
        throw new Error("An uncertain or successful removal cannot be cancelled.");
      }
      this.database.prepare("DELETE FROM workspace_removals WHERE id = ?").run(id);
    })();
  }

  /** Publishes logical removal atomically while retaining identities, paths and history. */
  async commit(id: string): Promise<void> {
    this.database.transaction(() => {
      const removal = this.require(id);
      if (removal.state === "preparing") throw new Error("Removal has not been dispatched.");
      this.database.prepare("DELETE FROM workspace_removals WHERE id = ?").run(id);
      const result = this.database.prepare(`UPDATE project_workspaces SET removed_at = ?
        WHERE id = ? AND project_id = ? AND source_id = ? AND path = ? AND is_primary = 0
          AND managed = 1 AND removed_at IS NULL`)
        .run(new Date().toISOString(), removal.workspaceId, removal.projectId, removal.sourceId, removal.workspacePath);
      if (result.changes !== 1) throw new Error("Workspace removal identity changed.");
    })();
  }

  /** Requires the frozen intent instead of reconstructing paths from UI input. */
  private require(id: string): OpenCodexWorkspaceRemoval {
    const row = this.database.prepare(`SELECT ${columns} FROM workspace_removals WHERE id = ?`)
      .get(id) as RemovalRow | undefined;
    if (row === undefined) throw new Error("Workspace removal does not exist.");
    return toRemoval(row);
  }
}
