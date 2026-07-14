/**
 * SQLite operations for OpenCodexUI-managed project command rules.
 */
import crypto from "node:crypto";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedCommandRuleDecision,
  CachedProjectCommandRule,
  CachedProjectCommandRuleCreateInput,
  CachedProjectCommandRuleFileState,
  CachedProjectCommandRuleUpdateInput
} from "../types.js";
import {
  mapProjectCommandRuleFileStateRow,
  mapProjectCommandRuleRow
} from "./mappers.js";
import type {
  ProjectCommandRuleFileStateRow,
  ProjectCommandRuleRow
} from "./rowTypes.js";

const ruleDecisions = new Set<CachedCommandRuleDecision>([
  "allow",
  "prompt",
  "forbidden"
]);

/**
 * Lists command rules configured for one project.
 *
 * @param database SQLite database connection.
 * @param projectId Project identifier.
 * @returns Project rules ordered by creation date.
 */
export async function listProjectCommandRules(
  database: BetterSqliteDatabase,
  projectId: string
): Promise<CachedProjectCommandRule[]> {
  const rows = database
    .prepare(`
      SELECT
        id,
        project_id,
        name,
        pattern_json,
        decision,
        justification,
        match_examples_json,
        not_match_examples_json,
        enabled,
        created_at,
        updated_at
      FROM project_command_rules
      WHERE project_id = @projectId
      ORDER BY created_at ASC, name ASC
    `)
    .all({ projectId }) as ProjectCommandRuleRow[];

  return rows.map(mapProjectCommandRuleRow);
}

/**
 * Creates a project command rule.
 *
 * @param database SQLite database connection.
 * @param input Rule input.
 * @returns Created rule.
 */
export async function createProjectCommandRule(
  database: BetterSqliteDatabase,
  input: CachedProjectCommandRuleCreateInput
): Promise<CachedProjectCommandRule> {
  const rule = normalizeRuleInput(input);
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    projectId: rule.projectId,
    name: rule.name,
    patternJson: JSON.stringify(rule.pattern),
    decision: rule.decision,
    justification: rule.justification,
    matchExamplesJson: JSON.stringify(rule.matchExamples),
    notMatchExamplesJson: JSON.stringify(rule.notMatchExamples),
    enabled: rule.enabled ? 1 : 0,
    createdAt: now,
    updatedAt: now
  };

  database
    .prepare(`
      INSERT INTO project_command_rules (
        id,
        project_id,
        name,
        pattern_json,
        decision,
        justification,
        match_examples_json,
        not_match_examples_json,
        enabled,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @projectId,
        @name,
        @patternJson,
        @decision,
        @justification,
        @matchExamplesJson,
        @notMatchExamplesJson,
        @enabled,
        @createdAt,
        @updatedAt
      )
    `)
    .run(row);

  return await readProjectCommandRule(database, row.id);
}

/**
 * Updates a project command rule.
 *
 * @param database SQLite database connection.
 * @param ruleId Rule identifier.
 * @param patch Rule update.
 * @returns Updated rule.
 */
export async function updateProjectCommandRule(
  database: BetterSqliteDatabase,
  ruleId: string,
  patch: CachedProjectCommandRuleUpdateInput
): Promise<CachedProjectCommandRule> {
  const current = await readProjectCommandRule(database, ruleId);
  const next = normalizeRuleInput({
    projectId: current.projectId,
    name: patch.name ?? current.name,
    pattern: patch.pattern ?? current.pattern,
    decision: patch.decision ?? current.decision,
    justification: patch.justification === undefined
      ? current.justification
      : patch.justification,
    matchExamples: patch.matchExamples ?? current.matchExamples,
    notMatchExamples: patch.notMatchExamples ?? current.notMatchExamples,
    enabled: patch.enabled ?? current.enabled
  });

  database
    .prepare(`
      UPDATE project_command_rules SET
        name = @name,
        pattern_json = @patternJson,
        decision = @decision,
        justification = @justification,
        match_examples_json = @matchExamplesJson,
        not_match_examples_json = @notMatchExamplesJson,
        enabled = @enabled,
        updated_at = @updatedAt
      WHERE id = @ruleId
    `)
    .run({
      ruleId,
      name: next.name,
      patternJson: JSON.stringify(next.pattern),
      decision: next.decision,
      justification: next.justification,
      matchExamplesJson: JSON.stringify(next.matchExamples),
      notMatchExamplesJson: JSON.stringify(next.notMatchExamples),
      enabled: next.enabled ? 1 : 0,
      updatedAt: new Date().toISOString()
    });

  return await readProjectCommandRule(database, ruleId);
}

