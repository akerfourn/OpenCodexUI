import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "./ChatStore";
import type { ProjectStore } from "./ProjectStore";

type LoadedChatRoute = {
  sourceId: string;
  threadId: string;
  projectStore: ProjectStore;
  chatStore: ChatStore;
};

/**
 * Indexes loaded and pending thread routes outside MobX state.
 */
export class ProjectThreadRouteIndex {
  /** Temporary thread-to-project ownership hints while a thread opens. */
  private readonly pendingThreadProjectIds = new Map<string, string>();
  /** Notification routes waiting for a thread snapshot before activation. */
  private readonly pendingNotificationThreadRoutes = new Set<string>();
  /** Loaded chat routes grouped by source and thread identifiers. */
  private readonly loadedChatRoutesBySourceId = new Map<
    string,
    Map<string, LoadedChatRoute>
  >();
  /** Registered route metadata keyed by loaded chat instance. */
  private readonly loadedChatRouteByStore = new WeakMap<ChatStore, LoadedChatRoute>();

  /**
   * Creates a route index backed by the live project store collection.
   *
   * @param readProjectStores Reads the current opened-project collection.
   */
  constructor(
    private readonly readProjectStores: () => ReadonlyMap<string, ProjectStore>
  ) {}

  /**
   * Finds an opened project store by path and optional source.
   *
   * @param projectPath Project path to match.
   * @param sourceId Optional source identifier to match.
   * @returns Matching project store, or `null`.
   */
  findProjectStoreByPath(projectPath: string, sourceId?: string | null): ProjectStore | null {
    const normalizedPath = projectPath.trim();

    for (const projectStore of this.readProjectStores().values()) {
      const sourceMatches = sourceId === undefined || projectStore.project.sourceId === sourceId;

      if (projectStore.projectPath === normalizedPath && sourceMatches) {
        return projectStore;
      }
    }

    return null;
  }

  /**
   * Finds the opened project that owns a thread.
   *
   * @param threadId Thread identifier.
   * @param sourceId Optional source carried by the event.
   * @returns Matching project store, or `null`.
   */
  findProjectStoreForThread(
    threadId: string,
    sourceId?: string | null
  ): ProjectStore | null {
    const indexedRoute = this.findLoadedChatRoute(threadId, sourceId);

    if (indexedRoute !== null) {
      return indexedRoute.projectStore;
    }

    for (const projectStore of this.readProjectStores().values()) {
      const chatStore = projectStore.chatsById.get(threadId);

      if (chatStore !== undefined && matchesSource(chatStore.sourceId, sourceId)) {
        this.registerLoadedChat(projectStore, chatStore);
        return projectStore;
      }

      const thread = projectStore.findThread(threadId);

      if (
        thread !== null &&
        matchesSource(projectStore.resolveThreadSourceId(thread), sourceId)
      ) {
        return projectStore;
      }
    }

    return null;
  }

  /**
   * Finds a loaded chat store by thread identifier.
   *
   * @param threadId Thread identifier.
   * @param sourceId Optional source carried by the event.
   * @returns Matching chat store, or `null`.
   */
  findChatStoreByThreadId(threadId: string, sourceId?: string | null): ChatStore | null {
    const indexedRoute = this.findLoadedChatRoute(threadId, sourceId);

    if (indexedRoute !== null) {
      return indexedRoute.chatStore;
    }

    for (const projectStore of this.readProjectStores().values()) {
      const chatStore = projectStore.chatsById.get(threadId);

      if (chatStore === undefined || !matchesSource(chatStore.sourceId, sourceId)) {
        continue;
      }

      this.registerLoadedChat(projectStore, chatStore);
      return chatStore;
    }

    return null;
  }

  /**
   * Remembers a notification route until opened thread metadata arrives.
   *
   * @param sourceId Source identifier, or `null`.
   * @param threadId Thread identifier.
   */
  rememberNotificationRoute(sourceId: string | null, threadId: string): void {
    this.pendingNotificationThreadRoutes.add(createThreadRouteKey(sourceId, threadId));
  }

  /**
   * Forgets a notification route after its open request fails.
   *
   * @param sourceId Source identifier, or `null`.
   * @param threadId Thread identifier.
   */
  forgetNotificationRoute(sourceId: string | null, threadId: string): void {
    this.pendingNotificationThreadRoutes.delete(createThreadRouteKey(sourceId, threadId));
  }

