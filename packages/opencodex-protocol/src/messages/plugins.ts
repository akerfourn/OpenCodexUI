/**
 * Plugin installation policy reported by Codex.
 */
export type OpenCodexPluginInstallPolicy =
  | "available"
  | "notAvailable"
  | "installedByDefault"
  | "unknown";

/**
 * Plugin availability reported by Codex.
 */
export type OpenCodexPluginAvailability = "available" | "disabledByAdmin" | "unknown";

/**
 * Plugin source kind reported by Codex.
 */
export type OpenCodexPluginSourceType = "local" | "git" | "remote" | "unknown";

/**
 * Plugin marketplace containing installable plugin summaries.
 */
export type OpenCodexPluginMarketplace = {
  name: string;
  displayName: string;
  path: string | null;
  plugins: OpenCodexPluginSummary[];
};

/**
 * Plugin summary displayed in the plugin store.
 */
export type OpenCodexPluginSummary = {
  id: string;
  name: string;
  marketplaceName: string;
  marketplaceDisplayName: string;
  marketplacePath: string | null;
  displayName: string;
  shortDescription: string | null;
  longDescription: string | null;
  developerName: string | null;
  category: string | null;
  capabilities: string[];
  keywords: string[];
  installed: boolean;
  enabled: boolean;
  installPolicy: OpenCodexPluginInstallPolicy;
  availability: OpenCodexPluginAvailability;
  authPolicy: string;
  sourceType: OpenCodexPluginSourceType;
  logoUrl: string | null;
  composerIconUrl: string | null;
  isFeatured: boolean;
};

/**
 * Skill provided by a plugin.
 */
export type OpenCodexPluginSkillSummary = {
  name: string;
  displayName: string;
  description: string;
  shortDescription: string | null;
  enabled: boolean;
};

/**
 * App connector provided by a plugin.
 */
export type OpenCodexPluginAppSummary = {
  id: string;
  name: string;
  description: string | null;
  installUrl: string | null;
  needsAuth: boolean;
};

/**
 * Hook provided by a plugin.
 */
export type OpenCodexPluginHookSummary = {
  key: string;
  eventName: string;
};

/**
 * Detailed plugin metadata loaded on demand.
 */
export type OpenCodexPluginDetail = {
  marketplaceName: string;
  marketplacePath: string | null;
  summary: OpenCodexPluginSummary;
  description: string | null;
  skills: OpenCodexPluginSkillSummary[];
  hooks: OpenCodexPluginHookSummary[];
  apps: OpenCodexPluginAppSummary[];
  mcpServers: string[];
};

/**
 * Full plugin list grouped by marketplace.
 */
export type OpenCodexPluginListResult = {
  sourceId: string | null;
  marketplaces: OpenCodexPluginMarketplace[];
  featuredPluginIds: string[];
  categories: string[];
  loadErrors: string[];
};

/**
 * Bounded plugin search page returned by Codex.
 */
export type OpenCodexPluginSearchResult = {
  sourceId: string | null;
  plugins: OpenCodexPluginSummary[];
  nextCursor: string | null;
  loadErrors: string[];
};

/**
 * Installed plugins returned without loading the complete remote catalog.
 */
export type OpenCodexInstalledPluginListResult = {
  sourceId: string | null;
  plugins: OpenCodexPluginSummary[];
  loadErrors: string[];
};

/**
 * Result of an explicit remote plugin catalog refresh.
 */
export type OpenCodexPluginCatalogRefreshResult = {
  ok: true;
  loadErrors: string[];
};

/**
 * Result returned after installing a plugin.
 */
export type OpenCodexPluginInstallResult = {
  ok: true;
  authPolicy: string | null;
  appsNeedingAuth: OpenCodexPluginAppSummary[];
};
