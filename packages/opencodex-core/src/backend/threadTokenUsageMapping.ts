/**
 * Maps Codex thread token usage notifications to OpenCodexUI models.
 */
import type {
  OpenCodexThreadTokenUsage,
  OpenCodexThreadTokenUsageBreakdown
} from "@open-codex-ui/opencodex-protocol";

import { readNullableNumber, readObject, readString } from "../mapping.js";

/**
 * Maps a Codex `thread/tokenUsage/updated` notification payload.
 *
 * @param params Codex notification params.
 * @returns Mapped token usage, or `null` when the payload is incomplete.
 */
export function mapThreadTokenUsageNotification(
  params: unknown
): OpenCodexThreadTokenUsage | null {
  const value = readObject(params);
  const threadId = readString(value.threadId);
  const turnId = readString(value.turnId);
  const tokenUsage = readObject(value.tokenUsage);
  const total = mapTokenUsageBreakdown(tokenUsage.total);
  const last = mapTokenUsageBreakdown(tokenUsage.last);
  const modelContextWindow = readNullableNumber(tokenUsage.modelContextWindow);

  if (threadId.length === 0 || turnId.length === 0) {
    return null;
  }

  return {
    threadId,
    turnId,
    total,
    last,
    contextWindowTokens: last.totalTokens,
    modelContextWindow,
    usedPercent: calculateUsedPercent(last.totalTokens, modelContextWindow)
  };
}

/**
 * Maps one raw token-usage breakdown object.
 *
 * @param value Raw breakdown payload.
 * @returns Token counts with missing fields defaulted to zero.
 */
function mapTokenUsageBreakdown(value: unknown): OpenCodexThreadTokenUsageBreakdown {
  const breakdown = readObject(value);

  return {
    totalTokens: readNumber(breakdown.totalTokens),
    inputTokens: readNumber(breakdown.inputTokens),
    cachedInputTokens: readNumber(breakdown.cachedInputTokens),
    outputTokens: readNumber(breakdown.outputTokens),
    reasoningOutputTokens: readNumber(breakdown.reasoningOutputTokens)
  };
}

/**
 * Reads a nullable number with a zero default for token counters.
 *
 * @param value Raw numeric value.
 * @returns Parsed number or zero.
 */
function readNumber(value: unknown): number {
  return readNullableNumber(value) ?? 0;
}

/**
 * Calculates context-window usage as a bounded percentage.
 *
 * @param totalTokens Tokens currently used.
 * @param modelContextWindow Maximum model context window.
 * @returns Used percentage, or `null` when the maximum is unknown.
 */
function calculateUsedPercent(totalTokens: number, modelContextWindow: number | null): number | null {
  if (modelContextWindow === null || modelContextWindow <= 0) {
    return null;
  }

  return Math.min(Math.max((totalTokens / modelContextWindow) * 100, 0), 100);
}
