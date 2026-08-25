import crypto from "node:crypto";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { LEGACY_DEFAULT_SOURCE_ID } from "../shared/constants.js";

/**
 * Replaces the legacy default source identifier with a generated UUID.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
export function applySchemaMigrationV6(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(6);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const legacySource = database
    .prepare("SELECT id FROM sources WHERE id = @sourceId")
    .get({ sourceId: LEGACY_DEFAULT_SOURCE_ID }) as { id: string } | undefined;

  const applyMigration = database.transaction(() => {
    if (legacySource !== undefined) {
      const nextSourceId = crypto.randomUUID();
      database
        .prepare("UPDATE sources SET id = @nextSourceId WHERE id = @legacySourceId")
        .run({
          nextSourceId,
          legacySourceId: LEGACY_DEFAULT_SOURCE_ID
        });
      database
        .prepare("UPDATE projects SET source_id = @nextSourceId WHERE source_id = @legacySourceId")
        .run({
          nextSourceId,
          legacySourceId: LEGACY_DEFAULT_SOURCE_ID
        });
      database
        .prepare("UPDATE threads SET source_id = @nextSourceId WHERE source_id = @legacySourceId")
        .run({
          nextSourceId,
          legacySourceId: LEGACY_DEFAULT_SOURCE_ID
        });
    }

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(6, now);
  });

  applyMigration();
}
