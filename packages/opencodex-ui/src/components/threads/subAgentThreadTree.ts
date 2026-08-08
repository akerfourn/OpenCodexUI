import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

/** One source-scoped thread node in the sub-agent hierarchy. */
export type SubAgentThreadTreeNode = {
  key: string;
  thread: OpenCodexThread;
  children: SubAgentThreadTreeNode[];
  isOrphan: boolean;
  missingParentThreadId: string | null;
};

/** One known or missing ancestor displayed above a selected sub-agent. */
export type SubAgentThreadBreadcrumb = {
  key: string;
  threadId: string;
  thread: OpenCodexThread | null;
  isMissing: boolean;
};

/**
 * Builds a source-aware structural tree from a root and its reported descendants.
 *
 * Threads returned by an ancestor query remain visible as orphan roots when their
 * direct parent is absent. Cycles are also detached instead of causing recursion.
 *
 * @param rootThread Root thread whose descendants are shown.
 * @param descendants Descendant metadata returned or discovered for that root.
 * @param sourceId Source that owns the hierarchy.
 * @returns Ordered structural root nodes.
 */
export function buildSubAgentThreadTree(
  rootThread: OpenCodexThread,
  descendants: readonly OpenCodexThread[],
  sourceId: string | null
): SubAgentThreadTreeNode[] {
  const threadsById = new Map<string, OpenCodexThread>();
  const orderById = new Map<string, number>();

  for (const thread of descendants) {
    if (thread.sourceId !== sourceId || thread.id === rootThread.id) {
      continue;
    }

    if (!orderById.has(thread.id)) {
      orderById.set(thread.id, orderById.size);
    }

    threadsById.set(thread.id, thread);
  }

  const nodesById = new Map<string, SubAgentThreadTreeNode>();

  for (const thread of threadsById.values()) {
    nodesById.set(thread.id, {
      key: createSourceThreadKey(sourceId, thread.id),
      thread,
      children: [],
      isOrphan: false,
      missingParentThreadId: null
    });
  }

  const roots: SubAgentThreadTreeNode[] = [];

  for (const node of nodesById.values()) {
    const parentThreadId = node.thread.parentThreadId
      ?? node.thread.subAgentSource?.parentThreadId
      ?? null;

    if (parentThreadId === rootThread.id) {
      roots.push(node);
      continue;
    }

    const parentNode = parentThreadId === null ? undefined : nodesById.get(parentThreadId);

    if (
      parentThreadId !== null
      && parentNode !== undefined
      && !wouldCreateCycle(node.thread.id, parentThreadId, threadsById)
    ) {
      parentNode.children.push(node);
      continue;
    }

    node.isOrphan = true;
    node.missingParentThreadId = parentThreadId;
    roots.push(node);
  }

  sortTreeNodes(roots, orderById);
  return roots;
}

/**
 * Reconstructs the known parent chain for a selected thread.
 *
 * @param rootThread Root displayed by the dialog.
 * @param descendants Known descendants for the same source.
 * @param selectedThread Selected descendant metadata.
 * @param sourceId Source that owns the hierarchy.
 * @returns Root-to-leaf breadcrumbs, including a missing-parent placeholder if needed.
 */
export function buildSubAgentBreadcrumbs(
  rootThread: OpenCodexThread,
  descendants: readonly OpenCodexThread[],
  selectedThread: OpenCodexThread,
  sourceId: string | null
): SubAgentThreadBreadcrumb[] {
  const threadsById = new Map<string, OpenCodexThread>([[rootThread.id, rootThread]]);

  for (const thread of descendants) {
    if (thread.sourceId === sourceId) {
      threadsById.set(thread.id, thread);
    }
  }

  threadsById.set(selectedThread.id, selectedThread);
  const breadcrumbs: SubAgentThreadBreadcrumb[] = [];
  const visitedThreadIds = new Set<string>();
  let currentThread: OpenCodexThread | null = selectedThread;

  while (currentThread !== null && !visitedThreadIds.has(currentThread.id)) {
    visitedThreadIds.add(currentThread.id);
    breadcrumbs.unshift(createKnownBreadcrumb(sourceId, currentThread));

    if (currentThread.id === rootThread.id) {
      break;
    }

    const parentThreadId: string | null = currentThread.parentThreadId
      ?? currentThread.subAgentSource?.parentThreadId
      ?? null;

    if (parentThreadId === null) {
      break;
    }

    const parentThread: OpenCodexThread | null = threadsById.get(parentThreadId) ?? null;

    if (parentThread === null) {
      breadcrumbs.unshift({
        key: createSourceThreadKey(sourceId, `missing:${parentThreadId}`),
        threadId: parentThreadId,
        thread: null,
        isMissing: true
      });
      break;
    }

    currentThread = parentThread;
  }

  return breadcrumbs;
}

/** Builds a collision-free key for one source/thread pair. */
export function createSourceThreadKey(sourceId: string | null, threadId: string): string {
  const sourceKey = sourceId === null ? "orphan" : `source:${encodeURIComponent(sourceId)}`;
  return `${sourceKey}:${encodeURIComponent(threadId)}`;
}

/** Returns the first thread id in structural preorder, or `null` for an empty tree. */
export function findFirstSubAgentThreadId(
  nodes: readonly SubAgentThreadTreeNode[]
): string | null {
  return nodes[0]?.thread.id ?? null;
}

/** Creates one breadcrumb backed by known thread metadata. */
function createKnownBreadcrumb(
  sourceId: string | null,
  thread: OpenCodexThread
): SubAgentThreadBreadcrumb {
  return {
    key: createSourceThreadKey(sourceId, thread.id),
    threadId: thread.id,
    thread,
    isMissing: false
  };
}

/** Checks the declared parent chain before attaching one node. */
function wouldCreateCycle(
  nodeThreadId: string,
  parentThreadId: string,
  threadsById: ReadonlyMap<string, OpenCodexThread>
): boolean {
  const visitedThreadIds = new Set<string>([nodeThreadId]);
  let currentThreadId: string | null = parentThreadId;

  while (currentThreadId !== null) {
    if (visitedThreadIds.has(currentThreadId)) {
      return true;
    }

    visitedThreadIds.add(currentThreadId);
    const currentThread = threadsById.get(currentThreadId);

    if (currentThread === undefined) {
      return false;
    }

    currentThreadId = currentThread.parentThreadId
      ?? currentThread.subAgentSource?.parentThreadId
      ?? null;
  }

  return false;
}

/** Sorts every tree level using the stable order of the input collection. */
function sortTreeNodes(
  nodes: SubAgentThreadTreeNode[],
  orderById: ReadonlyMap<string, number>
): void {
  nodes.sort((first, second) => (
    (orderById.get(first.thread.id) ?? Number.MAX_SAFE_INTEGER)
    - (orderById.get(second.thread.id) ?? Number.MAX_SAFE_INTEGER)
  ));

  for (const node of nodes) {
    sortTreeNodes(node.children, orderById);
  }
}
