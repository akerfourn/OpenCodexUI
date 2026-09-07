import type { Database } from "better-sqlite3";

/** Keeps automatic storage intent stable across settings edits and creation recovery. */
export function applySchemaMigrationV37(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 37").get() !== undefined) return;
  database.transaction(() => {
    database.exec("ALTER TABLE workspace_creations ADD COLUMN root_path TEXT");
    database.prepare("INSERT INTO schema_migrations VALUES (37, ?)").run(new Date().toISOString());
  })();
}
