import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/** Adds durable debugger data without tying captured contexts to mutable catalogue rows. */
export function applySchemaMigrationV41(database: BetterSqliteDatabase): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 41").get() !== undefined) return;
  database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS debug_configurations (
        id TEXT PRIMARY KEY,
        context_key TEXT NOT NULL,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS debug_configurations_context ON debug_configurations(context_key);
      CREATE TABLE IF NOT EXISTS debug_breakpoints (
        context_key TEXT NOT NULL,
        id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        PRIMARY KEY (context_key, id)
      );
      CREATE TABLE IF NOT EXISTS debug_watches (
        expression TEXT PRIMARY KEY,
        position INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS debug_imports (
        name TEXT PRIMARY KEY
      );
    `);
    database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (41, ?)")
      .run(new Date().toISOString());
  })();
}
