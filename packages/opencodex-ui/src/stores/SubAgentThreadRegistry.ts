import { makeAutoObservable } from "mobx";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

type SubAgentThreadCollection = {
  sourceId: string | null;
  rootThreadId: string;
  threadIds: string[];
};

/** Maintains source-scoped sub-agent metadata and descendant memberships. */
export class SubAgentThreadRegistry {
  /** Known sub-agent metadata indexed independently inside each source scope. */
  private readonly threadsBySourceKey = new Map<string, Map<string, OpenCodexThread>>();
  /** Explicit descendant membership retained for every queried or discovered root. */
  private readonly collectionsByRootKey = new Map<string, SubAgentThreadCollection>();
  /** Latest runtime statuses retained even when they precede thread discovery. */
  private readonly statusesBySourceKey = new Map<string, Map<string, string>>();

  /** Creates an observable hierarchy registry. */
  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Replaces one root query result and reconciles descendants known from live events.
   *
   * @param sourceId Source scope, or `null` for orphan cache data.
   * @param rootThreadId Queried ancestor identifier.
   * @param threads Descendants returned by the backend.
   * @returns Merged descendants for the root.
   */
  replaceRoot(
    sourceId: string | null,
    rootThreadId: string,
    threads: readonly OpenCodexThread[]
  ): OpenCodexThread[] {
    const sourceThreads = this.readOrCreateSourceThreads(sourceId);
    const threadIds: string[] = [];

    for (const thread of threads) {
      const existingThread = sourceThreads.get(thread.id);
      const mergedThread = applyKnownStatus(
        mergeSubAgentThread(existingThread, thread),
        this.statusesBySourceKey.get(createSourceKey(sourceId))
      );

      if (existingThread === undefined || !areThreadsEqual(existingThread, mergedThread)) {
        sourceThreads.set(mergedThread.id, mergedThread);
      }

      if (!threadIds.includes(mergedThread.id)) {
        threadIds.push(mergedThread.id);
      }
    }

    const rootKey = createRootKey(sourceId, rootThreadId);
    const existingCollection = this.collectionsByRootKey.get(rootKey);
    const nextCollection = {
      sourceId,
      rootThreadId,
      threadIds
    };

    if (
      existingCollection === undefined
      || !areStringArraysEqual(existingCollection.threadIds, threadIds)
    ) {
      this.collectionsByRootKey.set(rootKey, nextCollection);
    }

    this.reconcileCollections(sourceId);
    return this.readRoot(sourceId, rootThreadId);
  }

  /**
   * Reads the current descendants for one source-aware root.
   *
   * @param sourceId Source scope, or `null` for orphan cache data.
   * @param rootThreadId Ancestor identifier.
   * @returns Known descendants in stable discovery order.
   */
  readRoot(sourceId: string | null, rootThreadId: string): OpenCodexThread[] {
    const collection = this.collectionsByRootKey.get(createRootKey(sourceId, rootThreadId));
    const sourceThreads = this.threadsBySourceKey.get(createSourceKey(sourceId));

    if (collection === undefined || sourceThreads === undefined) {
      return [];
    }

    return collection.threadIds
      .map((threadId) => sourceThreads.get(threadId) ?? null)
      .filter((thread): thread is OpenCodexThread => thread !== null);
  }

  /**
   * Inserts or enriches one live sub-agent and repairs out-of-order ancestry.
   *
   * @param thread Newly discovered or refreshed sub-agent metadata.
   */
  upsert(thread: OpenCodexThread): void {
    if (thread.sourceId === null) {
      return;
    }

    const sourceThreads = this.readOrCreateSourceThreads(thread.sourceId);
    const existingThread = sourceThreads.get(thread.id);
    const mergedThread = applyKnownStatus(
      mergeSubAgentThread(existingThread, thread),
      this.statusesBySourceKey.get(createSourceKey(thread.sourceId))
    );
    const parentThreadId = readParentThreadId(mergedThread);

    if (parentThreadId === null && existingThread === undefined) {
      return;
    }

    if (existingThread === undefined || !areThreadsEqual(existingThread, mergedThread)) {
      sourceThreads.set(mergedThread.id, mergedThread);
    }

    if (parentThreadId !== null) {
      this.addDirectRootMembership(thread.sourceId, parentThreadId, mergedThread.id);
    }

    this.reconcileCollections(thread.sourceId);
  }

