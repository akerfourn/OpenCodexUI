import type { Database } from "better-sqlite3";
import { addColumnIfMissing } from "./helpers.js";

/** Distinguishes maintenance reservations from submissions that prove per-turn execution context. */
export function applySchemaMigrationV33(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 33").get() !== undefined) {
    return;
  }
  database.transaction(() => {
    addColumnIfMissing(database, "workspace_execution_reservations", "operation",
      "TEXT NOT NULL DEFAULT 'turn' CHECK(operation IN ('turn', 'review', 'compact', 'rollback'))");
    database.prepare("INSERT INTO schema_migrations VALUES (33, ?)").run(new Date().toISOString());
  })();
}
