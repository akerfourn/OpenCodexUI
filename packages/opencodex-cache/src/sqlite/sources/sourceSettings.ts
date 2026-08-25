/**
 * Parses and serializes source settings stored in SQLite.
 */
import type {
  CachedSourceColor,
  CachedSourceCustomSettings,
  CachedSourceKind,
  CachedSourceLocalSettings,
  CachedSourceSettings,
  CachedSourceSettingsPatch,
  CachedSourceSshSettings,
  CachedSourceWslSettings
} from "../../types.js";

/**
 * Creates default settings for a local Codex source.
 *
 * @returns Local source settings.
 */
export function createDefaultLocalSourceSettings(): CachedSourceLocalSettings {
  return {
    commandMode: "auto",
    command: null,
    color: "blue",
    openFolderCommand: null,
    openFileCommand: null
  };
}

/**
 * Creates default settings for a custom command source.
 *
 * @returns Custom source settings.
 */
export function createDefaultCustomSourceSettings(command: string | null = null): CachedSourceCustomSettings {
  return {
    commandMode: "custom",
    command: normalizeNullableText(command),
    hasLocalAccess: false,
    color: "blue",
    openFolderCommand: null,
    openFileCommand: null
  };
}

/**
 * Creates normalized settings for a newly selected source kind.
 *
 * @param kind Source kind being created.
 * @param patch Optional user-provided settings.
 * @returns Settings matching the selected source kind.
 */
export function createSourceSettings(
  kind: CachedSourceKind,
  patch: CachedSourceSettingsPatch = {}
): CachedSourceSettings {
  const color = patch.color !== undefined ? normalizeSourceColor(patch.color) : "blue";

  if (kind === "custom") {
    return {
      commandMode: "custom",
      command: normalizeNullableText(patch.command ?? null),
      hasLocalAccess: patch.hasLocalAccess === true,
      color,
      openFolderCommand: normalizeNullableText(patch.openFolderCommand ?? null),
      openFileCommand: normalizeNullableText(patch.openFileCommand ?? null)
    };
  }

  if (kind === "wsl") {
    return {
      distro: normalizeNullableText(patch.distro ?? null),
      codexCommand: normalizeCommand(patch.codexCommand),
      color
    };
  }

  if (kind === "ssh") {
    return {
      host: typeof patch.host === "string" ? patch.host.trim() : "",
      user: normalizeNullableText(patch.user ?? null),
      port: typeof patch.port === "number" ? patch.port : null,
      identityFile: normalizeNullableText(patch.identityFile ?? null),
      codexCommand: normalizeCommand(patch.codexCommand),
      color
    };
  }

  return {
    commandMode: "auto",
    command: null,
    color,
    openFolderCommand: normalizeNullableText(patch.openFolderCommand ?? null),
    openFileCommand: normalizeNullableText(patch.openFileCommand ?? null)
  };
}

/**
 * Validates the minimum configuration required to launch a source.
 *
 * @param kind Source kind.
 * @param settings Normalized source settings.
 * @returns Nothing.
 * @throws When a required connection setting is missing or invalid.
 */
export function validateSourceSettings(
  kind: CachedSourceKind,
  settings: CachedSourceSettings
): void {
  if (kind === "custom") {
    const customSettings = settings as CachedSourceCustomSettings;

    if (customSettings.command === null || customSettings.command.trim().length === 0) {
      throw new Error("A Codex command is required for a custom source.");
    }
  }

  if (kind === "ssh") {
    const sshSettings = settings as CachedSourceSshSettings;

    if (sshSettings.host.trim().length === 0) {
      throw new Error("An SSH host is required.");
    }

    if (sshSettings.port !== null && (
      !Number.isInteger(sshSettings.port)
      || sshSettings.port < 1
      || sshSettings.port > 65535
    )) {
      throw new Error("The SSH port must be an integer between 1 and 65535.");
    }
  }
}

/**
 * Serializes source settings for SQLite storage.
 *
 * @param settings Source-specific settings.
 * @returns JSON document.
 */
export function serializeSourceSettings(settings: CachedSourceSettings): string {
  if ("commandMode" in settings && settings.commandMode === "auto") {
    return JSON.stringify({
      commandMode: "auto",
      command: null,
      color: settings.color,
      openFolderCommand: normalizeNullableText(settings.openFolderCommand),
      openFileCommand: normalizeNullableText(settings.openFileCommand)
    });
  }

  if ("commandMode" in settings && settings.commandMode === "custom") {
    return JSON.stringify({
      commandMode: "custom",
      command: normalizeNullableText(settings.command),
      hasLocalAccess: settings.hasLocalAccess === true,
      color: settings.color,
      openFolderCommand: normalizeNullableText(settings.openFolderCommand),
      openFileCommand: normalizeNullableText(settings.openFileCommand)
    });
  }

  return JSON.stringify(settings);
}

/**
 * Parses and normalizes a source settings document.
 *
 * @param kind Source kind that owns the settings.
 * @param value Raw JSON value read from SQLite.
 * @returns Source settings.
 */