  /**
   * Consumes a pending notification route after thread metadata arrives.
   *
   * @param thread Opened thread metadata.
   * @returns Whether the owning project should be activated.
   */
  consumePendingNotificationRoute(thread: OpenCodexThread): boolean {
    const sourceId = thread.sourceId ?? null;
    const resolvedKey = createThreadRouteKey(sourceId, thread.id);

    if (this.pendingNotificationThreadRoutes.delete(resolvedKey)) {
      return true;
    }

    if (sourceId !== null && this.pendingNotificationThreadRoutes.delete(
      createThreadRouteKey(null, thread.id)
    )) {
      return true;
    }

    return false;
  }

  /**
   * Registers or refreshes the direct route for one loaded chat.
   *
   * @param projectStore Project that owns the chat.
   * @param chatStore Loaded chat instance.
   */
  registerLoadedChat(projectStore: ProjectStore, chatStore: ChatStore): void {
    this.unregisterLoadedChat(chatStore);

    const sourceId = chatStore.sourceId;

    if (sourceId === null) {
      return;
    }

    const route: LoadedChatRoute = {
      sourceId,
      threadId: chatStore.thread.id,
      projectStore,
      chatStore
    };
    const sourceRoutes = this.loadedChatRoutesBySourceId.get(sourceId)
      ?? new Map<string, LoadedChatRoute>();

    sourceRoutes.set(route.threadId, route);
    this.loadedChatRoutesBySourceId.set(sourceId, sourceRoutes);
    this.loadedChatRouteByStore.set(chatStore, route);
  }

  /**
   * Removes the direct route owned by one loaded chat.
   *
   * @param chatStore Chat being disposed or detached.
   */
  unregisterLoadedChat(chatStore: ChatStore): void {
    const route = this.loadedChatRouteByStore.get(chatStore);

    if (route === undefined) {
      return;
    }

    this.loadedChatRouteByStore.delete(chatStore);
    const sourceRoutes = this.loadedChatRoutesBySourceId.get(route.sourceId);

    if (sourceRoutes?.get(route.threadId) === route) {
      sourceRoutes.delete(route.threadId);
    }

    if (sourceRoutes !== undefined && sourceRoutes.size === 0) {
      this.loadedChatRoutesBySourceId.delete(route.sourceId);
    }
  }

  /**
   * Remembers which project initiated a thread request.
   *
   * @param threadId Thread identifier.
   * @param projectId Project identifier.
   */
  rememberPendingThreadProject(threadId: string, projectId: string): void {
    this.pendingThreadProjectIds.set(threadId, projectId);
  }

  /**
   * Consumes the project associated with a pending thread request.
   *
   * @param threadId Thread identifier.
   * @returns Matching project store, or `null`.
   */
  takePendingThreadProject(threadId: string): ProjectStore | null {
    const projectId = this.pendingThreadProjectIds.get(threadId);

    if (projectId === undefined) {
      return null;
    }

    this.pendingThreadProjectIds.delete(threadId);
    return this.readProjectStores().get(projectId) ?? null;
  }

  /**
   * Finds a loaded-chat route when an event carries its source.
   *
   * @param threadId Thread identifier.
   * @param sourceId Optional source identifier from the event channel.
   * @returns Loaded route, or `null` when absent.
   */
  private findLoadedChatRoute(
    threadId: string,
    sourceId?: string | null
  ): LoadedChatRoute | null {
    if (sourceId === undefined || sourceId === null) {
      return null;
    }

    return this.loadedChatRoutesBySourceId.get(sourceId)?.get(threadId) ?? null;
  }
}

/**
 * Matches a resolved owner source against an optional event source.
 *
 * Missing or null event sources retain the legacy thread-only fallback.
 *
 * @param ownerSourceId Source resolved from loaded state.
 * @param eventSourceId Optional source carried by the event.
 * @returns Whether the loaded owner may handle the event.
 */
function matchesSource(
  ownerSourceId: string | null,
  eventSourceId?: string | null
): boolean {
  return eventSourceId === undefined || eventSourceId === null || ownerSourceId === eventSourceId;
}

/**
 * Creates a source-aware route key for notification navigation.
 *
 * @param sourceId Source identifier, or `null`.
 * @param threadId Thread identifier.
 * @returns Stable route key.
 */
function createThreadRouteKey(sourceId: string | null, threadId: string): string {
  return `${sourceId ?? "unknown"}:${threadId}`;
}
