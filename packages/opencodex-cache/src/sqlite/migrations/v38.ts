import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/** Adds the persistent project-level goal catalogue. */
export function applySchemaMigrationV38(database: BetterSqliteDatabase): void {
  if (database.prepare("SELECT version FROM schema_migrations WHERE version = 38").get() !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS project_goals (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        objective TEXT NOT NULL,
        token_budget INTEGER,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (
          status IN (
            'draft', 'active', 'paused', 'blocked',
            'usageLimited', 'budgetLimited', 'complete', 'error'
          )
        ),
        is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
        source_id TEXT,
        thread_id TEXT,
        workspace_id TEXT,
        cwd TEXT,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        time_used_seconds INTEGER NOT NULL DEFAULT 0,
        launched_at TEXT,
        paused_at TEXT,
        completed_at TEXT,
        archived_at TEXT,
        last_synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_project_goals_project_catalogue
        ON project_goals(project_id, is_archived, updated_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_goals_live_thread
        ON project_goals(thread_id)
        WHERE thread_id IS NOT NULL
          AND is_archived = 0
          AND status IN ('active', 'paused');
    `);
    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(38, now);
  });

  applyMigration();
}
