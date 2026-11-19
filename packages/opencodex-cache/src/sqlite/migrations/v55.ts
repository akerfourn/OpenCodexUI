import type { Database } from "better-sqlite3";

/** Records explicit destructive consent without enabling force on any existing removal. */
export function applySchemaMigrationV55(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 55").get() !== undefined) return;
  database.transaction(() => {
    database.exec(`ALTER TABLE workspace_removals ADD COLUMN force INTEGER NOT NULL DEFAULT 0 CHECK(force IN (0, 1));`);
    database.prepare("INSERT INTO schema_migrations VALUES (55, ?)").run(new Date().toISOString());
  })();
}
