import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

/**
 * Filters a cached thread collection to structurally reachable descendants.
 *
 * @param rootThreadId Root thread identifier.
 * @param threads Candidate cached threads in display order.
 * @returns Descendants in the original order, excluding cycles and unrelated roots.
 */
export function filterDescendantThreads(
  rootThreadId: string,
  threads: readonly OpenCodexThread[]
): OpenCodexThread[] {
  const threadsById = new Map(threads.map((thread) => [thread.id, thread]));

  return threads.filter((thread) => {
    const visitedThreadIds = new Set<string>([thread.id]);
    let parentThreadId = thread.parentThreadId
      ?? thread.subAgentSource?.parentThreadId
      ?? null;

    while (parentThreadId !== null) {
      if (parentThreadId === rootThreadId) {
        return true;
      }

      if (visitedThreadIds.has(parentThreadId)) {
        return false;
      }

      visitedThreadIds.add(parentThreadId);
      const parentThread = threadsById.get(parentThreadId);

      if (parentThread === undefined) {
        return false;
      }

      parentThreadId = parentThread.parentThreadId
        ?? parentThread.subAgentSource?.parentThreadId
        ?? null;
    }

    return false;
  });
}

/**
 * Keeps only user-facing top-level threads.
 *
 * @param threads Thread metadata to filter.
 * @returns Threads that are not spawned sub-agent threads.
 */
export function filterMainThreads<T extends OpenCodexThread>(threads: T[]): T[] {
  return threads.filter((thread) => !isSubAgentThread(thread));
}

/**
 * Checks whether a thread belongs to a spawned sub-agent.
 *
 * @param thread Thread metadata.
 * @returns Whether the thread is a sub-agent child.
 */
function isSubAgentThread(thread: OpenCodexThread): boolean {
  if (thread.parentThreadId !== null) {
    return true;
  }

  const threadSource = thread.threadSource ?? "";
  return threadSource.startsWith("subAgent");
}
