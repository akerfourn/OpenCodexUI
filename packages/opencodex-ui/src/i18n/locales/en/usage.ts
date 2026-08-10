/**
 * English translations for the usage UI domain.
 */
import type { TranslationShape } from "../../translationShape.js";
import type { frUsage } from "../fr/usage.js";

export const enUsage = {
  usage: {
    labels: {
      "5h": "5h",
      weekly: "Week",
      usage: "Usage"
    },
    tooltip: "{{label}}: {{usedPercent}}% used, {{remainingPercent}}% remaining. Reset: {{reset}}"
  },
  usagePage: {
    default: "Default",
    description: "Track usage limits received from Codex.",
    empty: "No usage limits available yet.",
    historyAggregation: "Granularity",
    historyAggregationAuto: "Automatic",
    historyAggregationDay: "Per day",
    historyAggregationHour: "Per hour",
    historyAggregationMinute: "Per minute",
    historyAggregationRaw: "Every snapshot",
    historyCachedInputTokens: "Cached input tokens",
    historyCachedShort: "Cache",
    historyCumulativeTokens: "Cumulative tokens",
    historyCurves: "Curves to display",
    historyDescription: "Visualize recorded limits and token usage for one source over time.",
    historyFrom: "From",
    historyInputShort: "Input",
    historyInputTokens: "Input tokens",
    historyInvalidRange: "The selected period is invalid.",
    historyLoadError: "Unable to load usage history.",
    historyNoData: "No data recorded for this period.",
    historyOpen: "Open history",
    historyOutputShort: "Output",
    historyOutputTokens: "Output tokens",
    historyPartialData: "Some token measurements start without a known previous state. The first points may be incomplete.",
    historyPoints: "{{count}} token point(s)",
    historyPreset24h: "24 h",
    historyPreset30d: "30 days",
    historyPreset7d: "7 days",
    historyRateLimit: "Usage window",
    historyRateLimitChart: "Source usage",
    historyResolvedAggregation: "{{aggregation}} measurements",
    historySource: "Source",
    historyTitle: "Usage history",
    historyTo: "To",
    historyInstantTokens: "Tokens consumed per period",
    noWindow: "No usage window available.",
    plan: "Plan: {{plan}}",
    refresh: "Refresh",
    resetDateTooltip: "On {{reset}}",
    resetRelative: "(Reset {{reset}})",
    setDefault: "Use as default",
    title: "Usage",
    usedPercentTooltip: "{{usedPercent}}% used"
  }
} satisfies TranslationShape<typeof frUsage>;
