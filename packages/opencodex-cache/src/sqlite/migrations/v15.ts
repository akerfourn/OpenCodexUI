import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { addColumnIfMissing } from "./helpers.js";

/**
 * Adds stable user-defined ordering to project commands.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
export function applySchemaMigrationV15(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(15);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    addColumnIfMissing(database, "project_commands", "sort_order", "INTEGER");
    database.exec(`
      UPDATE project_commands
      SET sort_order = (
        SELECT COUNT(*)
        FROM project_commands AS earlier
        WHERE
          earlier.project_id = project_commands.project_id
          AND (
            earlier.created_at < project_commands.created_at
            OR (
              earlier.created_at = project_commands.created_at
              AND earlier.name <= project_commands.name
            )
          )
      ) - 1
      WHERE sort_order IS NULL;

      CREATE INDEX IF NOT EXISTS idx_project_commands_project_sort
        ON project_commands(project_id, sort_order ASC);
    `);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(15, now);
  });

  applyMigration();
}
