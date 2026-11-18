import type { Database } from "better-sqlite3";

/** Adds durable automatic deletion while preserving all existing removal reservations and guards. */
export function applySchemaMigrationV54(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 54").get() !== undefined) return;
  database.transaction(() => {
    // Rebuild the repository uniqueness constraint so several waiting checkouts can share one repository.
    const triggers = database.prepare(`SELECT name, sql FROM sqlite_master
      WHERE type = 'trigger' AND sql LIKE '%workspace_removals%'`).all() as { name: string; sql: string }[];
    for (const trigger of triggers) database.exec(`DROP TRIGGER "${trigger.name.replaceAll('"', '""')}"`);
    database.exec(`
      CREATE TABLE workspace_removals_v54 (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL UNIQUE REFERENCES project_workspaces(id) ON DELETE RESTRICT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
        source_id TEXT NOT NULL,
        primary_workspace_id TEXT NOT NULL REFERENCES project_workspaces(id) ON DELETE RESTRICT,
        project_path TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        repository_path TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('preparing', 'submitting', 'uncertain')),
        git_exit_code INTEGER,
        deferred_state TEXT CHECK(deferred_state IN ('queued', 'blocked', 'processing')),
        requested_at TEXT,
        blocked_reason TEXT,
        CHECK(deferred_state NOT IN ('queued', 'blocked') OR (state = 'preparing' AND git_exit_code IS NULL))
      );
      INSERT INTO workspace_removals_v54
        (id, workspace_id, project_id, source_id, primary_workspace_id, project_path,
          workspace_path, repository_path, state, git_exit_code)
        SELECT id, workspace_id, project_id, source_id, primary_workspace_id, project_path,
          workspace_path, repository_path, state, git_exit_code FROM workspace_removals;
      DROP TABLE workspace_removals;
      ALTER TABLE workspace_removals_v54 RENAME TO workspace_removals;
      CREATE UNIQUE INDEX workspace_removals_active_repository ON workspace_removals(source_id, repository_path)
        WHERE deferred_state IS NULL OR deferred_state = 'processing';
    `);
    for (const trigger of triggers) database.exec(trigger.sql);
    database.prepare("INSERT INTO schema_migrations VALUES (54, ?)").run(new Date().toISOString());
  })();
}
