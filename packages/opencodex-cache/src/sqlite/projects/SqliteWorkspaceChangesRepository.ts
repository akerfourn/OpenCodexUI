import type { Database } from "better-sqlite3";
import type { OpenCodexWorkspaceChanges } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceChangesInput, WorkspaceChangesRepository } from "../../types/workspaceChanges.js";

interface ObservationRow extends Omit<WorkspaceChangesInput, "hasChanges"> {
  lastChangedAt: string | null;
  hasChanges: number;
}

/** Reads only observations matching the current source/path; relocation requires a new baseline. */
export function readWorkspaceChanges(database: Database, workspaceId: string): OpenCodexWorkspaceChanges | null {
  const row = readRow(database, workspaceId);
  if (row === undefined) return null;
  return { projectId: row.projectId, workspaceId: row.workspaceId, sourceId: row.sourceId,
    workspacePath: row.workspacePath, checkedAt: row.checkedAt, lastChangedAt: row.lastChangedAt,
    hasChanges: row.hasChanges === 1, state: "cached" };
}

/** Keeps fingerprints internal to persistence and excludes removed or relocated observations. */
function readRow(database: Database, workspaceId: string): ObservationRow | undefined {
  return database.prepare(`SELECT o.workspace_id AS workspaceId, o.project_id AS projectId, o.source_id AS sourceId,
    o.workspace_path AS workspacePath, o.fingerprint, o.checked_at AS checkedAt,
    o.last_changed_at AS lastChangedAt, o.has_changes AS hasChanges
    FROM workspace_change_observations o JOIN project_workspaces w ON w.id = o.workspace_id
    WHERE w.id = ? AND w.source_id = o.source_id AND w.path = o.workspace_path
      AND w.project_id = o.project_id AND w.removed_at IS NULL`).get(workspaceId) as ObservationRow | undefined;
}

/** Compares complete checkpoints atomically; partial or failed scans never update the baseline. */
export class SqliteWorkspaceChangesRepository implements WorkspaceChangesRepository {
  /** Shares the cache connection for context validation and observation publication. */
  constructor(private readonly database: Database) {}

  /** Returns the last complete observation for offline display. */
  async get(workspaceId: string): Promise<OpenCodexWorkspaceChanges | null> {
    return readWorkspaceChanges(this.database, workspaceId);
  }

  /** Rejects stale contexts and backwards clocks, and preserves unchanged activity dates across restarts. */
  async observe(input: WorkspaceChangesInput): Promise<OpenCodexWorkspaceChanges> {
    return this.database.transaction(() => {
      const time = Date.parse(input.checkedAt);
      if (!/^[a-f0-9]{64}$/u.test(input.fingerprint) || !Number.isFinite(time) || typeof input.hasChanges !== "boolean") {
        throw new Error("Invalid workspace change observation.");
      }
      const workspace = this.database.prepare(`SELECT id FROM project_workspaces WHERE id = ? AND project_id = ?
        AND source_id = ? AND path = ? AND removed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM workspace_moves WHERE workspace_id = ? OR primary_workspace_id = ?
          OR (project_id = ? AND primary_snapshot IS NOT NULL))
        AND NOT EXISTS (SELECT 1 FROM workspace_removals WHERE workspace_id = ?)`).get(
        input.workspaceId, input.projectId, input.sourceId, input.workspacePath,
        input.workspaceId, input.workspaceId, input.projectId, input.workspaceId);
      if (workspace === undefined) throw new Error("Workspace changed or has pending maintenance. Refresh before checking changes.");
      const previous = readRow(this.database, input.workspaceId);
      const history = this.database.prepare(`SELECT checked_at AS checkedAt, last_changed_at AS lastChangedAt
        FROM workspace_change_observations WHERE workspace_id = ? AND project_id = ? AND source_id = ?`)
        .get(input.workspaceId, input.projectId, input.sourceId) as { checkedAt: string; lastChangedAt: string | null } | undefined;
      if (history !== undefined && Date.parse(history.checkedAt) > time) throw new Error("Workspace observation clock moved backwards.");
      let lastChangedAt = history?.lastChangedAt ?? null;
      if (previous !== undefined && previous.fingerprint !== input.fingerprint) lastChangedAt = input.checkedAt;
      this.database.prepare(`INSERT INTO workspace_change_observations
        (workspace_id, project_id, source_id, workspace_path, fingerprint, checked_at, last_changed_at, has_changes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET
        project_id = excluded.project_id, source_id = excluded.source_id, workspace_path = excluded.workspace_path,
        fingerprint = excluded.fingerprint, checked_at = excluded.checked_at,
        last_changed_at = excluded.last_changed_at, has_changes = excluded.has_changes`).run(
        input.workspaceId, input.projectId, input.sourceId, input.workspacePath, input.fingerprint,
        input.checkedAt, lastChangedAt, Number(input.hasChanges));
      return { ...readWorkspaceChanges(this.database, input.workspaceId)!, state: "checked" as const };
    })();
  }
}
