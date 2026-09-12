/** Persists user emoji alias overrides in the Electron application data directory. */
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  OpenCodexEmojiCatalogOverrides,
  OpenCodexEmojiOverride
} from "@open-codex-ui/opencodex-protocol";

const SCHEMA_VERSION = 1;
const FILE_NAME = "emoji-overrides.json";
const MAX_EMOJI_KEY_LENGTH = 32;
const MAX_ALIAS_LENGTH = 120;
const MAX_ALIASES_PER_EMOJI = 100;

const EMPTY_OVERRIDES: OpenCodexEmojiCatalogOverrides = {
  schemaVersion: SCHEMA_VERSION,
  overrides: {}
};

/** Stores only user changes so application defaults remain recoverable. */
export class EmojiCatalogStore {
  private readonly filePath: string;
  private loadedOverrides: OpenCodexEmojiCatalogOverrides | null = null;
  private loadPromise: Promise<OpenCodexEmojiCatalogOverrides> | null = null;

  /** Creates a store rooted in Electron's user data directory. */
  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, FILE_NAME);
  }

  /** Reads and validates the persisted user overrides. */
  async get(): Promise<OpenCodexEmojiCatalogOverrides> {
    if (this.loadedOverrides !== null) {
      return cloneOverrides(this.loadedOverrides);
    }

    this.loadPromise ??= this.readFromDisk();
    this.loadedOverrides = await this.loadPromise;
    this.loadPromise = null;
    return cloneOverrides(this.loadedOverrides);
  }

  /** Validates and atomically persists a complete override snapshot. */
  async update(value: unknown): Promise<OpenCodexEmojiCatalogOverrides> {
    const normalized = normalizeOverrides(value);
    await this.get();
    await this.writeToDisk(normalized);
    this.loadedOverrides = normalized;
    return cloneOverrides(normalized);
  }

  /** Loads malformed or missing files as an empty customization set. */
  private async readFromDisk(): Promise<OpenCodexEmojiCatalogOverrides> {
    try {
      const content = await readFile(this.filePath, "utf8");
      return normalizeOverrides(JSON.parse(content) as unknown);
    } catch {
      return createEmptyOverrides();
    }
  }

  /** Writes a complete snapshot through a temporary file and rename. */
  private async writeToDisk(overrides: OpenCodexEmojiCatalogOverrides): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    const content = `${JSON.stringify(overrides, null, 2)}\n`;

    try {
      await writeFile(temporaryPath, content, "utf8");
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      try {
        await unlink(temporaryPath);
      } catch {
        // The original write error remains the actionable failure.
      }

      throw error;
    }
  }
}

/** Converts an untrusted payload into the versioned persisted shape. */
export function normalizeOverrides(value: unknown): OpenCodexEmojiCatalogOverrides {
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION || !isRecord(value.overrides)) {
    return createEmptyOverrides();
  }

  const overrides: Record<string, OpenCodexEmojiOverride> = {};

  for (const [emoji, rawOverride] of Object.entries(value.overrides)) {
    if (!isValidEmojiKey(emoji) || !isRecord(rawOverride)) {
      continue;
    }

    const normalizedOverride = normalizeOverride(rawOverride);

    if (normalizedOverride.addedAliases.length > 0 ||
      normalizedOverride.removedDefaultAliases.length > 0) {
      overrides[emoji] = normalizedOverride;
    }
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    overrides
  };
}

/** Creates a fresh empty override object for callers and tests. */
export function createEmptyOverrides(): OpenCodexEmojiCatalogOverrides {
  return {
    schemaVersion: EMPTY_OVERRIDES.schemaVersion,
    overrides: {}
  };
}

/** Normalizes one emoji override while removing duplicates and empty terms. */
function normalizeOverride(value: Record<string, unknown>): OpenCodexEmojiOverride {
  return {
    addedAliases: normalizeAliases(value.addedAliases),
    removedDefaultAliases: normalizeAliases(value.removedDefaultAliases)
  };
}

/** Normalizes a bounded list of user-provided search aliases. */
function normalizeAliases(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const aliases: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }

    const alias = item.trim();

    if (alias.length === 0 || alias.length > MAX_ALIAS_LENGTH || aliases.includes(alias)) {
      continue;
    }

    aliases.push(alias);

    if (aliases.length >= MAX_ALIASES_PER_EMOJI) {
      break;
    }
  }

  return aliases;
}

/** Checks the bounded key shape before accepting user data. */
function isValidEmojiKey(value: string): boolean {
  return value.length > 0 && value.length <= MAX_EMOJI_KEY_LENGTH;
}

/** Narrows unknown JSON values to plain records. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Clones a structured-clone-compatible override snapshot. */
function cloneOverrides(
  overrides: OpenCodexEmojiCatalogOverrides
): OpenCodexEmojiCatalogOverrides {
  return {
    schemaVersion: overrides.schemaVersion,
    overrides: Object.fromEntries(
      Object.entries(overrides.overrides).map(([emoji, override]) => [emoji, {
        addedAliases: [...override.addedAliases],
        removedDefaultAliases: [...override.removedDefaultAliases]
      }])
    )
  };
}