export function parseSourceSettings(kind: CachedSourceKind, value: string): CachedSourceSettings {
  try {
    const parsed = parseSettingsObject(value);

    if (kind === "custom") {
      return parseCustomSourceSettings(parsed);
    }

    if (kind === "wsl") {
      return parseWslSourceSettings(parsed);
    }

    if (kind === "ssh") {
      return parseSshSourceSettings(parsed);
    }

    return parseLocalSourceSettings(parsed);
  } catch {
    return createDefaultSourceSettingsForKind(kind);
  }
}

/**
 * Creates safe defaults for one source kind.
 *
 * @param kind Source kind.
 * @returns Source settings matching the kind.
 */
function createDefaultSourceSettingsForKind(kind: CachedSourceKind): CachedSourceSettings {
  if (kind === "custom") {
    return createDefaultCustomSourceSettings();
  }

  if (kind === "wsl") {
    return { distro: null, codexCommand: "codex", color: "blue" };
  }

  if (kind === "ssh") {
    return {
      host: "",
      user: null,
      port: null,
      identityFile: null,
      codexCommand: "codex",
      color: "blue"
    };
  }

  return createDefaultLocalSourceSettings();
}

/**
 * Parses local source settings from a decoded JSON object.
 *
 * @param parsed Decoded settings document.
 * @returns Local source settings.
 */
function parseLocalSourceSettings(parsed: Record<string, unknown>): CachedSourceLocalSettings {
  return {
    commandMode: "auto",
    command: null,
    color: normalizeSourceColor(parsed.color),
    openFolderCommand: normalizeNullableText(readLocalAccessValue(parsed, "openFolderCommand")),
    openFileCommand: normalizeNullableText(readLocalAccessValue(parsed, "openFileCommand"))
  };
}

/**
 * Parses custom source settings from a decoded JSON object.
 *
 * @param parsed Decoded settings document.
 * @returns Custom source settings.
 */
function parseCustomSourceSettings(parsed: Record<string, unknown>): CachedSourceCustomSettings {
  return {
    commandMode: "custom",
    command: normalizeNullableText(readStringValue(parsed, "command")),
    hasLocalAccess: "hasLocalAccess" in parsed ? parsed.hasLocalAccess === true : false,
    color: normalizeSourceColor(parsed.color),
    openFolderCommand: normalizeNullableText(readLocalAccessValue(parsed, "openFolderCommand")),
    openFileCommand: normalizeNullableText(readLocalAccessValue(parsed, "openFileCommand"))
  };
}

/**
 * Parses WSL source settings from a decoded JSON object.
 *
 * @param parsed Decoded settings document.
 * @returns WSL source settings.
 */
function parseWslSourceSettings(parsed: Record<string, unknown>): CachedSourceWslSettings {
  return {
    distro: normalizeNullableText(readStringValue(parsed, "distro")),
    codexCommand: "codexCommand" in parsed && typeof parsed.codexCommand === "string"
      ? parsed.codexCommand
      : "codex",
    color: normalizeSourceColor(parsed.color)
  };
}

/**
 * Parses SSH source settings from a decoded JSON object.
 *
 * @param parsed Decoded settings document.
 * @returns SSH source settings.
 */
function parseSshSourceSettings(parsed: Record<string, unknown>): CachedSourceSshSettings {
  return {
    host: "host" in parsed && typeof parsed.host === "string" ? parsed.host.trim() : "",
    user: normalizeNullableText(readStringValue(parsed, "user")),
    port: "port" in parsed && typeof parsed.port === "number" ? parsed.port : null,
    identityFile: normalizeNullableText(readStringValue(parsed, "identityFile")),
    codexCommand: "codexCommand" in parsed && typeof parsed.codexCommand === "string"
      ? parsed.codexCommand
      : "codex",
    color: normalizeSourceColor(parsed.color)
  };
}

/**
 * Reads local opener settings from a settings union.
 *
 * @param parsed Decoded settings document.
 * @param key Local access setting key.
 * @returns Raw text value, or `null`.
 */
function readLocalAccessValue(
  parsed: Record<string, unknown>,
  key: "openFolderCommand" | "openFileCommand"
): string | null {
  const value = parsed[key];
  return typeof value === "string" ? value : null;
}

/**
 * Parses a raw JSON settings value into a plain object.
 *
 * @param value Raw JSON settings string.
 * @returns Plain settings object.
 */
function parseSettingsObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;

  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }

  return {};
}

/**
 * Reads one optional string setting from a plain settings object.
 *
 * @param parsed Plain settings object.
 * @param key Setting key.
 * @returns String value, or `null`.
 */
function readStringValue(parsed: Record<string, unknown>, key: string): string | null {
  const value = parsed[key];
  return typeof value === "string" ? value : null;
}

/**
 * Normalizes a Codex command while keeping a safe default for empty input.
 *
 * @param command Optional command text.
 * @returns Trimmed command or the default Codex command.
 */
function normalizeCommand(command: string | undefined): string {
  const normalizedCommand = command?.trim() ?? "";
  return normalizedCommand.length > 0 ? normalizedCommand : "codex";
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
