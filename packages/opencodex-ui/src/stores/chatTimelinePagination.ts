import type { OpenCodexTurn } from "@open-codex-ui/opencodex-protocol";

/** Result returned by an older-turn pagination request. */
export interface ChatTimelinePageResult {
  turns: OpenCodexTurn[];
  hasMoreOlderMessages: boolean;
}

/**
 * Reads the typed result of an older-turn request defensively.
 *
 * @param value Raw RPC response.
 * @returns Parsed turns and pagination flag.
 */
export function readLoadOlderResult(value: unknown): ChatTimelinePageResult {
  if (typeof value !== "object" || value === null) {
    return { turns: [], hasMoreOlderMessages: false };
  }

  const result = value as {
    turns?: unknown;
    hasMoreOlderMessages?: unknown;
  };

  return {
    turns: Array.isArray(result.turns) ? result.turns as OpenCodexTurn[] : [],
    hasMoreOlderMessages: result.hasMoreOlderMessages === true
  };
}
