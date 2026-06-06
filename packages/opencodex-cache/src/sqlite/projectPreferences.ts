/**
 * Normalizes persisted project preferences.
 */
import type { CachedProjectPreferences } from "../types.js";

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

function normalizeGitPreferences(value: unknown): CachedProjectPreferences["git"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const referenceTagName = normalizeNullableText(value.referenceTagName);

  if (referenceTagName === undefined) {
    return undefined;
  }

  return { referenceTagName };
}

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

function normalizeRequiredText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
