/**
 * Source-related SQLite operations.
 */
import crypto from "node:crypto";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedSource,
  CachedSourceCodexDetection,
  CachedSourceCreateInput,
  CachedSourceSettings,
  CachedSourceSettingsPatch
} from "../../types.js";
import { DEFAULT_SOURCE_NAME } from "../shared/constants.js";
import { mapSourceRow } from "../shared/mappers.js";
import type { SourceRow } from "../shared/rowTypes.js";
import {
  createDefaultLocalSourceSettings,
  createDefaultCustomSourceSettings,
  createSourceSettings,
  normalizeNullableText,
  normalizeSourceColor,
  serializeSourceSettings,
  validateSourceSettings
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
    lastDetectedCodexVersion: null,
    lastDetectedCodexAt: null,
    lastDetectionError: null,
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
 * Creates a source with normalized settings for its selected kind.
 *
 * @param database SQLite database connection.
 * @param name Source display name.
 * @param input Source kind and settings.
 *
 * @returns Created source.
 */
export async function createSource(
  database: BetterSqliteDatabase,
  name = "Codex",
  input: CachedSourceCreateInput = { kind: "local" }
): Promise<CachedSource> {
  const now = new Date().toISOString();
  const settings = createSourceSettings(input.kind, input.settings);
  validateSourceSettings(input.kind, settings);
  const source = {
    id: crypto.randomUUID(),
    kind: input.kind,
    name: name.trim() || "Codex",
    settings,
    lastDetectedCodexVersion: null,
    lastDetectedCodexAt: null,
    lastDetectionError: null,
    createdAt: now,
    updatedAt: now
  } as CachedSource;

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
    settings?: CachedSourceSettingsPatch;
  }
): Promise<CachedSource> {
  const source = await getSource(database, sourceId);

  if (source === null) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const nextKind = patch.settings !== undefined &&
    "commandMode" in patch.settings &&
    patch.settings.commandMode === "custom"
    ? "custom"
    : patch.settings !== undefined &&
        "commandMode" in patch.settings &&
        patch.settings.commandMode === "auto"
      ? "local"
      : source.kind;
  const nextSource: CachedSource = {
    ...source,
    kind: nextKind,
    name: patch.name?.trim() || source.name,
    settings: mergeSourceSettings(source, nextKind, patch.settings),
    updatedAt: new Date().toISOString()
  } as CachedSource;

  database
    .prepare(
      `
      UPDATE sources SET
        name = @name,
        kind = @kind,
        settings = @settingsJson,
        updated_at = @updatedAt
      WHERE id = @id
      `
    )
    .run({ ...nextSource, settingsJson: serializeSourceSettings(nextSource.settings) });

  return nextSource;
}

/**
 * Merges an incoming settings patch into the source settings for a target kind.
 *
 * @param source Existing source.
 * @param kind Target source kind after the patch.
 * @param patch Settings patch.
 * @returns Normalized settings for the target kind.
 */
function mergeSourceSettings(
  source: CachedSource,
  kind: CachedSource["kind"],
  patch: CachedSourceSettingsPatch | undefined
): CachedSourceSettings {
  if (kind === "custom") {
    const previousCustom = source.kind === "custom"
      ? source.settings
      : createDefaultCustomSourceSettings("command" in source.settings ? source.settings.command : null);

    return {
      commandMode: "custom",
      command: patch !== undefined && "command" in patch
        ? normalizeNullableText(patch.command ?? null)
        : previousCustom.command,
      hasLocalAccess: patch !== undefined && "hasLocalAccess" in patch
        ? patch.hasLocalAccess === true
        : previousCustom.hasLocalAccess,
      color: patch?.color !== undefined ? normalizeSourceColor(patch.color) : previousCustom.color,
      openFolderCommand: patch !== undefined && "openFolderCommand" in patch
        ? normalizeNullableText(patch.openFolderCommand ?? null)
        : previousCustom.openFolderCommand,
      openFileCommand: patch !== undefined && "openFileCommand" in patch
        ? normalizeNullableText(patch.openFileCommand ?? null)
        : previousCustom.openFileCommand
    };
  }

  if (kind === "wsl") {
    const previousWsl = source.kind === "wsl"
      ? source.settings
      : { distro: null, codexCommand: "codex", color: source.settings.color };

    return {
      distro: patch !== undefined && "distro" in patch ? normalizeNullableText(patch.distro ?? null) : previousWsl.distro,
      codexCommand: patch !== undefined && "codexCommand" in patch && typeof patch.codexCommand === "string"
        ? patch.codexCommand
        : previousWsl.codexCommand,
      color: patch?.color !== undefined ? normalizeSourceColor(patch.color) : previousWsl.color
    };
  }

  if (kind === "ssh") {
    const previousSsh = source.kind === "ssh"
      ? source.settings
      : { host: "", user: null, port: null, identityFile: null, codexCommand: "codex", color: source.settings.color };

    return {
      host: patch !== undefined && "host" in patch && typeof patch.host === "string"
        ? patch.host.trim()
        : previousSsh.host,
      user: patch !== undefined && "user" in patch ? normalizeNullableText(patch.user ?? null) : previousSsh.user,
      port: patch !== undefined && "port" in patch && typeof patch.port === "number" ? patch.port : previousSsh.port,
      identityFile: patch !== undefined && "identityFile" in patch
        ? normalizeNullableText(patch.identityFile ?? null)
        : previousSsh.identityFile,
      codexCommand: patch !== undefined && "codexCommand" in patch && typeof patch.codexCommand === "string"
        ? patch.codexCommand
        : previousSsh.codexCommand,
      color: patch?.color !== undefined ? normalizeSourceColor(patch.color) : previousSsh.color
    };
  }

  const previousLocal = source.kind === "local"
    ? source.settings
    : createDefaultLocalSourceSettings();

  return {
    commandMode: "auto",
    command: null,
    color: patch?.color !== undefined ? normalizeSourceColor(patch.color) : previousLocal.color,
    openFolderCommand: patch !== undefined && "openFolderCommand" in patch
      ? normalizeNullableText(patch.openFolderCommand ?? null)
      : previousLocal.openFolderCommand,
    openFileCommand: patch !== undefined && "openFileCommand" in patch
      ? normalizeNullableText(patch.openFileCommand ?? null)
      : previousLocal.openFileCommand
  };
}

/**
 * Updates the persisted Codex CLI diagnostic for a source.
 *
 * @param database SQLite database connection.
 * @param sourceId Source identifier.
 * @param detection Detection result to store.
 *
 * @returns Nothing.
 */
export async function updateSourceCodexDetection(
  database: BetterSqliteDatabase,
  sourceId: string,
  detection: CachedSourceCodexDetection
): Promise<void> {
  database
    .prepare(
      `
      UPDATE sources SET
        last_detected_codex_version = @version,
        last_detected_codex_at = @checkedAt,
        last_detection_error = @error
      WHERE id = @sourceId
      `
    )
    .run({
      sourceId,
      version: detection.version,
      checkedAt: detection.checkedAt,
      error: detection.error
    });
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
