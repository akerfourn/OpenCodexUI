/**
 * Project command SQLite operations.
 */
import crypto from "node:crypto";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedProjectCommand,
  CachedProjectCommandCreateInput,
  CachedProjectCommandUpdateInput
} from "../types.js";
import { mapProjectCommandRow } from "./mappers.js";
import type { ProjectCommandRow } from "./rowTypes.js";

/**
 * Lists commands configured for one project.
 *
 * @param database SQLite database connection.
 * @param projectId Project identifier.
 * @returns Project commands ordered by creation date.
 */
export async function listProjectCommands(
  database: BetterSqliteDatabase,
  projectId: string
): Promise<CachedProjectCommand[]> {
  const rows = database
    .prepare(`
      SELECT
        id,
        project_id,
        name,
        command,
        allow_parallel,
        persist_logs,
        created_at,
        updated_at
      FROM project_commands
      WHERE project_id = @projectId
      ORDER BY created_at ASC, name ASC
    `)
    .all({ projectId }) as ProjectCommandRow[];

  return rows.map(mapProjectCommandRow);
}

/**
 * Creates a project command.
 *
 * @param database SQLite database connection.
 * @param input Command input.
 * @returns Created command.
 */
export async function createProjectCommand(
  database: BetterSqliteDatabase,
  input: CachedProjectCommandCreateInput
): Promise<CachedProjectCommand> {
  const command = normalizeCommandInput(input);
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    projectId: command.projectId,
    name: command.name,
    command: command.command,
    allowParallel: command.allowParallel ? 1 : 0,
    persistLogs: command.persistLogs ? 1 : 0,
    createdAt: now,
    updatedAt: now
  };

  database
    .prepare(`
      INSERT INTO project_commands (
        id,
        project_id,
        name,
        command,
        allow_parallel,
        persist_logs,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @projectId,
        @name,
        @command,
        @allowParallel,
        @persistLogs,
        @createdAt,
        @updatedAt
      )
    `)
    .run(row);

  return await readProjectCommand(database, row.id);
}

/**
 * Updates a project command.
 *
 * @param database SQLite database connection.
 * @param commandId Command identifier.
 * @param patch Command patch.
 * @returns Updated command.
 */
export async function updateProjectCommand(
  database: BetterSqliteDatabase,
  commandId: string,
  patch: CachedProjectCommandUpdateInput
): Promise<CachedProjectCommand> {
  const current = await readProjectCommand(database, commandId);
  const next = normalizeCommandInput({
    projectId: current.projectId,
    name: patch.name ?? current.name,
    command: patch.command ?? current.command,
    allowParallel: patch.allowParallel ?? current.allowParallel,
    persistLogs: patch.persistLogs ?? current.persistLogs
  });

  database
    .prepare(`
      UPDATE project_commands SET
        name = @name,
        command = @command,
        allow_parallel = @allowParallel,
        persist_logs = @persistLogs,
        updated_at = @updatedAt
      WHERE id = @commandId
    `)
    .run({
      commandId,
      name: next.name,
      command: next.command,
      allowParallel: next.allowParallel ? 1 : 0,
      persistLogs: next.persistLogs ? 1 : 0,
      updatedAt: new Date().toISOString()
    });

  return await readProjectCommand(database, commandId);
}

/**
 * Deletes one project command.
 *
 * @param database SQLite database connection.
 * @param commandId Command identifier.
 * @returns Nothing.
 */
export async function deleteProjectCommand(
  database: BetterSqliteDatabase,
  commandId: string
): Promise<void> {
  database.prepare("DELETE FROM project_commands WHERE id = @commandId").run({ commandId });
}

/**
 * Reads one project command.
 *
 * @param database SQLite database connection.
 * @param commandId Command identifier.
 * @returns Project command.
 */
export async function readProjectCommand(
  database: BetterSqliteDatabase,
  commandId: string
): Promise<CachedProjectCommand> {
  const row = database
    .prepare(`
      SELECT
        id,
        project_id,
        name,
        command,
        allow_parallel,
        persist_logs,
        created_at,
        updated_at
      FROM project_commands
      WHERE id = @commandId
    `)
    .get({ commandId }) as ProjectCommandRow | undefined;

  if (row === undefined) {
    throw new Error("Project command not found.");
  }

  return mapProjectCommandRow(row);
}

function normalizeCommandInput(
  input: CachedProjectCommandCreateInput
): CachedProjectCommandCreateInput {
  const projectId = input.projectId.trim();
  const name = input.name.trim();
  const command = input.command.trim();

  if (projectId.length === 0) {
    throw new Error("Project id is required.");
  }

  if (name.length === 0) {
    throw new Error("Command name is required.");
  }

  if (command.length === 0) {
    throw new Error("Command is required.");
  }

  return {
    projectId,
    name,
    command,
    allowParallel: input.allowParallel,
    persistLogs: input.persistLogs
  };
}
