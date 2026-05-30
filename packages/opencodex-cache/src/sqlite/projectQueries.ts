/**
 * Project-related SQLite operations.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { createProjectIdentity } from "../projectIdentity.js";
import type { CachedProject, CachedProjectPreferences } from "../types.js";
import { mapProjectRow } from "./mappers.js";
import { serializeProjectPreferences } from "./projectPreferences.js";
import type { ProjectRow } from "./rowTypes.js";

/**
 * Inserts or updates a project row by normalized path.
 *
 * @param database SQLite database connection.
 * @param projectPath Project path to cache.
 * @param sourceId Optional owning source identifier.
 *
 * @returns Cached project row.
 */
export async function upsertProject(
  database: BetterSqliteDatabase,
  projectPath: string,
  sourceId: string | null = null
): Promise<CachedProject> {
  const project = createProjectIdentity(projectPath);

  if (project === null) {
    throw new Error("Project path is required.");
  }

  const now = new Date().toISOString();
  database
    .prepare(
      `
      INSERT INTO projects (
        id,
        source_id,
        path,
        default_name,
        display_name,
        is_hidden,
        created_at,
        updated_at,
        last_seen_at
      )
      VALUES (
        @id,
        @sourceId,
        @path,
        @defaultName,
        NULL,
        0,
        @now,
        @now,
        @now
      )
      ON CONFLICT(path) DO UPDATE SET
        source_id = COALESCE(excluded.source_id, projects.source_id),
        default_name = excluded.default_name,
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at
      `
    )
    .run({ ...project, sourceId, now });

  const row = database
    .prepare(
      `
      SELECT
        projects.*,
        COALESCE(MAX(threads.updated_at), projects.created_at) AS edited_at
      FROM projects
      LEFT JOIN threads ON threads.project_id = projects.id
      WHERE path = @path
      GROUP BY projects.id
      `
    )
    .get({ path: project.path }) as ProjectRow | undefined;

  if (row === undefined) {
    throw new Error("Project could not be read after being cached.");
  }

  return mapProjectRow(row);
}

/**
 * Lists cached projects sorted by recent activity.
 *
 * @param database SQLite database connection.
 *
 * @returns Cached project rows.
 */
export async function listProjects(database: BetterSqliteDatabase): Promise<CachedProject[]> {
  const rows = database
    .prepare(
      `
      SELECT
        projects.*,
        COALESCE(MAX(threads.updated_at), projects.created_at) AS edited_at
      FROM projects
      LEFT JOIN threads ON threads.project_id = projects.id
      GROUP BY projects.id
      ORDER BY edited_at DESC, projects.path ASC
      `
    )
    .all() as ProjectRow[];

  return rows.map((row) => mapProjectRow(row));
}

/**
 * Updates the hidden flag for a cached project.
 *
 * @param database SQLite database connection.
 * @param projectId Project identifier.
 * @param isHidden Whether the project should be hidden.
 *
 * @returns Promise resolved when the update completes.
 */
export async function setProjectHidden(
  database: BetterSqliteDatabase,
  projectId: string,
  isHidden: boolean
): Promise<void> {
  database
    .prepare(
      `
      UPDATE projects SET
        is_hidden = @isHidden,
        updated_at = @updatedAt
      WHERE id = @projectId
      `
    )
    .run({
      projectId,
      isHidden: isHidden ? 1 : 0,
      updatedAt: new Date().toISOString()
    });
}

/**
 * Updates the stored preferences for one cached project.
 *
 * @param database SQLite database connection.
 * @param projectId Project identifier.
 * @param preferences Preferences to store.
 *
 * @returns Updated project, or `null` when no project matches.
 */
export async function updateProjectPreferences(
  database: BetterSqliteDatabase,
  projectId: string,
  preferences: CachedProjectPreferences
): Promise<CachedProject | null> {
  database
    .prepare(
      `
      UPDATE projects SET
        preferences_json = @preferencesJson,
        updated_at = @updatedAt
      WHERE id = @projectId
      `
    )
    .run({
      projectId,
      preferencesJson: serializeProjectPreferences(preferences),
      updatedAt: new Date().toISOString()
    });

  return readProjectById(database, projectId);
}

/**
 * Deletes a cached project row.
 *
 * Cached threads remain in the database and become orphaned through the
 * existing foreign-key `ON DELETE SET NULL` behavior.
 *
 * @param database SQLite database connection.
 * @param projectId Project identifier.
 *
 * @returns Promise resolved when the row is deleted.
 */
export async function deleteProject(
  database: BetterSqliteDatabase,
  projectId: string
): Promise<void> {
  database
    .prepare("DELETE FROM projects WHERE id = @projectId")
    .run({ projectId });
}

function readProjectById(database: BetterSqliteDatabase, projectId: string): CachedProject | null {
  const row = database
    .prepare(
      `
      SELECT
        projects.*,
        COALESCE(MAX(threads.updated_at), projects.created_at) AS edited_at
      FROM projects
      LEFT JOIN threads ON threads.project_id = projects.id
      WHERE projects.id = @projectId
      GROUP BY projects.id
      `
    )
    .get({ projectId }) as ProjectRow | undefined;

  return row === undefined ? null : mapProjectRow(row);
}
