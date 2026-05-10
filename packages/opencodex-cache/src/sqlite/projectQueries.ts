/**
 * Project-related SQLite operations.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { createProjectIdentity } from "../projectIdentity.js";
import type { CachedProject } from "../types.js";
import { mapProjectRow } from "./mappers.js";
import type { ProjectRow } from "./rowTypes.js";

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

