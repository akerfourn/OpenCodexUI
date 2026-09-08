/** Persists the local distinction between a goal draft and a paused goal. */

const STARTED_GOAL_STORAGE_PREFIX = "opencodexui.goal.started.v1";

/**
 * Reads whether OpenCodexUI previously started a goal for one thread.
 *
 * The native protocol uses `paused` both for saved drafts and paused goals,
 * so this small UI-only marker preserves the distinction across restarts.
 *
 * @param sourceId Source owning the thread.
 * @param threadId Thread owning the goal.
 * @returns Whether the goal was previously started.
 */
export function hasPersistedStartedGoal(sourceId: string, threadId: string): boolean {
  const storage = getLocalStorage();

  if (storage === null) {
    return false;
  }

  try {
    const value = storage.getItem(createStorageKey(sourceId, threadId));
    return value === "1" || value === "started";
  } catch {
    return false;
  }
}

/**
 * Reads whether OpenCodexUI explicitly saved a goal as a draft.
 *
 * @param sourceId Source owning the thread.
 * @param threadId Thread owning the goal.
 * @returns Whether the goal was explicitly saved without starting it.
 */
export function hasPersistedDraftGoal(sourceId: string, threadId: string): boolean {
  const storage = getLocalStorage();

  if (storage === null) {
    return false;
  }

  try {
    return storage.getItem(createStorageKey(sourceId, threadId)) === "draft";
  } catch {
    return false;
  }
}

/**
 * Records that a goal has started at least once.
 *
 * @param sourceId Source owning the thread.
 * @param threadId Thread owning the goal.
 * @returns Nothing.
 */
export function persistStartedGoal(sourceId: string, threadId: string): void {
  const storage = getLocalStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.setItem(createStorageKey(sourceId, threadId), "started");
  } catch {
    // Local persistence is only a UI enhancement; the native goal remains authoritative.
  }
}

/**
 * Records that a goal was explicitly saved without starting it.
 *
 * @param sourceId Source owning the thread.
 * @param threadId Thread owning the goal.
 * @returns Nothing.
 */
export function persistDraftGoal(sourceId: string, threadId: string): void {
  const storage = getLocalStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.setItem(createStorageKey(sourceId, threadId), "draft");
  } catch {
    // Local persistence is best effort and must not affect goal mutations.
  }
}

/**
 * Removes the local lifecycle marker after a goal is cleared.
 *
 * @param sourceId Source owning the thread.
 * @param threadId Thread owning the goal.
 * @returns Nothing.
 */
export function clearPersistedGoal(sourceId: string, threadId: string): void {
  const storage = getLocalStorage();

  if (storage === null) {
    return;
  }

  try {
    storage.removeItem(createStorageKey(sourceId, threadId));
  } catch {
    // Local persistence is best effort and must not affect goal mutations.
  }
}

/** Returns browser storage when the renderer exposes usable local storage. */
function getLocalStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

/** Builds a collision-resistant storage key from the source and thread identities. */
function createStorageKey(sourceId: string, threadId: string): string {
  return [
    STARTED_GOAL_STORAGE_PREFIX,
    encodeURIComponent(sourceId),
    encodeURIComponent(threadId)
  ].join(":");
}
