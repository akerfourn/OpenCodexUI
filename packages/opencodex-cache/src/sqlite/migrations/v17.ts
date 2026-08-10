import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import {
  normalizeNullableText,
  normalizeSourceColor,
  serializeSourceSettings
} from "../sourceSettings.js";

/**
 * Splits legacy local/custom command settings into explicit source kinds.
 *
 * Existing custom-command sources were stored as `kind = local` with a custom
 * command mode in settings. They keep local access enabled to preserve opener
 * behavior from previous versions.
 *
 * @param database SQLite database connection.
 *
 * @returns Nothing.
 */
export function applySchemaMigrationV17(database: BetterSqliteDatabase): void {
  const migration = database
    .prepare("SELECT version FROM schema_migrations WHERE version = ?")
    .get(17);

  if (migration !== undefined) {
    return;
  }

  const now = new Date().toISOString();
  const applyMigration = database.transaction(() => {
    const rows = database
      .prepare("SELECT id, kind, settings FROM sources")
      .all() as Array<{ id: string; kind: string; settings: string }>;
    const updateSource = database.prepare(`
      UPDATE sources SET
        kind = @kind,
        settings = @settings,
        updated_at = @updatedAt
      WHERE id = @id
    `);

    for (const row of rows) {
      const parsedSettings = parseSettingsObject(row.settings);

      if (parsedSettings.commandMode === "custom") {
        updateSource.run({
          id: row.id,
          kind: "custom",
          settings: serializeSourceSettings({
            commandMode: "custom",
            command: normalizeNullableText(readStringSetting(parsedSettings, "command")),
            hasLocalAccess: true,
            color: normalizeSourceColor(parsedSettings.color),
            openFolderCommand: normalizeNullableText(readStringSetting(parsedSettings, "openFolderCommand")),
            openFileCommand: normalizeNullableText(readStringSetting(parsedSettings, "openFileCommand"))
          }),
          updatedAt: now
        });
        continue;
      }

      if (row.kind === "local") {
        updateSource.run({
          id: row.id,
          kind: "local",
          settings: serializeSourceSettings({
            commandMode: "auto",
            command: null,
            color: normalizeSourceColor(parsedSettings.color),
            openFolderCommand: normalizeNullableText(readStringSetting(parsedSettings, "openFolderCommand")),
            openFileCommand: normalizeNullableText(readStringSetting(parsedSettings, "openFileCommand"))
          }),
          updatedAt: now
        });
      }
    }

    database
      .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
      .run(17, now);
  });

  applyMigration();
}

/**
 * Parses a JSON settings object for schema migration use.
 *
 * @param value Raw JSON settings string.
 * @returns Decoded object, or an empty object when invalid.
 */
function parseSettingsObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

/**
 * Reads one optional string setting from a decoded settings object.
 *
 * @param settings Decoded settings object.
 * @param key Setting key.
 * @returns String value, or `null`.
 */
function readStringSetting(settings: Record<string, unknown>, key: string): string | null {
  const value = settings[key];
  return typeof value === "string" ? value : null;
}
