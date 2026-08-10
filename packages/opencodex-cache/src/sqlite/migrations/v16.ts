import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { createProjectIdentity } from "../../projectIdentity.js";

type ProjectMigrationRow = {
  id: string;
  source_id: string | null;
  path: string;
  default_name: string;
  display_name: string | null;
  is_hidden: number;
  preferences_json: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

/**
 * Makes project identity source-scoped instead of path-only.
 *
 * Projects with the same path can exist in different local, WSL, SSH, or custom
 * sources. The migration rewrites project ids and all known local references so
 * source-specific paths no longer collide.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
export function applySchemaMigrationV16(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(16);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  database.pragma("foreign_keys = OFF");
  const applyMigration = database.transaction(() => {
    const projectRows = database
      .prepare(
        `
        SELECT
          id,
          source_id,
          path,
          default_name,
          display_name,
          is_hidden,
          preferences_json,
          created_at,
          updated_at,
          last_seen_at
        FROM projects
        `
      )
      .all() as ProjectMigrationRow[];

    database.exec(`
      DROP TABLE IF EXISTS project_id_migrations;
      DROP TABLE IF EXISTS projects_next;

      CREATE TEMP TABLE project_id_migrations (
        old_id TEXT PRIMARY KEY,
        new_id TEXT NOT NULL
      );

      CREATE TABLE projects_next (
        id TEXT PRIMARY KEY,
        source_id TEXT,
        source_key TEXT NOT NULL DEFAULT 'orphan',
        path TEXT NOT NULL,
        default_name TEXT NOT NULL,
        display_name TEXT,
        is_hidden INTEGER NOT NULL DEFAULT 0,
        preferences_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        UNIQUE(source_key, path)
      );
    `);

    const insertProject = database.prepare(`
      INSERT INTO projects_next (
        id,
        source_id,
        source_key,
        path,
        default_name,
        display_name,
        is_hidden,
        preferences_json,
        created_at,
        updated_at,
        last_seen_at
      )
      VALUES (
        @id,
        @sourceId,
        @sourceKey,
        @path,
        @defaultName,
        @displayName,
        @isHidden,
        @preferencesJson,
        @createdAt,
        @updatedAt,
        @lastSeenAt
      )
      ON CONFLICT(source_key, path) DO UPDATE SET
        source_id = COALESCE(excluded.source_id, projects_next.source_id),
        default_name = excluded.default_name,
        display_name = COALESCE(projects_next.display_name, excluded.display_name),
        is_hidden = CASE
          WHEN excluded.is_hidden = 1 THEN 1
          ELSE projects_next.is_hidden
        END,
        preferences_json = COALESCE(projects_next.preferences_json, excluded.preferences_json),
        updated_at = MAX(projects_next.updated_at, excluded.updated_at),
        last_seen_at = MAX(projects_next.last_seen_at, excluded.last_seen_at)
    `);
    const insertMapping = database.prepare(`
      INSERT INTO project_id_migrations (old_id, new_id)
      VALUES (@oldId, @newId)
      ON CONFLICT(old_id) DO UPDATE SET new_id = excluded.new_id
    `);

    for (const row of projectRows) {
      const identity = createProjectIdentity(row.path, row.source_id);

      if (identity === null) {
        continue;
      }

      insertProject.run({
        id: identity.id,
        sourceId: row.source_id,
        sourceKey: identity.sourceKey,
        path: identity.path,
        defaultName: identity.defaultName,
        displayName: row.display_name,
        isHidden: row.is_hidden,
        preferencesJson: row.preferences_json,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastSeenAt: row.last_seen_at
      });
      insertMapping.run({
        oldId: row.id,
        newId: identity.id
      });
    }

    database.exec(`
      UPDATE threads
      SET project_id = (
        SELECT new_id FROM project_id_migrations WHERE old_id = threads.project_id
      )
      WHERE project_id IN (SELECT old_id FROM project_id_migrations);

      UPDATE project_commands
      SET project_id = (
        SELECT new_id FROM project_id_migrations WHERE old_id = project_commands.project_id
      )
      WHERE project_id IN (SELECT old_id FROM project_id_migrations);

      UPDATE project_tasks
      SET project_id = (
        SELECT new_id FROM project_id_migrations WHERE old_id = project_tasks.project_id
      )
      WHERE project_id IN (SELECT old_id FROM project_id_migrations);

      DROP TABLE projects;
      ALTER TABLE projects_next RENAME TO projects;

      CREATE INDEX IF NOT EXISTS idx_projects_source_path
        ON projects(source_id, path);
    `);

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(16, now);
  });

  applyMigration();
  database.pragma("foreign_keys = ON");
}
