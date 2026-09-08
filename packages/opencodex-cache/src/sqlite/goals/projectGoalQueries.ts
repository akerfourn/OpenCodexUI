/** Project goal SQLite operations. */
import crypto from "node:crypto";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedProjectGoal,
  CachedProjectGoalCreateInput,
  CachedProjectGoalUpdateInput
} from "../../types.js";
import { mapProjectGoalRow } from "../shared/mappers.js";
import type { ProjectGoalRow } from "../shared/rowTypes.js";

const MAX_GOAL_NAME_CHARACTERS = 120;
const MAX_GOAL_OBJECTIVE_CHARACTERS = 4_000;

/** Lists project goals, optionally including archived entries. */
export async function listProjectGoals(
  database: BetterSqliteDatabase,
  projectId: string,
  includeArchived = false
): Promise<CachedProjectGoal[]> {
  const normalizedProjectId = requireIdentifier(projectId, "Project id");
  const rows = database
    .prepare(`
      SELECT
        id,
        project_id,
        name,
        objective,
        token_budget,
        status,
        is_archived,
        source_id,
        thread_id,
        workspace_id,
        cwd,
        tokens_used,
        time_used_seconds,
        launched_at,
        paused_at,
        completed_at,
        archived_at,
        last_synced_at,
        created_at,
        updated_at
      FROM project_goals
      WHERE project_id = @projectId
        AND (@includeArchived = 1 OR is_archived = 0)
      ORDER BY
        CASE status
          WHEN 'active' THEN 0
          WHEN 'paused' THEN 1
          WHEN 'draft' THEN 2
          WHEN 'blocked' THEN 3
          WHEN 'usageLimited' THEN 4
          WHEN 'budgetLimited' THEN 5
          WHEN 'complete' THEN 6
          WHEN 'error' THEN 7
          ELSE 8
        END,
        updated_at DESC,
        created_at ASC,
        id ASC
    `)
    .all({
      projectId: normalizedProjectId,
      includeArchived: includeArchived ? 1 : 0
    }) as ProjectGoalRow[];

  return rows.map(mapProjectGoalRow);
}

/** Creates one draft goal, assigning a stable generic name when needed. */
export async function createProjectGoal(
  database: BetterSqliteDatabase,
  input: CachedProjectGoalCreateInput
): Promise<CachedProjectGoal> {
  const projectId = requireIdentifier(input.projectId, "Project id");
  const objective = normalizeObjective(input.objective);
  const tokenBudget = normalizeTokenBudget(input.tokenBudget);
  const name = normalizeGoalName(input.name) ?? findNextGenericGoalName(database, projectId);
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    projectId,
    name,
    objective,
    tokenBudget,
    createdAt: now,
    updatedAt: now
  };

  database
    .prepare(`
      INSERT INTO project_goals (
        id,
        project_id,
        name,
        objective,
        token_budget,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @projectId,
        @name,
        @objective,
        @tokenBudget,
        @createdAt,
        @updatedAt
      )
    `)
    .run(row);

  return await readProjectGoal(database, row.id);
}

/** Updates editable goal fields while preserving launched content. */
export async function updateProjectGoal(
  database: BetterSqliteDatabase,
  goalId: string,
  patch: CachedProjectGoalUpdateInput
): Promise<CachedProjectGoal> {
  const current = await readProjectGoal(database, goalId);
  let nextName = current.name;
  if (patch.name !== undefined) {
    nextName = normalizeRequiredGoalName(patch.name);
  }
  const hasContentPatch = patch.objective !== undefined || patch.tokenBudget !== undefined;

  if (current.launchedAt !== null && hasContentPatch) {
    throw new Error("A launched goal's objective and budget cannot be changed.");
  }

  const nextObjective = patch.objective === undefined
    ? current.objective
    : normalizeObjective(patch.objective);
  const nextTokenBudget = patch.tokenBudget === undefined
    ? current.tokenBudget
    : normalizeTokenBudget(patch.tokenBudget);

  const now = new Date().toISOString();
  database
    .prepare(`
      UPDATE project_goals SET
        name = @name,
        objective = @objective,
        token_budget = @tokenBudget,
        updated_at = @updatedAt
      WHERE id = @goalId
    `)
    .run({
      goalId: current.id,
      name: nextName,
      objective: nextObjective,
      tokenBudget: nextTokenBudget,
      updatedAt: now
    });

  return await readProjectGoal(database, current.id);
}

