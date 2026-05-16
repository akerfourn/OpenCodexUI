import type { v2 } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexPluginAppSummary,
  OpenCodexPluginAvailability,
  OpenCodexPluginDetail,
  OpenCodexPluginHookSummary,
  OpenCodexPluginInstallPolicy,
  OpenCodexPluginListResult,
  OpenCodexPluginMarketplace,
  OpenCodexPluginSkillSummary,
  OpenCodexPluginSourceType,
  OpenCodexPluginSummary
} from "@open-codex-ui/opencodex-protocol";

export function mapPluginListResponse(
  response: v2.PluginListResponse,
  sourceId: string | null
): OpenCodexPluginListResult {
  const featuredPluginIds = response.featuredPluginIds;
  const marketplaces = response.marketplaces.map((marketplace) => (
    mapPluginMarketplace(marketplace, featuredPluginIds)
  ));

  return {
    sourceId,
    marketplaces,
    featuredPluginIds,
    categories: readCategories(marketplaces),
    loadErrors: response.marketplaceLoadErrors.map((error) => error.message)
  };
}

export function mapPluginDetail(plugin: v2.PluginDetail): OpenCodexPluginDetail {
  const marketplaceDisplayName = plugin.summary.interface?.displayName
    ?? plugin.marketplaceName;
  const featuredPluginIds: string[] = [];
  const summary = mapPluginSummary(
    plugin.summary,
    plugin.marketplaceName,
    marketplaceDisplayName,
    plugin.marketplacePath,
    featuredPluginIds
  );

  return {
    marketplaceName: plugin.marketplaceName,
    marketplacePath: stringifyPath(plugin.marketplacePath),
    summary,
    description: plugin.description,
    skills: plugin.skills.map(mapPluginSkill),
    hooks: plugin.hooks.map(mapPluginHook),
    apps: plugin.apps.map(mapPluginApp),
    mcpServers: plugin.mcpServers
  };
}

export function mapPluginApp(app: v2.AppSummary): OpenCodexPluginAppSummary {
  return {
    id: app.id,
    name: app.name,
    description: app.description,
    installUrl: app.installUrl,
    needsAuth: app.needsAuth
  };
}

function mapPluginMarketplace(
  marketplace: v2.PluginMarketplaceEntry,
  featuredPluginIds: string[]
): OpenCodexPluginMarketplace {
  const displayName = marketplace.interface?.displayName ?? marketplace.name;

  return {
    name: marketplace.name,
    displayName,
    path: stringifyPath(marketplace.path),
    plugins: marketplace.plugins.map((plugin) => (
      mapPluginSummary(plugin, marketplace.name, displayName, marketplace.path, featuredPluginIds)
    ))
  };
}

function mapPluginSummary(
  plugin: v2.PluginSummary,
  marketplaceName: string,
  marketplaceDisplayName: string,
  marketplacePath: unknown,
  featuredPluginIds: string[]
): OpenCodexPluginSummary {
  const pluginInterface = plugin.interface;

  return {
    id: plugin.id,
    name: plugin.name,
    marketplaceName,
    marketplaceDisplayName,
    marketplacePath: stringifyPath(marketplacePath),
    displayName: pluginInterface?.displayName ?? plugin.name,
    shortDescription: pluginInterface?.shortDescription ?? null,
    longDescription: pluginInterface?.longDescription ?? null,
    developerName: pluginInterface?.developerName ?? null,
    category: normalizeOptionalString(pluginInterface?.category),
    capabilities: pluginInterface?.capabilities ?? [],
    keywords: plugin.keywords,
    installed: plugin.installed,
    enabled: plugin.enabled,
    installPolicy: mapInstallPolicy(plugin.installPolicy),
    availability: mapAvailability(plugin.availability),
    authPolicy: plugin.authPolicy,
    sourceType: mapPluginSourceType(plugin.source),
    logoUrl: pluginInterface?.logoUrl ?? null,
    composerIconUrl: pluginInterface?.composerIconUrl ?? null,
    isFeatured: featuredPluginIds.includes(plugin.id)
  };
}

function mapPluginSkill(skill: v2.SkillSummary): OpenCodexPluginSkillSummary {
  return {
    name: skill.name,
    displayName: skill.interface?.displayName ?? skill.name,
    description: skill.description,
    shortDescription: skill.interface?.shortDescription ?? skill.shortDescription ?? null,
    enabled: skill.enabled
  };
}

function mapPluginHook(hook: v2.PluginHookSummary): OpenCodexPluginHookSummary {
  return {
    key: hook.key,
    eventName: hook.eventName
  };
}

function readCategories(marketplaces: OpenCodexPluginMarketplace[]): string[] {
  const categories = new Set<string>();

  for (const marketplace of marketplaces) {
    for (const plugin of marketplace.plugins) {
      if (plugin.category !== null) {
        categories.add(plugin.category);
      }
    }
  }

  return Array.from(categories).sort((left, right) => left.localeCompare(right));
}

function mapInstallPolicy(policy: v2.PluginInstallPolicy): OpenCodexPluginInstallPolicy {
  switch (policy) {
    case "AVAILABLE":
      return "available";
    case "INSTALLED_BY_DEFAULT":
      return "installedByDefault";
    case "NOT_AVAILABLE":
      return "notAvailable";
    default:
      return "unknown";
  }
}

function mapAvailability(availability: v2.PluginAvailability): OpenCodexPluginAvailability {
  switch (availability) {
    case "AVAILABLE":
      return "available";
    case "DISABLED_BY_ADMIN":
      return "disabledByAdmin";
    default:
      return "unknown";
  }
}

function mapPluginSourceType(source: v2.PluginSource): OpenCodexPluginSourceType {
  switch (source.type) {
    case "local":
    case "git":
    case "remote":
      return source.type;
    default:
      return "unknown";
  }
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim().length === 0) {
    return null;
  }

  return value;
}

function stringifyPath(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}
