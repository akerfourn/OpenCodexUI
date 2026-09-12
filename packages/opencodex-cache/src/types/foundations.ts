export type CachedThreadScope = "currentProject" | "all";
export type CachedSourceColor = "blue" | "indigo" | "purple" | "pink" | "red" | "orange" | "amber" | "teal";
export type CachedLogType = "error" | "warning" | "info";
export type CachedLogCategory = "performanceSlowdown";

/**
 * Serialized model metadata cached for one Codex source.
 */
export type CachedModelCatalog = {
  sourceId: string;
  modelsJson: string;
  updatedAt: string;
};
