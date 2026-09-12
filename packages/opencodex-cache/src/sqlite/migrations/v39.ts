import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { addColumnIfMissing } from "./helpers.js";

const LEGACY_PERFORMANCE_MESSAGES = [
  "Performance slowdown detected",
  "Ralentissement de performance détecté"
] as const;

/** Adds log categories and classifies the two historical performance messages. */
export function applySchemaMigrationV39(database: BetterSqliteDatabase): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 39").get() !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    const logsTable = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'logs'")
      .get() as { name: string } | undefined;

    if (logsTable !== undefined) {
      addColumnIfMissing(database, "logs", "category", "TEXT");
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_logs_category_created
          ON logs(category, created_at DESC, id DESC);
      `);
      database
        .prepare(`
          UPDATE logs
          SET category = 'performanceSlowdown'
          WHERE category IS NULL
            AND type = 'warning'
            AND message IN (?, ?)
        `)
        .run(...LEGACY_PERFORMANCE_MESSAGES);
    }
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(39, now);
  });

  applyMigration();
}
