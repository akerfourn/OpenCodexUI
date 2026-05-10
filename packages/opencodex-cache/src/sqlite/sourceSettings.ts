/**
 * Parses and serializes source settings stored in SQLite.
 */
import type {
  CachedSourceColor,
  CachedSourceLocalSettings
} from "../types.js";

/**
 * Creates default settings for a local Codex source.
 *
 * @returns Local source settings.
 */
export function createDefaultLocalSourceSettings(): CachedSourceLocalSettings {
  return {
    commandMode: "auto",
    command: null,
    color: "blue"
  };
}

/**
 * Serializes source settings for SQLite storage.
 *
 * @param settings Source-specific settings.
 * @returns JSON document.
 */
export function serializeSourceSettings(settings: CachedSourceLocalSettings): string {
  return JSON.stringify({
    commandMode: settings.commandMode,
    command: normalizeNullableText(settings.command),
    color: settings.color
  });
}

/**
 * Parses and normalizes a local source settings document.
 *
 * @param value Raw JSON value read from SQLite.
 * @returns Local source settings.
 */
export function parseLocalSourceSettings(value: string): CachedSourceLocalSettings {
  try {
    const parsed = JSON.parse(value) as Partial<CachedSourceLocalSettings>;
    const commandMode = parsed.commandMode === "custom" ? "custom" : "auto";

    return {
      commandMode,
      command: normalizeNullableText(parsed.command ?? null),
      color: normalizeSourceColor(parsed.color)
    };
  } catch {
    return createDefaultLocalSourceSettings();
  }
}

/**
 * Normalizes a source color and falls back to the default value.
 *
 * @param value Raw color value.
 * @returns Valid source color.
 */
export function normalizeSourceColor(value: unknown): CachedSourceColor {
  if (
    value === "blue" ||
    value === "indigo" ||
    value === "purple" ||
    value === "pink" ||
    value === "red" ||
    value === "orange" ||
    value === "amber" ||
    value === "teal"
  ) {
    return value;
  }

  return "blue";
}

/**
 * Normalizes user-editable text where blank means no value.
 *
 * @param value Text value to normalize.
 * @returns Trimmed value, or `null` when blank.
 */
export function normalizeNullableText(value: string | null): string | null {
  const trimmedValue = value?.trim() ?? "";
  return trimmedValue.length > 0 ? trimmedValue : null;
}