  /**
   * Applies runtime statuses keyed by thread id or agent path.
   *
   * @param sourceId Source that owns the agents.
   * @param statuses Runtime status values.
   */
  updateStatuses(sourceId: string, statuses: Readonly<Record<string, string>>): void {
    if (Object.keys(statuses).length === 0) {
      return;
    }

    const sourceKey = createSourceKey(sourceId);
    const sourceThreads = this.threadsBySourceKey.get(sourceKey);
    const pendingStatuses = this.readOrCreateSourceStatuses(sourceId);

    if (sourceThreads === undefined) {
      for (const [agentId, status] of Object.entries(statuses)) {
        pendingStatuses.set(agentId, status);
      }

      return;
    }

    for (const [agentId, status] of Object.entries(statuses)) {
      let hasMatchedThread = false;

      for (const [threadId, thread] of sourceThreads.entries()) {
        const agentPath = thread.subAgentSource?.agentPath ?? null;

        if (threadId !== agentId && agentPath !== agentId) {
          continue;
        }

        hasMatchedThread = true;

        if (status !== thread.status) {
          sourceThreads.set(threadId, { ...thread, status });
        }
      }

      if (hasMatchedThread) {
        pendingStatuses.delete(agentId);
      } else {
        pendingStatuses.set(agentId, status);
      }
    }
  }

  /** Clears every source registry and root membership. */
  clear(): void {
    this.threadsBySourceKey.clear();
    this.collectionsByRootKey.clear();
    this.statusesBySourceKey.clear();
  }

  /** Adds one thread to the direct root implied by its parent id. */
  private addDirectRootMembership(
    sourceId: string,
    rootThreadId: string,
    threadId: string
  ): void {
    const rootKey = createRootKey(sourceId, rootThreadId);
    const collection = this.collectionsByRootKey.get(rootKey) ?? {
      sourceId,
      rootThreadId,
      threadIds: []
    };

    if (collection.threadIds.includes(threadId)) {
      return;
    }

    this.collectionsByRootKey.set(rootKey, {
      ...collection,
      threadIds: [...collection.threadIds, threadId]
    });
  }

  /** Returns the observable metadata map for one source, creating it when absent. */
  private readOrCreateSourceThreads(sourceId: string | null): Map<string, OpenCodexThread> {
    const sourceKey = createSourceKey(sourceId);
    const existingThreads = this.threadsBySourceKey.get(sourceKey);

    if (existingThreads !== undefined) {
      return existingThreads;
    }

    this.threadsBySourceKey.set(sourceKey, new Map<string, OpenCodexThread>());
    const createdThreads = this.threadsBySourceKey.get(sourceKey);

    if (createdThreads === undefined) {
      throw new Error(`Unable to create the sub-agent registry for ${sourceKey}.`);
    }

    return createdThreads;
  }

  /** Returns the runtime status map for one source, creating it when absent. */
  private readOrCreateSourceStatuses(sourceId: string): Map<string, string> {
    const sourceKey = createSourceKey(sourceId);
    const existingStatuses = this.statusesBySourceKey.get(sourceKey);

    if (existingStatuses !== undefined) {
      return existingStatuses;
    }

    this.statusesBySourceKey.set(sourceKey, new Map<string, string>());
    const createdStatuses = this.statusesBySourceKey.get(sourceKey);

    if (createdStatuses === undefined) {
      throw new Error(`Unable to create the sub-agent status registry for ${sourceKey}.`);
    }

    return createdStatuses;
  }

  /** Adds newly connected descendants to every compatible loaded root. */
  private reconcileCollections(sourceId: string | null): void {
    const sourceThreads = this.threadsBySourceKey.get(createSourceKey(sourceId));

    if (sourceThreads === undefined) {
      return;
    }

    for (const [rootKey, collection] of this.collectionsByRootKey.entries()) {
      if (collection.sourceId !== sourceId) {
        continue;
      }

      const nextThreadIds = [...collection.threadIds];

      for (const thread of sourceThreads.values()) {
        if (
          !nextThreadIds.includes(thread.id)
          && isDescendantOf(thread, collection.rootThreadId, sourceThreads)
        ) {
          nextThreadIds.push(thread.id);
        }
      }

      if (nextThreadIds.length !== collection.threadIds.length) {
        this.collectionsByRootKey.set(rootKey, { ...collection, threadIds: nextThreadIds });
      }
    }
  }
}

/** Merges partial live metadata without dropping known structural fields. */
function mergeSubAgentThread(
  existingThread: OpenCodexThread | undefined,
  incomingThread: OpenCodexThread
): OpenCodexThread {
  if (existingThread === undefined) {
    return incomingThread;
  }

  return {
    ...existingThread,
    ...incomingThread,
    sourceId: incomingThread.sourceId ?? existingThread.sourceId,
    parentThreadId: incomingThread.parentThreadId ?? existingThread.parentThreadId,
    agentNickname: incomingThread.agentNickname ?? existingThread.agentNickname,
    agentRole: incomingThread.agentRole ?? existingThread.agentRole,
    subAgentSource: mergeSubAgentSource(
      existingThread.subAgentSource,
      incomingThread.subAgentSource
    ),
    canAcceptDirectInput:
      incomingThread.canAcceptDirectInput ?? existingThread.canAcceptDirectInput,
    status: incomingThread.status ?? existingThread.status
  };
}

