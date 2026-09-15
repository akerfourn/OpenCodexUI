import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

/**
 * Removes repeated thread rows while preserving the first row's order and metadata.
 *
 * @param threads Thread metadata collection that may contain overlapping updates.
 * @returns Thread metadata with one row per identifier.
 */
export function deduplicateThreadsById(
  threads: readonly OpenCodexThread[]
): OpenCodexThread[] {
  const seenThreadIds = new Set<string>();
  const uniqueThreads: OpenCodexThread[] = [];

  for (const thread of threads) {
    if (seenThreadIds.has(thread.id)) {
      continue;
    }

    seenThreadIds.add(thread.id);
    uniqueThreads.push(thread);
  }

  return uniqueThreads;
}
