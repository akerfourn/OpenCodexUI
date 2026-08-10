import type { Database as BetterSqliteDatabase } from "better-sqlite3";

/**
 * Adds the OpenCodexUI-only mixed project tree used for project groups.
 *
 * @param database SQLite database connection.
 * @returns Nothing.
 */
export function applySchemaMigrationV21(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(21);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS project_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT 'blue',
        is_collapsed INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_tree_items (
        item_type TEXT NOT NULL CHECK (item_type IN ('group', 'project')),
        group_id TEXT UNIQUE REFERENCES project_groups(id) ON DELETE CASCADE,
        project_id TEXT UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
        parent_group_id TEXT REFERENCES project_groups(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL,
        CHECK (
          (item_type = 'group' AND group_id IS NOT NULL AND project_id IS NULL)
          OR
          (item_type = 'project' AND project_id IS NOT NULL AND group_id IS NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_project_tree_items_parent_order
        ON project_tree_items(parent_group_id, sort_order);
    `);

    const projects = database
      .prepare(
        `
        SELECT
          projects.id,
          COALESCE(
            NULLIF(MAX(
              MAX(COALESCE(threads.updated_at, '')),
              MAX(COALESCE(turns.completed_at, '')),
              MAX(COALESCE(turns.started_at, ''))
            ), ''),
            projects.created_at
          ) AS edited_at,
          projects.path
        FROM projects
        LEFT JOIN threads ON threads.project_id = projects.id
        LEFT JOIN turns ON turns.thread_id = threads.id
        GROUP BY projects.id
        ORDER BY edited_at DESC, projects.path ASC
        `
      )
      .all() as Array<{ id: string }>;

    const insertProject = database.prepare(`
      INSERT INTO project_tree_items (
        item_type,
        project_id,
        parent_group_id,
        sort_order
      )
      VALUES ('project', @projectId, NULL, @sortOrder)
      ON CONFLICT(project_id) DO NOTHING
    `);

    for (const [sortOrder, project] of projects.entries()) {
      insertProject.run({ projectId: project.id, sortOrder });
    }

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(21, now);
  });

  applyMigration();
}
