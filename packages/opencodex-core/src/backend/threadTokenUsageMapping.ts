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

function readNumber(value: unknown): number {
  return readNullableNumber(value) ?? 0;
}

function calculateUsedPercent(totalTokens: number, modelContextWindow: number | null): number | null {
  if (modelContextWindow === null || modelContextWindow <= 0) {
    return null;
  }

  return Math.min(Math.max((totalTokens / modelContextWindow) * 100, 0), 100);
}
