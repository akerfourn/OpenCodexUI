import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { addColumnIfMissing } from "./helpers.js";

/** Preserves the previous UI limit while introducing explicit workspace concurrency. */
export function applySchemaMigrationV40(database: BetterSqliteDatabase): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 40").get() !== undefined) return;
  database.transaction(() => {
    const commandsTable = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_commands'").get();
    if (commandsTable !== undefined) {
      addColumnIfMissing(database, "project_commands", "execution_mode",
        "TEXT NOT NULL DEFAULT 'project' CHECK (execution_mode IN ('project', 'workspace', 'parallel'))");
      database.exec(`UPDATE project_commands
        SET execution_mode = CASE WHEN allow_parallel = 1 THEN 'parallel' ELSE 'project' END`);
    }
    database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (40, ?)")
      .run(new Date().toISOString());
  })();
}
