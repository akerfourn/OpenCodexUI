/**
 * Project command SQLite operations.
 */
import crypto from "node:crypto";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedProjectCommand,
  CachedProjectCommandCreateInput,
  CachedProjectCommandReorderInput,
  CachedProjectCommandUpdateInput
} from "../types.js";
import { mapProjectCommandRow } from "./mappers.js";
import type { ProjectCommandRow } from "./rowTypes.js";

/**
 * Lists commands configured for one project.
 *
 * @param database SQLite database connection.
 * @param projectId Project identifier.
 * @returns Project commands ordered by user-defined order.
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
        sort_order,
        created_at,
        updated_at
      FROM project_commands
      WHERE project_id = @projectId
      ORDER BY sort_order ASC, created_at ASC, name ASC
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
  const sortOrder = readNextSortOrder(database, command.projectId);
  const row = {
    id: crypto.randomUUID(),
    projectId: command.projectId,
    name: command.name,
    command: command.command,
    allowParallel: command.allowParallel ? 1 : 0,
    persistLogs: command.persistLogs ? 1 : 0,
    sortOrder,
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
        sort_order,
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
        @sortOrder,
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
 * Persists a new order for project commands.
 *
 * @param database SQLite database connection.
 * @param input Reorder input.
 * @returns Commands in their persisted order.
 */
export async function reorderProjectCommands(
  database: BetterSqliteDatabase,
  input: CachedProjectCommandReorderInput
): Promise<CachedProjectCommand[]> {
  const projectId = input.projectId.trim();

  if (projectId.length === 0) {
    throw new Error("Project id is required.");
  }

  const existingCommands = await listProjectCommands(database, projectId);
  const existingIds = new Set(existingCommands.map((command) => command.id));
  const nextIds = input.commandIds.filter((commandId) => existingIds.has(commandId));

  for (const command of existingCommands) {
    if (!nextIds.includes(command.id)) {
      nextIds.push(command.id);
    }
  }

  const updateOrders = database.transaction(() => {
    const statement = database.prepare(`
      UPDATE project_commands
      SET sort_order = @sortOrder,
          updated_at = @updatedAt
      WHERE project_id = @projectId AND id = @commandId
    `);
    const updatedAt = new Date().toISOString();

    nextIds.forEach((commandId, sortOrder) => {
      statement.run({
        projectId,
        commandId,
        sortOrder,
        updatedAt
      });
    });
  });

  updateOrders();

  return await listProjectCommands(database, projectId);
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
        sort_order,
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

function readNextSortOrder(database: BetterSqliteDatabase, projectId: string): number {
  const row = database
    .prepare(`
      SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order
      FROM project_commands
      WHERE project_id = @projectId
    `)
    .get({ projectId }) as { next_sort_order: number } | undefined;

  return row?.next_sort_order ?? 0;
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
