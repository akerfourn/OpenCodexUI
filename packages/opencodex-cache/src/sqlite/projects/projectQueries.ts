/**
 * Project-related SQLite operations.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { createProjectIdentity } from "../../projectIdentity.js";
import type { CachedProject, CachedProjectPreferences } from "../../types.js";
import { ensureProjectTreeItem } from "./projectGroupQueries.js";
import { mapProjectRow } from "../shared/mappers.js";
import { serializeProjectPreferences } from "./projectPreferences.js";
import type { ProjectRow } from "../shared/rowTypes.js";

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
  const project = createProjectIdentity(projectPath, sourceId);

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
        source_key,
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
        @sourceKey,
        @path,
        @defaultName,
        NULL,
        0,
        @now,
        @now,
        @now
      )
      ON CONFLICT(source_key, path) DO UPDATE SET
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
        COALESCE(
          NULLIF(MAX(
            MAX(COALESCE(threads.updated_at, '')),
            MAX(COALESCE(turns.completed_at, '')),
            MAX(COALESCE(turns.started_at, ''))
          ), ''),
          projects.created_at
        ) AS edited_at
      FROM projects
      LEFT JOIN threads ON threads.project_id = projects.id
      LEFT JOIN turns ON turns.thread_id = threads.id
      WHERE projects.source_key = @sourceKey AND projects.path = @path
      GROUP BY projects.id
      `
    )
    .get({ sourceKey: project.sourceKey, path: project.path }) as ProjectRow | undefined;

  if (row === undefined) {
    throw new Error("Project could not be read after being cached.");
  }

  ensureProjectTreeItem(database, row.id);
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
        COALESCE(
          NULLIF(MAX(
            MAX(COALESCE(threads.updated_at, '')),
            MAX(COALESCE(turns.completed_at, '')),
            MAX(COALESCE(turns.started_at, ''))
          ), ''),
          projects.created_at
        ) AS edited_at
      FROM projects
      LEFT JOIN threads ON threads.project_id = projects.id
      LEFT JOIN turns ON turns.thread_id = threads.id
      GROUP BY projects.id
      ORDER BY edited_at DESC, projects.path ASC
      `
    )
    .all() as ProjectRow[];

  return rows.map((row) => mapProjectRow(row));
}

/**
 * Deletes empty orphan projects when an equivalent active source project exists.
 *
 * @param database SQLite database connection.
 * @returns Number of removed project rows.
 */
export async function deleteRedundantOrphanProjects(
  database: BetterSqliteDatabase
): Promise<number> {
  const result = database
    .prepare(
      `
      DELETE FROM projects
      WHERE source_key = 'orphan'
        AND source_id IS NULL
        AND display_name IS NULL
        AND is_hidden = 0
        AND preferences_json IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM threads
          WHERE threads.project_id = projects.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM project_commands
          WHERE project_commands.project_id = projects.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM project_tasks
          WHERE project_tasks.project_id = projects.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM project_command_rules
          WHERE project_command_rules.project_id = projects.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM project_command_rule_file_states
          WHERE project_command_rule_file_states.project_id = projects.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM project_tree_items
          WHERE project_tree_items.project_id = projects.id
            AND project_tree_items.parent_group_id IS NOT NULL
        )
        AND EXISTS (
          SELECT 1
          FROM projects AS source_projects
          INNER JOIN sources
            ON sources.id = source_projects.source_id
          WHERE source_projects.path = projects.path
            AND source_projects.source_id IS NOT NULL
            AND source_projects.source_key <> 'orphan'
        )
      `
    )
    .run();

  return result.changes;
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
 * Updates the optional display name for one cached project.
 *
 * @param database SQLite database connection.
 * @param projectId Project identifier.
 * @param displayName User-defined display name, or `null` to reset.
 *
 * @returns Updated project, or `null` when no project matches.
 */
export async function updateProjectDisplayName(
  database: BetterSqliteDatabase,
  projectId: string,
  displayName: string | null
): Promise<CachedProject | null> {
  const normalizedDisplayName = displayName?.trim() || null;

  database
    .prepare(
      `
      UPDATE projects SET
        display_name = @displayName,
        updated_at = @updatedAt
      WHERE id = @projectId
      `
    )
    .run({
      projectId,
      displayName: normalizedDisplayName,
      updatedAt: new Date().toISOString()
    });

  return readProjectById(database, projectId);
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

/**
 * Reads one cached project by identifier.
 *
 * @param database SQLite database connection.
 * @param projectId Project identifier.
 * @returns Cached project, or `null` when missing.
 */
function readProjectById(database: BetterSqliteDatabase, projectId: string): CachedProject | null {
  const row = database
    .prepare(
      `
      SELECT
        projects.*,
        COALESCE(
          NULLIF(MAX(
            MAX(COALESCE(threads.updated_at, '')),
            MAX(COALESCE(turns.completed_at, '')),
            MAX(COALESCE(turns.started_at, ''))
          ), ''),
          projects.created_at
        ) AS edited_at
      FROM projects
      LEFT JOIN threads ON threads.project_id = projects.id
      LEFT JOIN turns ON turns.thread_id = threads.id
      WHERE projects.id = @projectId
      GROUP BY projects.id
      `
    )
    .get({ projectId }) as ProjectRow | undefined;

  return row === undefined ? null : mapProjectRow(row);
}
