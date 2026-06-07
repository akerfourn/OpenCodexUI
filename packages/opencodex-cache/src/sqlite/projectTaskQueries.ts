/**
 * Project task SQLite operations.
 */
import crypto from "node:crypto";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedProjectTask,
  CachedProjectTaskCreateInput,
  CachedProjectTaskStatus,
  CachedProjectTaskUpdateInput
} from "../types.js";
import { mapProjectTaskRow } from "./mappers.js";
import type { ProjectTaskRow } from "./rowTypes.js";

const taskStatuses = new Set<CachedProjectTaskStatus>([
  "todo",
  "inProgress",
  "toValidate",
  "done"
]);

/**
 * Lists local tasks configured for one project.
 *
 * @param database SQLite database connection.
 * @param projectId Project identifier.
 * @returns Project tasks ordered by status and update date.
 */
export async function listProjectTasks(
  database: BetterSqliteDatabase,
  projectId: string
): Promise<CachedProjectTask[]> {
  const rows = database
    .prepare(`
      SELECT
        id,
        project_id,
        title,
        description,
        status,
        created_at,
        updated_at
      FROM project_tasks
      WHERE project_id = @projectId
      ORDER BY
        CASE status
          WHEN 'inProgress' THEN 0
          WHEN 'toValidate' THEN 1
          WHEN 'todo' THEN 2
          WHEN 'done' THEN 3
          ELSE 4
        END,
        updated_at DESC,
        title ASC
    `)
    .all({ projectId }) as ProjectTaskRow[];

  return rows.map(mapProjectTaskRow);
}

/**
 * Creates a local project task.
 *
 * @param database SQLite database connection.
 * @param input Task input.
 * @returns Created task.
 */
export async function createProjectTask(
  database: BetterSqliteDatabase,
  input: CachedProjectTaskCreateInput
): Promise<CachedProjectTask> {
  const task = normalizeTaskInput(input);
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    projectId: task.projectId,
    title: task.title,
    description: task.description,
    status: task.status,
    createdAt: now,
    updatedAt: now
  };

  database
    .prepare(`
      INSERT INTO project_tasks (
        id,
        project_id,
        title,
        description,
        status,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @projectId,
        @title,
        @description,
        @status,
        @createdAt,
        @updatedAt
      )
    `)
    .run(row);

  return await readProjectTask(database, row.id);
}

/**
 * Updates a local project task.
 *
 * @param database SQLite database connection.
 * @param taskId Task identifier.
 * @param patch Task patch.
 * @returns Updated task.
 */
export async function updateProjectTask(
  database: BetterSqliteDatabase,
  taskId: string,
  patch: CachedProjectTaskUpdateInput
): Promise<CachedProjectTask> {
  const current = await readProjectTask(database, taskId);
  const next = normalizeTaskInput({
    projectId: current.projectId,
    title: patch.title ?? current.title,
    description: patch.description ?? current.description,
    status: patch.status ?? current.status
  });

  database
    .prepare(`
      UPDATE project_tasks SET
        title = @title,
        description = @description,
        status = @status,
        updated_at = @updatedAt
      WHERE id = @taskId
    `)
    .run({
      taskId,
      title: next.title,
      description: next.description,
      status: next.status,
      updatedAt: new Date().toISOString()
    });

  return await readProjectTask(database, taskId);
}

/**
 * Deletes one local project task.
 *
 * @param database SQLite database connection.
 * @param taskId Task identifier.
 * @returns Nothing.
 */
export async function deleteProjectTask(
  database: BetterSqliteDatabase,
  taskId: string
): Promise<void> {
  database.prepare("DELETE FROM project_tasks WHERE id = @taskId").run({ taskId });
}

async function readProjectTask(
  database: BetterSqliteDatabase,
  taskId: string
): Promise<CachedProjectTask> {
  const row = database
    .prepare(`
      SELECT
        id,
        project_id,
        title,
        description,
        status,
        created_at,
        updated_at
      FROM project_tasks
      WHERE id = @taskId
    `)
    .get({ taskId }) as ProjectTaskRow | undefined;

  if (row === undefined) {
    throw new Error("Project task not found.");
  }

  return mapProjectTaskRow(row);
}

function normalizeTaskInput(input: CachedProjectTaskCreateInput): CachedProjectTaskCreateInput {
  const projectId = input.projectId.trim();
  const title = input.title.trim();
  const description = input.description.trim();

  if (projectId.length === 0) {
    throw new Error("Project id is required.");
  }

  if (title.length === 0) {
    throw new Error("Task title is required.");
  }

  if (!taskStatuses.has(input.status)) {
    throw new Error("Task status is invalid.");
  }

  return {
    projectId,
    title,
    description,
    status: input.status
  };
}
