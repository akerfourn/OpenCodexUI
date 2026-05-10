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

export async function getSource(
  database: BetterSqliteDatabase,
  sourceId: string
): Promise<CachedSource | null> {
  const row = database
    .prepare("SELECT * FROM sources WHERE id = @sourceId")
    .get({ sourceId }) as SourceRow | undefined;

  return row === undefined ? null : mapSourceRow(row);
}

export async function getSourceProjectCount(
  database: BetterSqliteDatabase,
  sourceId: string
): Promise<number> {
  const row = database
    .prepare("SELECT COUNT(*) AS count FROM projects WHERE source_id = @sourceId")
    .get({ sourceId }) as { count: number } | undefined;

  return row?.count ?? 0;
}

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
        : source.settings.color
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

export async function deleteSource(
  database: BetterSqliteDatabase,
  sourceId: string
): Promise<void> {
  database
    .prepare("DELETE FROM sources WHERE id = @sourceId")
    .run({ sourceId });
}

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

