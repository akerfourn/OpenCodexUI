import type { Database } from "better-sqlite3";

/** Makes principal workspaces permanent without changing identities, files or conversation history. */
export function applySchemaMigrationV47(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 47").get() !== undefined) return;
  database.transaction(() => {
    database.exec(`
      UPDATE project_workspaces SET work_status = 'active', completed_at = NULL
        WHERE is_primary = 1;

      CREATE TRIGGER IF NOT EXISTS primary_workspace_status_insert
      BEFORE INSERT ON project_workspaces
      WHEN NEW.is_primary = 1 AND (NEW.work_status <> 'active' OR NEW.completed_at IS NOT NULL)
      BEGIN
        SELECT RAISE(ABORT, 'Primary workspaces must remain active without a completion date.');
      END;

      CREATE TRIGGER IF NOT EXISTS primary_workspace_status_update
      BEFORE UPDATE OF is_primary, work_status, completed_at ON project_workspaces
      WHEN NEW.is_primary = 1 AND (NEW.work_status <> 'active' OR NEW.completed_at IS NOT NULL)
      BEGIN
        SELECT RAISE(ABORT, 'Primary workspaces must remain active without a completion date.');
      END;
    `);
    database.prepare("INSERT INTO schema_migrations VALUES (47, ?)").run(new Date().toISOString());
  })();
}
