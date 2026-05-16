/**
 * Source-related SQLite operations.
 */
import crypto from "node:crypto";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedSource,
  CachedSourceLocalSettings
} from "../types.js";
import { DEFAULT_SOURCE_NAME } from "./constants.js";
import { mapSourceRow } from "./mappers.js";
import type { SourceRow } from "./rowTypes.js";
import {
  createDefaultLocalSourceSettings,
  normalizeNullableText,
  normalizeSourceColor,
  serializeSourceSettings
} from "./sourceSettings.js";

/**
 * Ensures that at least one default local source exists.
 *
 * @param database SQLite database connection.
 *
 * @returns Existing or created default source.
 */
export async function ensureDefaultSource(database: BetterSqliteDatabase): Promise<CachedSource> {
  const sources = await listSources(database);
  const existingSource = sources[0];

  if (existingSource !== undefined) {
    return existingSource;
  }

  const now = new Date().toISOString();
  const source: CachedSource = {
    id: crypto.randomUUID(),
    kind: "local",
    name: DEFAULT_SOURCE_NAME,
    settings: createDefaultLocalSourceSettings(),
    createdAt: now,
    updatedAt: now
  };

  database
    .prepare(
      `
      INSERT INTO sources (
        id,
        kind,
        name,
        settings,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @kind,
        @name,
        @settingsJson,
        @createdAt,
        @updatedAt
      )
      `
    )
    .run({
      ...source,
      settingsJson: serializeSourceSettings(source.settings)
    });

  return source;
}

/**
 * Creates a local source with default settings.
 *
 * @param database SQLite database connection.
 * @param name Source display name.
 *
 * @returns Created source.
 */
export async function createSource(
  database: BetterSqliteDatabase,
  name = "Codex"
): Promise<CachedSource> {
  const now = new Date().toISOString();
  const source: CachedSource = {
    id: crypto.randomUUID(),
    kind: "local",
    name,
    settings: createDefaultLocalSourceSettings(),
    createdAt: now,
    updatedAt: now
  };

  database
    .prepare(
      `
      INSERT INTO sources (
        id,
        kind,
        name,
        settings,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @kind,
        @name,
        @settingsJson,
        @createdAt,
        @updatedAt
      )
      `
    )
    .run({ ...source, settingsJson: serializeSourceSettings(source.settings) });

  return source;
}

/**
 * Lists configured sources in creation order.
 *
 * @param database SQLite database connection.
 *
 * @returns Cached source rows.
 */
export async function listSources(database: BetterSqliteDatabase): Promise<CachedSource[]> {
  const rows = database
    .prepare(
      `
      SELECT *
      FROM sources
      ORDER BY created_at ASC, name ASC
      `
    )
    .all() as SourceRow[];

  return rows.map(mapSourceRow);
}

/**
 * Reads one source by identifier.
 *
 * @param database SQLite database connection.
 * @param sourceId Source identifier.
 *
 * @returns Cached source, or `null`.
 */
export async function getSource(
  database: BetterSqliteDatabase,
  sourceId: string
): Promise<CachedSource | null> {
  const row = database
    .prepare("SELECT * FROM sources WHERE id = @sourceId")
    .get({ sourceId }) as SourceRow | undefined;

  return row === undefined ? null : mapSourceRow(row);
}

/**
 * Counts projects currently associated with a source.
 *
 * @param database SQLite database connection.
 * @param sourceId Source identifier.
 *
 * @returns Associated project count.
 */
export async function getSourceProjectCount(
  database: BetterSqliteDatabase,
  sourceId: string
): Promise<number> {
  const row = database
    .prepare("SELECT COUNT(*) AS count FROM projects WHERE source_id = @sourceId")
    .get({ sourceId }) as { count: number } | undefined;

  return row?.count ?? 0;
}

/**
 * Updates source metadata and local settings.
 *
 * @param database SQLite database connection.
 * @param sourceId Source identifier.
 * @param patch Source patch.
 *
 * @returns Updated source.
 */
export async function updateSource(
  database: BetterSqliteDatabase,
  sourceId: string,
  patch: Partial<Pick<CachedSource, "name">> & {
    settings?: Partial<CachedSourceLocalSettings>;
  }
): Promise<CachedSource> {
  const source = await getSource(database, sourceId);

  if (source === null) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const nextSource: CachedSource = {
    ...source,
    name: patch.name?.trim() || source.name,
    settings: {
      commandMode: patch.settings?.commandMode ?? source.settings.commandMode,
      command: patch.settings?.command !== undefined
        ? normalizeNullableText(patch.settings.command)
        : source.settings.command,
      color: patch.settings?.color !== undefined
        ? normalizeSourceColor(patch.settings.color)
        : source.settings.color,
      openFolderCommand: patch.settings?.openFolderCommand !== undefined
        ? normalizeNullableText(patch.settings.openFolderCommand)
        : source.settings.openFolderCommand,
      openFileCommand: patch.settings?.openFileCommand !== undefined
        ? normalizeNullableText(patch.settings.openFileCommand)
        : source.settings.openFileCommand
    },
    updatedAt: new Date().toISOString()
  };

  database
    .prepare(
      `
      UPDATE sources SET
        name = @name,
        settings = @settingsJson,
        updated_at = @updatedAt
      WHERE id = @id
      `
    )
    .run({ ...nextSource, settingsJson: serializeSourceSettings(nextSource.settings) });

  return nextSource;
}

/**
 * Deletes a source row.
 *
 * @param database SQLite database connection.
 * @param sourceId Source identifier.
 *
 * @returns Promise resolved when deletion completes.
 */
export async function deleteSource(
  database: BetterSqliteDatabase,
  sourceId: string
): Promise<void> {
  database
    .prepare("DELETE FROM sources WHERE id = @sourceId")
    .run({ sourceId });
}

/**
 * Clears project and thread references to a source.
 *
 * @param database SQLite database connection.
 * @param sourceId Source identifier.
 *
 * @returns Promise resolved when associations are cleared.
 */
export async function clearSourceAssociations(
  database: BetterSqliteDatabase,
  sourceId: string
): Promise<void> {
  const clearAssociations = database.transaction(() => {
    database
      .prepare("UPDATE projects SET source_id = NULL WHERE source_id = @sourceId")
      .run({ sourceId });
    database
      .prepare("UPDATE threads SET source_id = NULL WHERE source_id = @sourceId")
      .run({ sourceId });
  });

  clearAssociations();
}
