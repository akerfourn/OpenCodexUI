import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEmojiCatalogOverrides,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

import {
  getComposerEmojiAliases,
  getDefaultComposerEmojiAliases,
  normalizeComposerEmojiSearchText
} from "../../components/chat/composerEmojis";

/** Request capability required by the global emoji catalogue store. */
export interface EmojiCatalogRequestPort {
  request<T = unknown>(request: OpenCodexRequest): Promise<T>;
}

/** Stores the global user customizations layered over the built-in catalogue. */
export class EmojiCatalogStore {
  /** Current validated user override snapshot. */
  overrides: OpenCodexEmojiCatalogOverrides = createEmptyOverrides();
  /** Whether the first persisted snapshot has been loaded. */
  isLoaded = false;
  /** Whether the initial snapshot is being loaded. */
  isLoading = false;
  /** Whether an override update is currently being persisted. */
  isSaving = false;
  /** Last persistence failure displayed by the Home editor. */
  errorMessage: string | null = null;

  /** Creates the emoji catalogue store. */
  constructor(private readonly root: EmojiCatalogRequestPort) {
    makeAutoObservable<EmojiCatalogStore, "root">(this, { root: false });
  }

  /** Loads the global override file once per application session. */
  async load(): Promise<void> {
    if (this.isLoaded || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    try {
      const overrides = await this.root.request<OpenCodexEmojiCatalogOverrides>({
        type: "emojiCatalog.get"
      });

      runInAction(() => {
        this.overrides = cloneOverrides(overrides);
        this.isLoaded = true;
        this.isLoading = false;
      });
    } catch (error: unknown) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
        this.isLoaded = true;
        this.isLoading = false;
      });
    }
  }

  /** Returns effective aliases after applying the persisted overrides. */
  getAliases(emoji: string): string[] {
    return getComposerEmojiAliases(emoji, this.overrides);
  }

  /** Returns built-in aliases, including aliases currently hidden by the user. */
  getDefaultAliases(emoji: string): string[] {
    return getDefaultComposerEmojiAliases(emoji);
  }

  /** Returns aliases added by the user for one emoji. */
  getAddedAliases(emoji: string): string[] {
    return [...(this.overrides.overrides[emoji]?.addedAliases ?? [])];
  }

  /** Returns built-in aliases hidden by the user for one emoji. */
  getRemovedDefaultAliases(emoji: string): string[] {
    return [...(this.overrides.overrides[emoji]?.removedDefaultAliases ?? [])];
  }

  /** Adds a custom alias, or restores a matching built-in alias. */
  async addAlias(emoji: string, value: string): Promise<void> {
    const alias = value.trim();

    if (alias.length === 0 || this.isSaving) {
      return;
    }

    const defaultAlias = this.findDefaultAlias(emoji, alias);
    const current = this.readOverride(emoji);
    const next = defaultAlias === null
      ? {
          ...current,
          addedAliases: appendAlias(current.addedAliases, alias)
        }
      : {
          ...current,
          addedAliases: removeAlias(current.addedAliases, defaultAlias),
          removedDefaultAliases: removeAlias(current.removedDefaultAliases, defaultAlias)
        };

    await this.persistOverrides(this.withOverride(emoji, next));
  }

  /** Removes a built-in or user-added alias while preserving the default catalogue. */
  async removeAlias(emoji: string, alias: string): Promise<void> {
    if (this.isSaving) {
      return;
    }

    const current = this.readOverride(emoji);
    const defaultAlias = this.findDefaultAlias(emoji, alias);
    const next = defaultAlias === null
      ? {
          ...current,
          addedAliases: removeAlias(current.addedAliases, alias)
        }
      : {
          ...current,
          removedDefaultAliases: appendAlias(current.removedDefaultAliases, defaultAlias),
          addedAliases: removeAlias(current.addedAliases, defaultAlias)
        };

    await this.persistOverrides(this.withOverride(emoji, next));
  }

  /** Removes all customizations for one emoji and restores its defaults. */
  async resetEmoji(emoji: string): Promise<void> {
    if (this.isSaving || this.overrides.overrides[emoji] === undefined) {
      return;
    }

    await this.persistOverrides(this.withoutOverride(emoji));
  }

  /** Clears the last persistence error before a new user action. */
  clearError(): void {
    this.errorMessage = null;
  }

  /** Finds a default alias without treating accents or case as significant. */
  private findDefaultAlias(emoji: string, value: string): string | null {
    const normalizedValue = normalizeComposerEmojiSearchText(value);
    return this.getDefaultAliases(emoji).find((alias) => (
      normalizeComposerEmojiSearchText(alias) === normalizedValue
    )) ?? null;
  }

  /** Reads an existing override without exposing the observable object. */
  private readOverride(emoji: string): { addedAliases: string[]; removedDefaultAliases: string[] } {
    const override = this.overrides.overrides[emoji];
    return {
      addedAliases: [...(override?.addedAliases ?? [])],
      removedDefaultAliases: [...(override?.removedDefaultAliases ?? [])]
    };
  }

  /** Applies one override and drops empty entries from the persisted snapshot. */
  private withOverride(
    emoji: string,
    override: { addedAliases: string[]; removedDefaultAliases: string[] }
  ): OpenCodexEmojiCatalogOverrides {
    const overrides = cloneOverrides(this.overrides);

    if (override.addedAliases.length === 0 && override.removedDefaultAliases.length === 0) {
      delete overrides.overrides[emoji];
    } else {
      overrides.overrides[emoji] = override;
    }

    return overrides;
  }

  /** Removes one override from a cloned snapshot. */
  private withoutOverride(emoji: string): OpenCodexEmojiCatalogOverrides {
    const overrides = cloneOverrides(this.overrides);
    delete overrides.overrides[emoji];
    return overrides;
  }

  /** Persists a complete snapshot and reverts the optimistic change on failure. */
  private async persistOverrides(next: OpenCodexEmojiCatalogOverrides): Promise<void> {
    const previous = this.overrides;
    this.overrides = cloneOverrides(next);
    this.isSaving = true;
    this.errorMessage = null;

    try {
      const saved = await this.root.request<OpenCodexEmojiCatalogOverrides>({
        type: "emojiCatalog.update",
        overrides: next
      });

      runInAction(() => {
        this.overrides = cloneOverrides(saved);
        this.isSaving = false;
      });
    } catch (error: unknown) {
      runInAction(() => {
        this.overrides = previous;
        this.errorMessage = readErrorMessage(error);
        this.isSaving = false;
      });
    }
  }
}

/** Creates an empty versioned snapshot for the first application launch. */
function createEmptyOverrides(): OpenCodexEmojiCatalogOverrides {
  return {
    schemaVersion: 1,
    overrides: {}
  };
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

/** Adds an alias when no normalized equivalent is present. */
function appendAlias(aliases: readonly string[], value: string): string[] {
  if (aliases.some((alias) => (
    normalizeComposerEmojiSearchText(alias) === normalizeComposerEmojiSearchText(value)
  ))) {
    return [...aliases];
  }

  return [...aliases, value];
}

/** Removes all normalized equivalents of one alias. */
function removeAlias(aliases: readonly string[], value: string): string[] {
  const normalizedValue = normalizeComposerEmojiSearchText(value);
  return aliases.filter((alias) => normalizeComposerEmojiSearchText(alias) !== normalizedValue);
}

/** Converts a rejected request into a compact user-facing message. */
function readErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "Unable to save the emoji catalogue.";
}
