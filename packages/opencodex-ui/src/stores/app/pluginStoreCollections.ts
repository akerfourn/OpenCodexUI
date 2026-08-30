import type { OpenCodexPluginSummary } from "@open-codex-ui/opencodex-protocol";

import type { PluginInstallFilter } from "./PluginsStore";

/** Combines catalog and installed results while preferring fresh installed state. */
export function combinePlugins(
  installedPlugins: OpenCodexPluginSummary[],
  catalogPlugins: OpenCodexPluginSummary[]
): OpenCodexPluginSummary[] {
  const pluginsById = new Map<string, OpenCodexPluginSummary>();

  for (const plugin of catalogPlugins) {
    pluginsById.set(plugin.id, plugin);
  }

  for (const plugin of installedPlugins) {
    pluginsById.set(plugin.id, plugin);
  }

  return Array.from(pluginsById.values());
}

/** Filters and orders the currently loaded plugin summaries. */
export function filterPlugins(
  plugins: OpenCodexPluginSummary[],
  installFilter: PluginInstallFilter,
  category: string
): OpenCodexPluginSummary[] {
  return plugins
    .filter((plugin) => matchesInstallFilter(plugin, installFilter))
    .filter((plugin) => category.length === 0 || plugin.category === category)
    .sort(comparePlugins);
}

/** Reads sorted categories from the bounded set currently visible to the UI. */
export function readPluginCategories(plugins: OpenCodexPluginSummary[]): string[] {
  const categories = new Set<string>();

  for (const plugin of plugins) {
    if (plugin.category !== null) {
      categories.add(plugin.category);
    }
  }

  return Array.from(categories).sort((left, right) => left.localeCompare(right));
}

/** Converts an unknown request failure to displayable text. */
export function readPluginErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/** Checks whether a plugin matches the selected installation-state filter. */
function matchesInstallFilter(
  plugin: OpenCodexPluginSummary,
  installFilter: PluginInstallFilter
): boolean {
  if (installFilter === "installed") {
    return plugin.installed;
  }

  if (installFilter === "available") {
    return !plugin.installed && plugin.installPolicy === "available";
  }

  return true;
}

/** Sorts featured and installed plugins before alphabetic catalog entries. */
function comparePlugins(left: OpenCodexPluginSummary, right: OpenCodexPluginSummary): number {
  if (left.isFeatured !== right.isFeatured) {
    return left.isFeatured ? -1 : 1;
  }

  if (left.installed !== right.installed) {
    return left.installed ? -1 : 1;
  }

  return left.displayName.localeCompare(right.displayName);
}
