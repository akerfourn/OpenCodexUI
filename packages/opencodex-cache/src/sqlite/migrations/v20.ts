import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/**
 * Adds OpenCodexUI-managed project command authorization rules.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
export function applySchemaMigrationV20(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(20);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS project_command_rules (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        pattern_json TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('allow', 'prompt', 'forbidden')),
        justification TEXT,
        match_examples_json TEXT NOT NULL,
        not_match_examples_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_project_command_rules_project
        ON project_command_rules(project_id, created_at ASC);

      CREATE TABLE IF NOT EXISTS project_command_rule_file_states (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        generated_hash TEXT,
        generated_path TEXT,
        updated_at TEXT NOT NULL
      );
    `);

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(20, now);
  });

  applyMigration();
}
