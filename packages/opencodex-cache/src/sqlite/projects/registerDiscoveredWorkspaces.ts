import { defaultWorkspaceName } from "./workspaceName.js";
import { randomUUID } from "node:crypto";
import type { Database } from "better-sqlite3";
import type { OpenCodexWorkspaceDiscoverySkipped } from "@open-codex-ui/opencodex-protocol";

/** Publishes one verified discovery batch without merging projects or changing managed ownership. */
export function registerDiscoveredWorkspaces(
  database: Database, primaryWorkspaceId: string, sourceId: string, primaryPath: string, paths: string[]
): OpenCodexWorkspaceDiscoverySkipped[] {
  return database.transaction(() => {
    const primary = database.prepare(`SELECT project_id AS projectId FROM project_workspaces
      WHERE id = ? AND source_id = ? AND path = ? AND is_primary = 1 AND removed_at IS NULL`)
      .get(primaryWorkspaceId, sourceId, primaryPath) as { projectId: string } | undefined;
    if (primary === undefined) {
      throw new Error("Primary workspace changed during discovery; refresh before retrying.");
    }
    const skipped: OpenCodexWorkspaceDiscoverySkipped[] = [];
    for (const path of new Set(paths)) {
      const pending = database.prepare(`SELECT id FROM workspace_creations
        WHERE source_id = ? AND destination_path = ?`).get(sourceId, path);
      if (pending !== undefined) {
        skipped.push({ path, reason: "creationPending" });
        continue;
      }
      const known = database.prepare(`SELECT project_id AS projectId, removed_at AS removedAt
        FROM project_workspaces WHERE source_id = ? AND path = ?
        ORDER BY removed_at IS NOT NULL, id LIMIT 1`).get(sourceId, path) as
        { projectId: string; removedAt: string | null } | undefined;
      if (known !== undefined) {
        if (known.projectId !== primary.projectId) {
          skipped.push({ path, reason: "anotherProject" });
        } else if (known.removedAt !== null) {
          skipped.push({ path, reason: "removed" });
        }
        continue;
      }
      database.prepare(`INSERT INTO project_workspaces
        (id, project_id, source_id, source_key, path, name, is_primary, managed)
        VALUES (?, ?, ?, ?, ?, ?, 0, 0)`)
        .run(randomUUID(), primary.projectId, sourceId, sourceId, path, defaultWorkspaceName(path));
    }
    return skipped;
  })();
}
