/**
 * Reads and writes source-scoped Codex model catalogs.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type { CachedModelCatalog } from "../../types.js";
import type { ModelCatalogRow } from "../shared/rowTypes.js";

/**
 * Reads one cached model catalog.
 *
 * @param database SQLite database connection.
 * @param sourceId Source identifier.
 * @returns Cached model catalog, or `null` when absent.
 */
export function getModelCatalog(
  database: BetterSqliteDatabase,
  sourceId: string
): CachedModelCatalog | null {
  const row = database
    .prepare(
      `
      SELECT source_id, models_json, updated_at
      FROM model_catalogs
      WHERE source_id = ?
      `
    )
    .get(sourceId) as ModelCatalogRow | undefined;

  return row === undefined
    ? null
    : {
        sourceId: row.source_id,
        modelsJson: row.models_json,
        updatedAt: row.updated_at
      };
}

/**
 * Replaces the cached model catalog for one source.
 *
 * @param database SQLite database connection.
 * @param sourceId Source identifier.
 * @param modelsJson Serialized model metadata.
 * @returns Nothing.
 */
export function saveModelCatalog(
  database: BetterSqliteDatabase,
  sourceId: string,
  modelsJson: string
): void {
  database
    .prepare(
      `
      INSERT INTO model_catalogs (source_id, models_json, updated_at)
      VALUES (@sourceId, @modelsJson, @updatedAt)
      ON CONFLICT(source_id) DO UPDATE SET
        models_json = excluded.models_json,
        updated_at = excluded.updated_at
      `
    )
    .run({
      sourceId,
      modelsJson,
      updatedAt: new Date().toISOString()
    });
}
