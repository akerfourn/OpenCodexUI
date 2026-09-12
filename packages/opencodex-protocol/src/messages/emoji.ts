/** A user customization applied to one default emoji entry. */
export type OpenCodexEmojiOverride = {
  addedAliases: string[];
  removedDefaultAliases: string[];
};

/** Persisted global customizations for the application emoji catalogue. */
export type OpenCodexEmojiCatalogOverrides = {
  schemaVersion: 1;
  overrides: Record<string, OpenCodexEmojiOverride>;
};
