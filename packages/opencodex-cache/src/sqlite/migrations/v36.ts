import { defaultWorkspaceName } from "../projects/workspaceName.js";
import type { Database } from "better-sqlite3";

/** Adds display metadata without changing any workspace or thread association. */
export function applySchemaMigrationV36(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 36").get() !== undefined) return;
  database.transaction(() => {
    database.exec(`
      ALTER TABLE project_workspaces ADD COLUMN name TEXT;
      ALTER TABLE workspace_creations ADD COLUMN name TEXT;
    `);
    const workspaces = database.prepare("SELECT id, path FROM project_workspaces WHERE is_primary = 0")
      .all() as { id: string; path: string }[];
    const update = database.prepare("UPDATE project_workspaces SET name = ? WHERE id = ?");
    for (const workspace of workspaces) update.run(defaultWorkspaceName(workspace.path), workspace.id);
    database.prepare("INSERT INTO schema_migrations VALUES (36, ?)").run(new Date().toISOString());
  })();
}
