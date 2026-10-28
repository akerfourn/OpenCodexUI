import type { Database } from "better-sqlite3";
import { addColumnIfMissing } from "./helpers.js";

/** Preserves existing commands as ungrouped non-favorites while adding project-local organization. */
export function applySchemaMigrationV49(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 49").get() !== undefined) return;
  database.transaction(() => {
    const commandsTable = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'project_commands'").get();
    if (commandsTable !== undefined) {
      addColumnIfMissing(database, "project_commands", "group_name", "TEXT CHECK(group_name IS NULL OR length(group_name) <= 100)");
      addColumnIfMissing(database, "project_commands", "is_favorite", "INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1))");
    }
    database.prepare("INSERT INTO schema_migrations VALUES (49, ?)").run(new Date().toISOString());
  })();
}
