/**
 * English translations for the support UI domain.
 */
import type { TranslationShape } from "../../translationShape.js";
import type { frSupport } from "../fr/support.js";

export const enSupport = {
  logs: {
    applyCleanup: "Clean",
    cancel: "Cancel",
    cleanup: "Clean logs",
    cleanupAll: "Delete everything",
    cleanupAmount: "Duration",
    cleanupMode: "Mode",
    cleanupOlderThan: "Keep recent logs",
    cleanupUnit: "Unit",
    copy: "Copy log",
    delete: "Delete log",
    details: "Log details",
    empty: "No logs yet.",
    loadMore: "Load more logs",
    allTypes: "All types",
    noMatching: "No log matches the selected types.",
    noTypesSelected: "No type",
    maxEntries: "Maximum entries",
    policyCategories: {
      info: "Information",
      performanceSlowdown: "Performance slowdowns"
    },
    policyInvalidNumber: "Enter a whole number from {{min}} to {{max}}.",
    policyMode: "Storage mode",
    policyModes: {
      disabled: "Disabled",
      retained: "Limited history",
      session: "Session only",
      unlimited: "Unlimited history"
    },
    policyPersistenceNote: "Limited history purges logs older than the selected duration. Disabled and session-only modes stop future disk persistence and keep existing disk history until cleanup.",
    policySaveError: "Unable to save log storage settings.",
    policySettings: "Log storage settings",
    policySettingsDescription: "Choose how information and performance slowdown logs are retained. Changes apply after they are saved.",
    retentionDays: "Retention days",
    savePolicies: "Save settings",
    session: "Session",
    sessionTooltip: "Kept only during this app session; lost when the app closes.",
    selectedTypes: "{{count}} types selected",
    title: "Logs",
    typeFilter: "Displayed types",
    types: {
      error: "Error",
      info: "Information",
      warning: "Warning"
    },
    units: {
      days: "days",
      hours: "hours",
      months: "months",
      weeks: "weeks"
    },
    viewLogs: "View logs"
  },
  plugins: {
    categories: {
      all: "All"
    },
    category: "Category",
    catalogNotLoaded: "The remote catalog is not loaded automatically so the application remains " +
      "responsive.",
    close: "Close",
    description: "Explore plugins exposed by Codex for the selected source.",
    empty: "No plugin matches the current filters.",
    enabled: "Enabled",
    experimentalNotice: "This integration uses Codex's experimental plugins API. Metadata may vary across CLI versions.",
    featured: "Featured",
    filter: "Type",
    filters: {
      all: "All plugins",
      available: "Available",
      installed: "Installed"
    },
    install: "Install",
    installed: "Installed",
    installedByDefault: "Installed by default",
    integrations: "Integrations",
    loadCatalog: "Browse catalog",
    loadMore: "Show more",
    mcpServer: "MCP server",
    needsAuth: "Authentication required",
    noDescription: "No description available.",
    noIntegrations: "No declared integration.",
    noSkills: "No declared skill.",
    noSource: "No Codex source available.",
    refresh: "Refresh plugins",
    refreshCatalog: "Update catalog",
    refineSearch: "The display limit has been reached. Refine your search to explore other plugins.",
    search: "Search plugins",
    skills: "Skills",
    source: "Source",
    sourceUnavailable: "The selected Codex source is inactive.",
    title: "Plugins",
    uninstall: "Uninstall"
  }
} satisfies TranslationShape<typeof frSupport>;
