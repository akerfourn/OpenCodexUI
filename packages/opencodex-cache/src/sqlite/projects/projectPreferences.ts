/**
 * Normalizes persisted project preferences.
 */
import type { CachedProjectPreferences } from "../../types.js";

const defaultPermissionsProfileId = "opencodex-context";
type NormalizedContextFolder = NonNullable<
  NonNullable<CachedProjectPreferences["context"]>["folders"]
>[number];

/**
 * Parses project preferences from SQLite JSON.
 *
 * @param value Raw JSON value.
 * @returns Normalized project preferences.
 */
export function parseProjectPreferences(value: string | null): CachedProjectPreferences {
  if (value === null || value.trim().length === 0) {
    return {};
  }

  try {
    return normalizeProjectPreferences(JSON.parse(value));
  } catch {
    return {};
  }
}

/**
 * Serializes project preferences for SQLite.
 *
 * @param preferences Preferences to persist.
 * @returns JSON string, or `null` when preferences are empty.
 */
export function serializeProjectPreferences(preferences: CachedProjectPreferences): string | null {
  const normalized = normalizeProjectPreferences(preferences);

  if (normalized.git === undefined && normalized.context === undefined) {
    return null;
  }

  return JSON.stringify(normalized);
}

/**
 * Normalizes a partial or unknown project preferences value.
 *
 * @param value Input value.
 * @returns Safe project preferences.
 */
export function normalizeProjectPreferences(value: unknown): CachedProjectPreferences {
  if (!isRecord(value)) {
    return {};
  }

  const git = normalizeGitPreferences(value.git);
  const context = normalizeContextPreferences(value.context);

  if (git === undefined && context === undefined) {
    return {};
  }

  return { git, context };
}

/**
 * Normalizes the Git-specific project preference section.
 *
 * @param value Unknown Git preference payload.
 * @returns Normalized Git preferences, or `undefined` when empty.
 */
function normalizeGitPreferences(value: unknown): CachedProjectPreferences["git"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const referenceTagName = normalizeNullableText(value.referenceTagName);
  const deferredPaths = normalizeDeferredPaths(value.deferredPaths);

  if (referenceTagName === undefined && deferredPaths.length === 0) {
    return undefined;
  }

  return {
    referenceTagName,
    ...(deferredPaths.length > 0 ? { deferredPaths } : {})
  };
}

/**
 * Normalizes persisted paths excluded from OpenCodexUI staging actions.
 *
 * @param value Unknown deferred path list.
 * @returns Unique relative paths.
 */
function normalizeDeferredPaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const paths = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => normalizeDeferredPath(entry))
    .filter((entry): entry is string => entry !== null);

  return [...new Set(paths)].sort();
}

/**
 * Normalizes one relative Git path used by the deferred-path preference.
 *
 * @param value Unknown path value.
 * @returns Normalized relative path, or `null` when unsafe or empty.
 */
function normalizeDeferredPath(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");

  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized.startsWith("/") ||
    normalized.split("/").some((segment) => segment === "..")
  ) {
    return null;
  }

  return normalized;
}

/**
 * Normalizes external context folder preferences.
 *
 * @param value Unknown context preference payload.
 * @returns Normalized context preferences, or `undefined` when empty.
 */
function normalizeContextPreferences(value: unknown): CachedProjectPreferences["context"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const permissionsProfileId = normalizeNullableText(value.permissionsProfileId) ?? defaultPermissionsProfileId;
  const folders = normalizeContextFolders(value.folders);
  const lastSyncedAt = normalizeNullableText(value.lastSyncedAt);

  if (folders.length === 0 && lastSyncedAt === undefined && permissionsProfileId === defaultPermissionsProfileId) {
    return undefined;
  }

  return {
    permissionsProfileId,
    folders,
    lastSyncedAt: lastSyncedAt ?? null
  };
}

/**
 * Normalizes a list of external context folders.
 *
 * @param value Unknown folder list payload.
 * @returns Valid context folders.
 */
function normalizeContextFolders(value: unknown): NormalizedContextFolder[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const folders = [];

  for (const item of value) {
    const folder = normalizeContextFolder(item);

    if (folder !== null) {
      folders.push(folder);
    }
  }

  return folders;
}

/**
 * Normalizes one external context folder entry.
 *
 * @param value Unknown folder payload.
 * @returns Valid folder entry, or `null` when required fields are missing.
 */
function normalizeContextFolder(
  value: unknown
): NormalizedContextFolder | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeRequiredText(value.id);
  const path = normalizeRequiredText(value.path);

  if (id === null || path === null) {
    return null;
  }

  return {
    id,
    path,
    label: normalizeNullableText(value.label) ?? null,
    enabled: value.enabled !== false
  };
}

/**
 * Reads required trimmed text from an unknown value.
 *
 * @param value Unknown value.
 * @returns Trimmed non-empty text, or `null`.
 */
function normalizeRequiredText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Reads optional nullable trimmed text from an unknown value.
 *
 * @param value Unknown value.
 * @returns Trimmed text, `null` for explicit blank/null, or `undefined` when absent.
 */
function normalizeNullableText(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Checks whether a value is a non-array object.
 *
 * @param value Unknown value.
 * @returns True when the value can be read as a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