/** Archives a goal only after its native execution has stopped. */
export async function archiveProjectGoal(
  database: BetterSqliteDatabase,
  goalId: string
): Promise<CachedProjectGoal> {
  const current = await readProjectGoal(database, goalId);

  if (current.status === "active" || current.status === "paused") {
    throw new Error("An active or paused goal must be stopped before it can be archived.");
  }

  if (current.isArchived) {
    return current;
  }

  const now = new Date().toISOString();
  database
    .prepare(`
      UPDATE project_goals SET
        is_archived = 1,
        archived_at = @archivedAt,
        updated_at = @updatedAt
      WHERE id = @goalId
    `)
    .run({
      goalId: current.id,
      archivedAt: now,
      updatedAt: now
    });

  return await readProjectGoal(database, current.id);
}

/** Restores an archived goal without changing its lifecycle or content. */
export async function unarchiveProjectGoal(
  database: BetterSqliteDatabase,
  goalId: string
): Promise<CachedProjectGoal> {
  const current = await readProjectGoal(database, goalId);

  if (!current.isArchived) {
    return current;
  }

  database
    .prepare(`
      UPDATE project_goals SET
        is_archived = 0,
        archived_at = NULL,
        updated_at = @updatedAt
      WHERE id = @goalId
    `)
    .run({ goalId: current.id, updatedAt: new Date().toISOString() });

  return await readProjectGoal(database, current.id);
}

/** Deletes a draft while retaining launched goals for historical statistics. */
export async function deleteProjectGoal(
  database: BetterSqliteDatabase,
  goalId: string
): Promise<void> {
  const current = await readProjectGoal(database, goalId);

  if (current.launchedAt !== null) {
    throw new Error("A launched goal cannot be deleted; archive it instead.");
  }

  database.prepare("DELETE FROM project_goals WHERE id = @goalId").run({ goalId: current.id });
}

/** Reads one project goal or raises a stable not-found error. */
async function readProjectGoal(
  database: BetterSqliteDatabase,
  goalId: string
): Promise<CachedProjectGoal> {
  const normalizedGoalId = requireIdentifier(goalId, "Goal id");
  const row = database
    .prepare(`
      SELECT
        id,
        project_id,
        name,
        objective,
        token_budget,
        status,
        is_archived,
        source_id,
        thread_id,
        workspace_id,
        cwd,
        tokens_used,
        time_used_seconds,
        launched_at,
        paused_at,
        completed_at,
        archived_at,
        last_synced_at,
        created_at,
        updated_at
      FROM project_goals
      WHERE id = @goalId
    `)
    .get({ goalId: normalizedGoalId }) as ProjectGoalRow | undefined;

  if (row === undefined) {
    throw new Error("Project goal not found.");
  }

  return mapProjectGoalRow(row);
}

/** Validates a user-facing goal name, returning null for an omitted name. */
function normalizeGoalName(value: string): string | null {
  const name = value.trim();

  if (name.length === 0) {
    return null;
  }

  if (Array.from(name).length > MAX_GOAL_NAME_CHARACTERS) {
    throw new Error(`Goal name is limited to ${MAX_GOAL_NAME_CHARACTERS} characters.`);
  }

  return name;
}

/** Validates a non-empty objective against the native Codex limit. */
function normalizeObjective(value: string): string {
  const objective = value.trim();

  if (objective.length === 0) {
    throw new Error("Goal objective is required.");
  }

  if (Array.from(objective).length > MAX_GOAL_OBJECTIVE_CHARACTERS) {
    throw new Error(
      `Goal objective is limited to ${MAX_GOAL_OBJECTIVE_CHARACTERS} characters.`
    );
  }

  return objective;
}

/** Validates an optional positive integer budget. */
function normalizeTokenBudget(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Goal token budget must be a positive integer or null.");
  }

  return value;
}

/** Requires a non-empty identifier before it reaches a SQL query. */
function requireIdentifier(value: string, label: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new Error(`${label} is required.`);
  }

  return normalizedValue;
}

/** Validates a name explicitly supplied by an update. */
function normalizeRequiredGoalName(value: string): string {
  const name = normalizeGoalName(value);

  if (name === null) {
    throw new Error("Goal name is required.");
  }

  return name;
}

/** Finds the first generic name not currently used in the project. */
function findNextGenericGoalName(
  database: BetterSqliteDatabase,
  projectId: string
): string {
  const rows = database
    .prepare("SELECT name FROM project_goals WHERE project_id = @projectId")
    .all({ projectId }) as Array<{ name: string }>;
  const names = new Set(rows.map((row) => row.name));

  for (let index = 1; ; index += 1) {
    const candidate = `Goal ${index}`;

    if (!names.has(candidate)) {
      return candidate;
    }
  }
}