/**
 * Deletes a project command rule.
 *
 * @param database SQLite database connection.
 * @param ruleId Rule identifier.
 * @returns Nothing.
 */
export async function deleteProjectCommandRule(
  database: BetterSqliteDatabase,
  ruleId: string
): Promise<void> {
  database.prepare("DELETE FROM project_command_rules WHERE id = @ruleId").run({ ruleId });
}

/**
 * Reads one project command rule.
 *
 * @param database SQLite database connection.
 * @param ruleId Rule identifier.
 * @returns Matching rule.
 */
export async function readProjectCommandRule(
  database: BetterSqliteDatabase,
  ruleId: string
): Promise<CachedProjectCommandRule> {
  const row = database
    .prepare(`
      SELECT
        id,
        project_id,
        name,
        pattern_json,
        decision,
        justification,
        match_examples_json,
        not_match_examples_json,
        enabled,
        created_at,
        updated_at
      FROM project_command_rules
      WHERE id = @ruleId
    `)
    .get({ ruleId }) as ProjectCommandRuleRow | undefined;

  if (row === undefined) {
    throw new Error("Project command rule not found.");
  }

  return mapProjectCommandRuleRow(row);
}

/**
 * Reads generated-file synchronization metadata for one project.
 *
 * @param database SQLite database connection.
 * @param projectId Project identifier.
 * @returns File state, or `null` when no state exists.
 */
export async function getProjectCommandRuleFileState(
  database: BetterSqliteDatabase,
  projectId: string
): Promise<CachedProjectCommandRuleFileState | null> {
  const row = database
    .prepare(`
      SELECT project_id, generated_hash, generated_path, updated_at
      FROM project_command_rule_file_states
      WHERE project_id = @projectId
    `)
    .get({ projectId }) as ProjectCommandRuleFileStateRow | undefined;

  return row === undefined ? null : mapProjectCommandRuleFileStateRow(row);
}

/**
 * Stores generated-file synchronization metadata for one project.
 *
 * @param database SQLite database connection.
 * @param state New file state.
 * @returns Promise resolved when the state is stored.
 */
export async function saveProjectCommandRuleFileState(
  database: BetterSqliteDatabase,
  state: CachedProjectCommandRuleFileState
): Promise<void> {
  database
    .prepare(`
      INSERT INTO project_command_rule_file_states (
        project_id,
        generated_hash,
        generated_path,
        updated_at
      )
      VALUES (@projectId, @generatedHash, @generatedPath, @updatedAt)
      ON CONFLICT(project_id) DO UPDATE SET
        generated_hash = excluded.generated_hash,
        generated_path = excluded.generated_path,
        updated_at = excluded.updated_at
    `)
    .run({
      projectId: state.projectId,
      generatedHash: state.generatedHash,
      generatedPath: state.generatedPath,
      updatedAt: state.updatedAt
    });
}

/**
 * Normalizes and validates one rule input before persistence.
 *
 * @param input Raw rule input.
 * @returns Normalized rule input.
 */
function normalizeRuleInput(
  input: CachedProjectCommandRuleCreateInput
): CachedProjectCommandRuleCreateInput {
  const projectId = input.projectId.trim();
  const name = input.name.trim();
  const pattern = normalizeStringList(input.pattern, "Rule pattern");
  const matchExamples = normalizeStringList(input.matchExamples, "Rule match examples", false);
  const notMatchExamples = normalizeStringList(input.notMatchExamples, "Rule non-match examples", false);

  if (projectId.length === 0) {
    throw new Error("Project id is required.");
  }

  if (name.length === 0) {
    throw new Error("Rule name is required.");
  }

  if (!ruleDecisions.has(input.decision)) {
    throw new Error(`Unsupported rule decision: ${input.decision}`);
  }

  return {
    projectId,
    name,
    pattern,
    decision: input.decision,
    justification: normalizeNullableText(input.justification),
    matchExamples,
    notMatchExamples,
    enabled: input.enabled === true
  };
}

/**
 * Trims a list of user-entered strings and optionally requires one value.
 *
 * @param values Values to normalize.
 * @param label Label used in validation errors.
 * @param required Whether at least one value is required.
 * @returns Normalized values.
 */
function normalizeStringList(values: string[], label: string, required = true): string[] {
  if (!Array.isArray(values)) {
    throw new Error(`${label} must be a list.`);
  }

  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (required && normalized.length === 0) {
    throw new Error(`${label} is required.`);
  }

  return Array.from(new Set(normalized));
}

/**
 * Converts blank text into a nullable persisted value.
 *
 * @param value Text or null value.
 * @returns Trimmed text, or `null`.
 */
function normalizeNullableText(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
}
