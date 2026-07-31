/**
 * Maps usage history payloads to chart series and formats chart labels.
 */
import type {
  OpenCodexUsageHistory,
  OpenCodexUsageHistoryRateLimitSeries
} from "@open-codex-ui/opencodex-protocol";

import type { UsageHistoryChartSeries } from "./UsageHistoryChart";

export type TokenVisibility = {
  input: boolean;
  cachedInput: boolean;
  output: boolean;
};

/**
 * Maps one backend rate-limit series to chart data.
 *
 * @param series Backend series.
 * @returns Chart series.
 */
export function mapRateSeries(
  series: OpenCodexUsageHistoryRateLimitSeries
): UsageHistoryChartSeries {
  return {
    id: readRateSeriesId(series),
    label: readRateSeriesLabel(series),
    color: "#0969da",
    points: series.points.map((point) => ({
      observedAt: point.observedAt,
      value: point.usedPercent
    }))
  };
}

/**
 * Maps token history to the selected chart curves.
 *
 * @param history Backend history.
 * @param mode Instant or cumulative counters.
 * @param visibility Enabled token curves.
 * @param t Translation callback.
 * @returns Chart series.
 */
export function mapTokenSeries(
  history: OpenCodexUsageHistory | null,
  mode: "instant" | "cumulative",
  visibility: TokenVisibility,
  t: (key: string) => string
): UsageHistoryChartSeries[] {
  if (history === null) {
    return [];
  }

  return [
    visibility.input
      ? createTokenSeries(history, mode, "input", t("usagePage.historyInputTokens"), "#0969da")
      : null,
    visibility.cachedInput
      ? createTokenSeries(
        history,
        mode,
        "cachedInput",
        t("usagePage.historyCachedInputTokens"),
        "#8250df"
      )
      : null,
    visibility.output
      ? createTokenSeries(history, mode, "output", t("usagePage.historyOutputTokens"), "#bc4c00")
      : null
  ].filter((entry): entry is UsageHistoryChartSeries => entry !== null);
}

/**
 * Creates one token category chart series.
 *
 * @param history Backend history.
 * @param mode Counter kind.
 * @param category Token category.
 * @param label Series label.
 * @param color Series color.
 * @returns Chart series.
 */
function createTokenSeries(
  history: OpenCodexUsageHistory,
  mode: "instant" | "cumulative",
  category: "input" | "cachedInput" | "output",
  label: string,
  color: string
): UsageHistoryChartSeries {
  return {
    id: `${mode}-${category}`,
    label,
    color,
    points: history.tokens.map((point) => ({
      observedAt: point.observedAt,
      value: readTokenValue(point, mode, category)
    }))
  };
}

/**
 * Reads one token category from an instant or cumulative point.
 *
 * @param point History point.
 * @param mode Counter kind.
 * @param category Token category.
 * @returns Token count.
 */
function readTokenValue(
  point: OpenCodexUsageHistory["tokens"][number],
  mode: "instant" | "cumulative",
  category: "input" | "cachedInput" | "output"
): number {
  const breakdown = point[mode];

  if (category === "input") {
    return breakdown.inputTokens;
  }

  if (category === "cachedInput") {
    return breakdown.cachedInputTokens;
  }

  return breakdown.outputTokens;
}

/**
 * Finds a rate-limit series by its stable UI key.
 *
 * @param series Available rate-limit series.
 * @param seriesId Selected series key.
 * @returns Matching series, or null.
 */
export function findRateSeries(
  series: OpenCodexUsageHistoryRateLimitSeries[],
  seriesId: string
): OpenCodexUsageHistoryRateLimitSeries | null {
  return series.find((entry) => readRateSeriesId(entry) === seriesId) ?? series[0] ?? null;
}

/**
 * Reads a stable identifier for one rate-limit/window pair.
 *
 * @param series Rate-limit series.
 * @returns Stable UI identifier.
 */
export function readRateSeriesId(series: OpenCodexUsageHistoryRateLimitSeries): string {
  return `${series.limitId ?? "unknown"}:${series.window}:${series.label}`;
}

/**
 * Formats a readable rate-limit series label.
 *
 * @param series Rate-limit series.
 * @returns Display label.
 */
export function readRateSeriesLabel(series: OpenCodexUsageHistoryRateLimitSeries): string {
  return `${series.limitId ?? "unknown"} · ${series.window} · ${series.label}`;
}

/**
 * Formats token counts with compact SI-like units.
 *
 * @param value Token count.
 * @returns Formatted token count.
 */
export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }

  return Math.round(value).toString();
}

/**
 * Formats chart timestamps using the active renderer language.
 *
 * @param value ISO timestamp.
 * @param language I18n language.
 * @returns Compact local date/time.
 */
export function formatDate(value: string, language: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat(language, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  }).format(date);
}

/**
 * Converts a Date into the local value accepted by datetime-local inputs.
 *
 * @param date Date to format.
 * @returns Local date-time input value.
 */
export function toDateTimeInput(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Parses a local datetime-local value.
 *
 * @param value Input value.
 * @returns Parsed Date, or null.
 */
export function readDateTime(value: string): Date | null {
  if (value.length === 0) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Extracts an error message without exposing an arbitrary object to the UI.
 *
 * @param error Unknown request error.
 * @param fallback Fallback message.
 * @returns User-facing message.
 */
export function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}
