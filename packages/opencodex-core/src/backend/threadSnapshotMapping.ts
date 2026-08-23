import type { CachedThreadSnapshot } from "@open-codex-ui/opencodex-cache";

/**
 * Checks whether a cached thread shell has never been materialized by Codex.
 *
 * @param snapshot Cached thread snapshot.
 * @returns Whether the snapshot represents an empty pre-first-message thread.
 */
export function isUnmaterializedThreadSnapshot(snapshot: CachedThreadSnapshot): boolean {
  return snapshot.turns.length === 0 && !snapshot.syncState.hasLoadedLatest;
}

/**
 * Attaches a caller-provided source to a cached thread that has no source yet.
 *
 * @param snapshot Cached thread snapshot, or `null`.
 * @param sourceId Source identifier known by the caller, or `null`.
 * @returns Snapshot with the source association completed when possible.
 */
export function attachSourceIdToSnapshot(
  snapshot: CachedThreadSnapshot | null,
  sourceId: string | null
): CachedThreadSnapshot | null {
  if (snapshot === null || sourceId === null || snapshot.thread.sourceId !== null) {
    return snapshot;
  }

  return {
    ...snapshot,
    thread: {
      ...snapshot.thread,
      sourceId
    }
  };
}

/**
 * Replaces a cached snapshot source with the source that produced a live event.
 *
 * @param snapshot Cached thread snapshot.
 * @param sourceId Authoritative source identifier from the live event.
 * @returns Snapshot carrying the authoritative source association.
 */
export function overrideSnapshotSource(
  snapshot: CachedThreadSnapshot,
  sourceId: string
): CachedThreadSnapshot {
  if (snapshot.thread.sourceId === sourceId) {
    return snapshot;
  }

  return {
    ...snapshot,
    thread: {
      ...snapshot.thread,
      sourceId
    }
  };
}

/**
 * Checks whether opening a thread repaired a missing source association.
 *
 * @param previousSnapshot Snapshot before the source repair.
 * @param nextSnapshot Snapshot after the source repair.
 * @returns Whether the repaired thread should be indexed again.
 */
export function shouldPersistSourceAssociation(
  previousSnapshot: CachedThreadSnapshot | null,
  nextSnapshot: CachedThreadSnapshot
): boolean {
  return previousSnapshot?.thread.sourceId === null && nextSnapshot.thread.sourceId !== null;
}
