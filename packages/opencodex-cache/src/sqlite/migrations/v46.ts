import type { Database } from "better-sqlite3";
import { addColumnIfMissing } from "./helpers.js";

/** Adds manual work progress while retaining every existing workspace as active. */
export function applySchemaMigrationV46(database: Database): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 46").get() !== undefined) return;
  database.transaction(() => {
    addColumnIfMissing(database, "project_workspaces", "work_status",
      "TEXT NOT NULL DEFAULT 'active' CHECK(work_status IN ('active', 'completed'))");
    addColumnIfMissing(database, "project_workspaces", "completed_at", `TEXT CHECK(
      (work_status = 'active' AND completed_at IS NULL)
      OR (work_status = 'completed' AND completed_at IS NOT NULL))`);
    database.prepare("INSERT INTO schema_migrations VALUES (46, ?)").run(new Date().toISOString());
  })();
}
