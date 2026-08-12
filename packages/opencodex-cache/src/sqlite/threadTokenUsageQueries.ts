/**
 * Project and thread token-usage SQLite operations.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { normalizeProjectPath } from "../projectIdentity.js";
import type {
  CachedProjectTokenUsageStatistics,
  CachedThreadTokenUsage,
  CachedThreadTokenUsageBreakdown
} from "../types.js";
import { createSourceClause } from "./threadIndexQueries.js";

/**
 * Aggregates the latest known token usage for user-facing chats in one project.
 *
 * @param database SQLite database connection.
 * @param currentProjectPath Project working directory.
 * @param sourceId Source identifier, or `null` for an orphan project.
 * @returns Aggregated token usage and cache coverage.
 */
export async function getProjectTokenUsageStatistics(
  database: BetterSqliteDatabase,
  currentProjectPath: string,
  sourceId: string | null
): Promise<CachedProjectTokenUsageStatistics> {
  const normalizedProjectPath = normalizeProjectPath(currentProjectPath);
  const statistics = createEmptyProjectTokenUsageStatistics();

  if (normalizedProjectPath === null) {
    return statistics;
  }

  const sourceClause = createSourceClause(sourceId);
  const rows = database
    .prepare(
      `
      SELECT token_usage_json
      FROM threads
      WHERE cwd = @currentProjectPath
        AND parent_thread_id IS NULL
        AND (thread_source IS NULL OR thread_source NOT LIKE 'subAgent%')
        ${sourceClause.sql}
      `
    )
    .all({ currentProjectPath: normalizedProjectPath, ...sourceClause.params }) as Array<{
      token_usage_json: string | null;
    }>;

  statistics.chatCount = rows.length;

  for (const row of rows) {
    const usage = parseCachedThreadTokenUsage(row.token_usage_json);

    if (usage === null) {
      statistics.chatsWithoutTokenUsage += 1;
      continue;
    }

    statistics.chatsWithTokenUsage += 1;
    addTokenUsageBreakdown(statistics.tokenUsage, usage.total);
  }

  return statistics;
}

/**
 * Creates an empty project token usage result.
 *
 * @returns Zeroed project statistics.
 */
function createEmptyProjectTokenUsageStatistics(): CachedProjectTokenUsageStatistics {
  return {
    chatCount: 0,
    chatsWithTokenUsage: 0,
    chatsWithoutTokenUsage: 0,
    tokenUsage: {
      totalTokens: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0
    }
  };
}

/**
 * Parses one persisted token usage snapshot for aggregation.
 *
 * @param value Serialized token usage JSON.
 * @returns Parsed usage, or `null` when the cache entry is unavailable.
 */
function parseCachedThreadTokenUsage(value: string | null): CachedThreadTokenUsage | null {
  if (value === null || value.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as { total?: unknown };

    if (!isTokenUsageBreakdown(parsed.total)) {
      return null;
    }

    return parsed as CachedThreadTokenUsage;
  } catch {
    return null;
  }
}

/**
 * Checks whether a parsed value contains all token counters needed by totals.
 *
 * @param value Parsed JSON value.
 * @returns Whether the value is a token usage breakdown.
 */
function isTokenUsageBreakdown(value: unknown): value is CachedThreadTokenUsageBreakdown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const breakdown = value as Record<string, unknown>;
  const keys: Array<keyof CachedThreadTokenUsageBreakdown> = [
    "totalTokens",
    "inputTokens",
    "cachedInputTokens",
    "outputTokens",
    "reasoningOutputTokens"
  ];

  return keys.every((key) => (
    typeof breakdown[key] === "number" && Number.isFinite(breakdown[key])
  ));
}

/**
 * Adds one chat token breakdown to an aggregate.
 *
 * @param target Aggregate counters.
 * @param source Chat counters.
 * @returns Nothing.
 */
function addTokenUsageBreakdown(
  target: CachedThreadTokenUsageBreakdown,
  source: CachedThreadTokenUsageBreakdown
): void {
  target.totalTokens += source.totalTokens;
  target.inputTokens += source.inputTokens;
  target.cachedInputTokens += source.cachedInputTokens;
  target.outputTokens += source.outputTokens;
  target.reasoningOutputTokens += source.reasoningOutputTokens;
}

/**
 * Saves the latest known token usage for a cached thread.
 *
 * @param database SQLite database connection.
 * @param usage Thread token usage snapshot.
 *
 * @returns Promise resolved when save completes.
 */
export async function saveThreadTokenUsage(
  database: BetterSqliteDatabase,
  usage: CachedThreadTokenUsage,
  sourceId: string | null = null
): Promise<void> {
  const sourceClause = sourceId === null ? "" : " AND source_id = @sourceId";
  database
    .prepare(
      `
      UPDATE threads SET
        token_usage_json = @tokenUsageJson
      WHERE id = @threadId
        ${sourceClause}
      `
    )
    .run({
      threadId: usage.threadId,
      tokenUsageJson: JSON.stringify(usage),
      ...(sourceId === null ? {} : { sourceId })
    });
}

