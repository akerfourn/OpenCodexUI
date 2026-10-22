import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { OpenCodexWorkspaceRemoval } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceRemovalRepository } from "../../types/workspaceRemovals.js";

/** Explicit DTO projection preserves frozen source paths across restarts. */
const columns = `id, workspace_id AS workspaceId, project_id AS projectId, source_id AS sourceId,
  primary_workspace_id AS primaryWorkspaceId, project_path AS projectPath,
  workspace_path AS workspacePath, repository_path AS repositoryPath, state, git_exit_code AS gitExitCode`;

/** Persists removal intent separately from retained workspace and conversation history. */
export class SqliteWorkspaceRemovalRepository implements WorkspaceRemovalRepository {
  /** Shares the cache connection for atomic identity guards and publication. */
  constructor(private readonly database: Database) {}

  /** Refuses primary/external workspaces and all durable execution or transition blockers. */
  async begin(projectId: string, workspaceId: string, sourceId: string,
    primaryWorkspaceId: string, repositoryPath: string): Promise<OpenCodexWorkspaceRemoval> {
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
          workspace_path, repository_path, state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'preparing')`)
        .run(id, workspaceId, projectId, sourceId, primaryWorkspaceId, primary.path, workspace.path, repositoryPath);
      return this.require(id);
    })();
  }

  /** Reads one operation without inferring completion from application memory. */
  async get(id: string): Promise<OpenCodexWorkspaceRemoval | null> {
    return this.database.prepare(`SELECT ${columns} FROM workspace_removals WHERE id = ?`)
      .get(id) as OpenCodexWorkspaceRemoval | undefined ?? null;
  }

  /** Lists unresolved operations, including those interrupted by a crash. */
  async list(projectId: string): Promise<OpenCodexWorkspaceRemoval[]> {
    return this.database.prepare(`SELECT ${columns} FROM workspace_removals WHERE project_id = ? ORDER BY id`)
      .all(projectId) as OpenCodexWorkspaceRemoval[];
  }

  /** Crosses the dispatch boundary only once. */
  async submitting(id: string): Promise<void> {
    const result = this.database.prepare("UPDATE workspace_removals SET state = 'submitting' WHERE id = ? AND state = 'preparing'")
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
      this.database.prepare("DELETE FROM workspace_removals WHERE id = ? AND state = 'preparing'").run(id);
      this.database.prepare("UPDATE workspace_removals SET state = 'uncertain' WHERE id = ?").run(id);
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
      .get(id) as OpenCodexWorkspaceRemoval | undefined;
    if (row === undefined) throw new Error("Workspace removal does not exist.");
    return row;
  }
}