/** Merges structured origin fields received at different lifecycle stages. */
function mergeSubAgentSource(
  existingSource: OpenCodexThread["subAgentSource"],
  incomingSource: OpenCodexThread["subAgentSource"]
): OpenCodexThread["subAgentSource"] {
  if (incomingSource === null) {
    return existingSource;
  }

  if (existingSource === null) {
    return incomingSource;
  }

  return {
    ...existingSource,
    ...incomingSource,
    parentThreadId: incomingSource.parentThreadId ?? existingSource.parentThreadId,
    depth: incomingSource.depth ?? existingSource.depth,
    agentPath: incomingSource.agentPath ?? existingSource.agentPath,
    agentNickname: incomingSource.agentNickname ?? existingSource.agentNickname,
    agentRole: incomingSource.agentRole ?? existingSource.agentRole,
    label: incomingSource.label ?? existingSource.label
  };
}

/** Reads the structural parent from normalized or structured origin metadata. */
function readParentThreadId(thread: OpenCodexThread): string | null {
  return thread.parentThreadId ?? thread.subAgentSource?.parentThreadId ?? null;
}

/** Checks whether one known thread descends from a root without following cycles. */
function isDescendantOf(
  thread: OpenCodexThread,
  rootThreadId: string,
  sourceThreads: ReadonlyMap<string, OpenCodexThread>
): boolean {
  const visitedThreadIds = new Set<string>([thread.id]);
  let parentThreadId = readParentThreadId(thread);

  while (parentThreadId !== null) {
    if (parentThreadId === rootThreadId) {
      return true;
    }

    if (visitedThreadIds.has(parentThreadId)) {
      return false;
    }

    visitedThreadIds.add(parentThreadId);
    const parentThread = sourceThreads.get(parentThreadId);

    if (parentThread === undefined) {
      return false;
    }

    parentThreadId = readParentThreadId(parentThread);
  }

  return false;
}

/** Applies a status previously observed by thread id or agent path. */
function applyKnownStatus(
  thread: OpenCodexThread,
  statuses: Map<string, string> | undefined
): OpenCodexThread {
  if (statuses === undefined) {
    return thread;
  }

  const agentPath = thread.subAgentSource?.agentPath ?? null;
  let statusKey: string | null = null;

  if (statuses.has(thread.id)) {
    statusKey = thread.id;
  } else if (agentPath !== null && statuses.has(agentPath)) {
    statusKey = agentPath;
  }

  if (statusKey === null) {
    return thread;
  }

  const status = statuses.get(statusKey);
  statuses.delete(statusKey);

  if (status === undefined || status === thread.status) {
    return thread;
  }

  return { ...thread, status };
}

/** Compares complete thread metadata before mutating an observable registry. */
function areThreadsEqual(first: OpenCodexThread, second: OpenCodexThread): boolean {
  return first.id === second.id
    && first.sessionId === second.sessionId
    && first.parentThreadId === second.parentThreadId
    && first.codexTitle === second.codexTitle
    && first.customTitle === second.customTitle
    && first.title === second.title
    && first.preview === second.preview
    && first.model === second.model
    && first.reasoningEffort === second.reasoningEffort
    && first.projectName === second.projectName
    && first.projectPath === second.projectPath
    && first.sourceId === second.sourceId
    && first.branchName === second.branchName
    && first.updatedAt === second.updatedAt
    && first.isArchived === second.isArchived
    && first.threadSource === second.threadSource
    && first.agentNickname === second.agentNickname
    && first.agentRole === second.agentRole
    && areSubAgentSourcesEqual(first.subAgentSource, second.subAgentSource)
    && first.canAcceptDirectInput === second.canAcceptDirectInput
    && first.status === second.status;
}

/** Compares structured sub-agent origins without relying on object identity. */
function areSubAgentSourcesEqual(
  first: OpenCodexThread["subAgentSource"],
  second: OpenCodexThread["subAgentSource"]
): boolean {
  if (first === null || second === null) {
    return first === second;
  }

  return first.kind === second.kind
    && first.parentThreadId === second.parentThreadId
    && first.depth === second.depth
    && first.agentPath === second.agentPath
    && first.agentNickname === second.agentNickname
    && first.agentRole === second.agentRole
    && first.label === second.label;
}

/** Compares ordered string collections used for observable root membership. */
function areStringArraysEqual(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length
    && first.every((value, index) => value === second[index]);
}

/** Builds a stable source registry key, including the orphan scope. */
function createSourceKey(sourceId: string | null): string {
  return sourceId === null ? "orphan" : `source:${encodeURIComponent(sourceId)}`;
}

/** Builds a collision-free source/root collection key. */
function createRootKey(sourceId: string | null, rootThreadId: string): string {
  return `${createSourceKey(sourceId)}:${encodeURIComponent(rootThreadId)}`;
}
