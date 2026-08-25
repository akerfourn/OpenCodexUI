/**
 * Reads and writes source-scoped Codex rate-limit history.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedUsageRateLimitSnapshot,
  CachedUsageRateLimitSnapshotQuery
} from "../../types.js";
import type { UsageRateLimitSnapshotRow } from "../shared/rowTypes.js";

/**
 * Inserts one rate-limit snapshot when its effective values changed.
 *
 * The payload can differ between a read and a sparse notification while the
 * effective rate limits remain identical, so deduplication uses the explicit
 * fingerprint rather than the serialized payload.
 *
 * @param database SQLite database connection.
 * @param snapshot Snapshot to persist.
 * @returns Nothing.
 */
export function insertUsageRateLimitSnapshot(
  database: BetterSqliteDatabase,
  snapshot: CachedUsageRateLimitSnapshot
): void {
  const latestSnapshot = database
    .prepare(
      `
      SELECT fingerprint
      FROM usage_rate_limit_snapshots
      WHERE source_id = @sourceId
      ORDER BY observed_at DESC, id DESC
      LIMIT 1
      `
    )
    .get({ sourceId: snapshot.sourceId }) as { fingerprint?: unknown } | undefined;

  if (latestSnapshot?.fingerprint === snapshot.fingerprint) {
    return;
  }

  database
    .prepare(
      `
      INSERT INTO usage_rate_limit_snapshots (
        source_id,
        observed_at,
        origin,
        reason,
        fingerprint,
        payload_json
      )
      VALUES (
        @sourceId,
        @observedAt,
        @origin,
        @reason,
        @fingerprint,
        @payloadJson
      )
      `
    )
    .run({
      sourceId: snapshot.sourceId,
      observedAt: snapshot.observedAt,
      origin: snapshot.origin,
      reason: snapshot.reason,
      fingerprint: snapshot.fingerprint,
      payloadJson: snapshot.payloadJson
    });
}

/**
 * Reads historical rate-limit snapshots for one source.
 *
 * @param database SQLite database connection.
 * @param query Snapshot query.
 * @returns Snapshots ordered from oldest to newest.
 */
export function listUsageRateLimitSnapshots(
  database: BetterSqliteDatabase,
  query: CachedUsageRateLimitSnapshotQuery
): CachedUsageRateLimitSnapshot[] {
  const sql = query.includeBaselineBeforeFrom === true && query.fromObservedAt !== undefined
    ? `
      WITH baselines AS (
        SELECT current_snapshot.*
        FROM usage_rate_limit_snapshots AS current_snapshot
        WHERE current_snapshot.source_id = @sourceId
          AND current_snapshot.observed_at < @fromObservedAt
          AND NOT EXISTS (
            SELECT 1
            FROM usage_rate_limit_snapshots AS newer_snapshot
            WHERE newer_snapshot.source_id = current_snapshot.source_id
              AND (
                newer_snapshot.observed_at > current_snapshot.observed_at
                OR (
                  newer_snapshot.observed_at = current_snapshot.observed_at
                  AND newer_snapshot.id > current_snapshot.id
                )
              )
              AND newer_snapshot.observed_at < @fromObservedAt
          )
      )
      SELECT
        id,
        source_id,
        observed_at,
        origin,
        reason,
        fingerprint,
        payload_json
      FROM (
        SELECT *
        FROM usage_rate_limit_snapshots
        WHERE source_id = @sourceId
          AND observed_at >= @fromObservedAt
          AND (@toObservedAt IS NULL OR observed_at < @toObservedAt)

        UNION ALL

        SELECT *
        FROM baselines
      )
      ORDER BY observed_at ASC, id ASC
      LIMIT @limit
    `
    : `
      SELECT
        id,
        source_id,
        observed_at,
        origin,
        reason,
        fingerprint,
        payload_json
      FROM usage_rate_limit_snapshots
      WHERE source_id = @sourceId
        AND (@fromObservedAt IS NULL OR observed_at >= @fromObservedAt)
        AND (@toObservedAt IS NULL OR observed_at < @toObservedAt)
      ORDER BY observed_at ASC, id ASC
      LIMIT @limit
    `;
  const rows = database
    .prepare(sql)
    .all({
      sourceId: query.sourceId,
      fromObservedAt: query.fromObservedAt ?? null,
      toObservedAt: query.toObservedAt ?? null,
      limit: normalizeLimit(query.limit)
    }) as UsageRateLimitSnapshotRow[];

  return rows.map(mapUsageRateLimitSnapshotRow);
}

/**
 * Maps one SQLite rate-limit row to the cache contract.
 *
 * @param row SQLite row.
 * @returns Cache snapshot.
 */
function mapUsageRateLimitSnapshotRow(
  row: UsageRateLimitSnapshotRow
): CachedUsageRateLimitSnapshot {
  return {
    id: row.id,
    sourceId: row.source_id,
    observedAt: row.observed_at,
    origin: row.origin === "notification" ? "notification" : "read",
    reason: row.reason,
    fingerprint: row.fingerprint,
    payloadJson: row.payload_json
  };
}

/**
 * Normalizes an optional history limit while keeping reads bounded.
 *
 * @param limit Requested maximum number of rows.
 * @returns Positive SQLite limit.
 */
function normalizeLimit(limit: number | null | undefined): number {
  if (limit === undefined || limit === null || !Number.isFinite(limit) || limit <= 0) {
    return 100_000;
  }

  return Math.min(Math.floor(limit), 100_000);
}
