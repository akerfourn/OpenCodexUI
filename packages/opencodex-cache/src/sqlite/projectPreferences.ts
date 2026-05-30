/**
 * Normalizes persisted project preferences.
 */
import type { CachedProjectPreferences } from "../types.js";

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

  if (normalized.git === undefined) {
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

  if (git === undefined) {
    return {};
  }

  return { git };
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
