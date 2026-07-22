import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexProject,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "./ChatStore";
import { ProjectStore } from "./ProjectStore";
import { ProjectThreadEventsStore } from "./ProjectThreadEventsStore";
import { ProjectTrustStore } from "./ProjectTrustStore";
import type { RootStore } from "./RootStore";
import type { RootChildStore } from "./RootChildStore";

type LoadedChatRoute = {
  sourceId: string;
  threadId: string;
  projectStore: ProjectStore;
  chatStore: ChatStore;
};

/**
 * Stores recent projects and opened project workspaces.
 */
export class ProjectsStore implements RootChildStore {
  /** Project metadata shown on Home. */
  projects: OpenCodexProject[] = [];
  /** Opened project stores keyed by project id. */
  readonly projectStoresById = new Map<string, ProjectStore>();
  /** Event router for thread-level backend events. */
  readonly threadEventsStore: ProjectThreadEventsStore;
  /** Store responsible for project trust requests. */
  readonly trustStore: ProjectTrustStore;
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
  /** Source selected when opening a project before the backend responds. */
  private pendingProjectOpenSourceId: string | null = null;

  /**
   * Creates the projects store and its event sub-stores.
   *
   * @param root Root store used for backend requests and navigation.
   */
  constructor(private readonly root: RootStore) {
    this.threadEventsStore = new ProjectThreadEventsStore(this, root);
    this.trustStore = new ProjectTrustStore(this, root);
    makeAutoObservable<
      ProjectsStore,
      "root"
      | "loadedChatRoutesBySourceId"
      | "loadedChatRouteByStore"
      | "pendingNotificationThreadRoutes"
    >(this, {
      root: false,
      loadedChatRoutesBySourceId: false,
      loadedChatRouteByStore: false,
      pendingNotificationThreadRoutes: false
    });
  }

  /**
   * Applies project and thread-related backend events.
   *
   * @param event Event payload to process.
   *
   * @returns Nothing.
   */
  handleEvent(event: OpenCodexEvent): void {
    this.trustStore.handleEvent(event);

    switch (event.type) {
      case "projects.updated":
        this.projects = event.projects;
        this.applyProjectMetadata(event.projects);
        return;
      case "project.opened":
        this.applyProjectOpened(event.project);
        return;
      case "projectCommand.started":
      case "projectCommand.output":
      case "projectCommand.exited":
        this.projectStoresById.get(event.projectId)?.commandsStore.handleEvent(event);
        return;
      case "projectRules.updated":
        this.projectStoresById.get(event.projectId)?.rulesStore.handleEvent(event);
        return;
      default:
        this.threadEventsStore.handleEvent(event);
        return;
    }
  }

  /**
   * Reconciles chat efforts after the backend publishes fresh model metadata.
   *
   * @returns Nothing.
   */
  reconcileReasoningEfforts(): void {
    for (const projectStore of this.projectStoresById.values()) {
      for (const chatStore of projectStore.chatsById.values()) {
        chatStore.reconcileReasoningEffort();
      }
    }
  }

  /**
   * Opens a project path, creating it when requested.
   *
   * @param projectPath Project path to open.
   * @param createIfMissing Whether the backend may create the directory.
   * @param sourceId Optional source override.
   *
   * @returns Nothing.
   */
  openProject(
    projectPath: string,
    createIfMissing = false,
    sourceId?: string | null
  ): void {
    const trimmedPath = projectPath.trim();

    if (trimmedPath.length === 0) {
      return;
    }

    const resolvedSourceId = sourceId === undefined
      ? this.resolveProjectOpenSourceId()
      : sourceId;
    const existingProject = this.findProjectStoreByPath(trimmedPath, resolvedSourceId);

    if (existingProject !== null) {
      this.openProjectTab(existingProject.project, true);
      existingProject.refreshThreads();
      return;
    }

    this.root.homeStore.isOpeningProject = true;
    this.root.appStore.errorMessage = null;
    this.pendingProjectOpenSourceId = resolvedSourceId;
    void this.root.request({
      type: "projects.open",
      projectPath: trimmedPath,
      sourceId: resolvedSourceId,
      createIfMissing
    }).catch(() => {
      runInAction(() => {
        this.root.homeStore.isOpeningProject = false;
      });
    });
  }

  /**
   * Opens the native directory picker for a project.
   *
   * @param mode Picker mode.
   *
   * @returns Nothing.
   */
  openProjectFromPicker(mode: "open" | "create"): void {
    const sourceId = this.resolveProjectOpenSourceId();

    this.root.homeStore.isOpeningProject = true;
    this.root.appStore.errorMessage = null;
    this.pendingProjectOpenSourceId = sourceId;
    void this.root.request({
      type: "projects.pickDirectory",
      mode,
      sourceId
    }).then((project) => {
      if (project === null) {
        runInAction(() => {
          this.root.homeStore.isOpeningProject = false;
        });
      }
    }).catch(() => {
      runInAction(() => {
        this.root.homeStore.isOpeningProject = false;
      });
    });
  }

  /**
   * Opens the path currently typed in the Home project input.
   *
   * @param createIfMissing Whether the backend may create the directory.
   *
   * @returns Nothing.
   */
  openProjectFromInput(createIfMissing: boolean): void {
    this.openProject(this.root.homeStore.projectPathInput, createIfMissing);
  }

  /**
   * Requests the refreshed project list from the backend.
   *
   * @returns Nothing.
   */
  refreshProjects(): void {
    void this.root.request({ type: "projects.list" });
  }

  /**
   * Updates whether hidden projects are visible on Home.
   *
   * @param value Visibility flag.
   *
   * @returns Nothing.
   */
  setShowHiddenProjects(value: boolean): void {
    this.root.homeStore.setShowHiddenProjects(value);
  }

  /**
   * Persists the hidden state for a project.
   *
   * @param projectId Project identifier.
   * @param isHidden Whether the project should be hidden.
   *
   * @returns Nothing.
   */
  setProjectHidden(projectId: string, isHidden: boolean): void {
    void this.root.request({
      type: "projects.setHidden",
      projectId,
      isHidden
    });
  }

  /**
   * Deletes a project from the local cache.
   *
   * @param projectId Project identifier.
   *
   * @returns Nothing.
   */
  deleteProject(projectId: string): void {
    void this.root.request({
      type: "projects.delete",
      projectId
    });
  }

  /**
   * Persists a user-defined project display name.
   *
   * @param projectId Project identifier.
   * @param displayName Display name, or `null` to reset to the default name.
   *
   * @returns Promise resolved with the updated project.
   */
  async updateProjectDisplayName(
    projectId: string,
    displayName: string | null
  ): Promise<OpenCodexProject> {
    const project = await this.root.request<OpenCodexProject>({
      type: "projects.displayName.update",
      projectId,
      displayName
    });

    this.openProjectTab(project, false);
    return project;
  }

  /**
   * Opens or updates a project tab.
   *
   * @param project Project metadata.
   * @param activate Whether the tab should become active.
   *
   * @returns Project store backing the tab.
   */
  openProjectTab(project: OpenCodexProject, activate: boolean): ProjectStore {
    const existingStore = this.projectStoresById.get(project.id)
      ?? this.findProjectStoreByPath(project.path, project.sourceId);
    const projectStore = existingStore ?? new ProjectStore(project, this.root);

    if (this.projects.some((entry) => entry.id === project.id)) {
      this.projects = this.projects.map((entry) => entry.id === project.id ? project : entry);
    } else {
      this.projects = [project, ...this.projects];
    }

    projectStore.setProject(project);
    this.projectStoresById.set(project.id, projectStore);
    this.trustStore.attachPendingTrustRequest(projectStore);
    this.root.navigationStore.ensureProjectTab(project.id, activate);

    return projectStore;
  }

  /**
   * Finds an opened project store by path and optional source.
   *
   * @param projectPath Project path to match.
   * @param sourceId Optional source identifier to match.
   *
   * @returns Matching project store, or `null`.
   */
  findProjectStoreByPath(projectPath: string, sourceId?: string | null): ProjectStore | null {
    const normalizedPath = projectPath.trim();

    for (const projectStore of this.projectStoresById.values()) {
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
   *
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

    for (const projectStore of this.projectStoresById.values()) {
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
   *
   * @returns Matching chat store, or `null`.
   */
  findChatStoreByThreadId(threadId: string, sourceId?: string | null): ChatStore | null {
    const indexedRoute = this.findLoadedChatRoute(threadId, sourceId);

    if (indexedRoute !== null) {
      return indexedRoute.chatStore;
    }

    for (const projectStore of this.projectStoresById.values()) {
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
   * Opens a thread selected from a desktop notification.
   *
   * @param sourceId Source that produced the notification.
   * @param threadId Thread to activate.
   * @returns Nothing.
   */
  navigateToThreadFromNotification(sourceId: string | null, threadId: string): void {
    const projectStore = this.findProjectStoreForThread(threadId, sourceId);

    if (projectStore !== null) {
      this.root.navigationStore.ensureProjectTab(projectStore.project.id, true);
      projectStore.openThread(threadId);
      return;
    }

    this.pendingNotificationThreadRoutes.add(createThreadRouteKey(sourceId, threadId));
    void this.root.request({
      type: "threads.open",
      threadId,
      sourceId
    }).catch(() => {
      this.pendingNotificationThreadRoutes.delete(createThreadRouteKey(sourceId, threadId));
    });
  }

  /**
   * Consumes a pending notification route after Codex returns thread metadata.
   *
   * @param thread Opened thread metadata.
   * @returns Whether the project tab should be activated.
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

  /**
   * Remembers which project initiated a thread request.
   *
   * @param threadId Thread identifier.
   * @param projectId Project identifier.
   *
   * @returns Nothing.
   */
  rememberPendingThreadProject(threadId: string, projectId: string): void {
    this.pendingThreadProjectIds.set(threadId, projectId);
  }

  /**
   * Consumes the remembered project for a pending thread request.
   *
   * @param threadId Thread identifier.
   *
   * @returns Matching project store, or `null`.
   */
  takePendingThreadProject(threadId: string): ProjectStore | null {
    const projectId = this.pendingThreadProjectIds.get(threadId);

    if (projectId === undefined) {
      return null;
    }

    this.pendingThreadProjectIds.delete(threadId);
    return this.projectStoresById.get(projectId) ?? null;
  }

  /**
   * Ensures a project store exists for a thread event.
   *
   * @param thread Thread metadata.
   *
   * @returns Project store that should own the thread.
   */
  ensureProjectStoreForThread(thread: OpenCodexThread): ProjectStore {
    const pendingProjectStore = this.takePendingThreadProject(thread.id);
    const projectPath = thread.projectPath
      ?? pendingProjectStore?.projectPath
      ?? this.root.appStore.launchProjectPath
      ?? "";
    const sourceId = thread.sourceId ?? pendingProjectStore?.project.sourceId ?? null;
    const existingStore = this.findProjectStoreByPath(projectPath, sourceId);

    if (existingStore !== null) {
      return existingStore;
    }

    const project = createClientProject(projectPath, thread.projectName, sourceId);
    this.projects = [project, ...this.projects];
    return this.openProjectTab(project, false);
  }

  /**
   * Clears pending loading states across opened projects and chats.
   *
   * @returns Nothing.
   */
  resetPendingProjectStates(): void {
    this.threadEventsStore.resetPendingProjectStates();
  }

  /**
   * Applies a recoverable thread error to the owning chat.
   *
   * @param threadId Thread identifier.
   *
   * @returns `true` when a chat handled the error.
   */
  applyRecoverableThreadError(threadId: string): boolean {
    return this.threadEventsStore.applyRecoverableThreadError(threadId);
  }

  /**
   * Applies a project-opened event and starts loading its threads.
   *
   * @param project Opened project metadata.
   */
  private applyProjectOpened(project: OpenCodexProject): void {
    this.root.homeStore.isOpeningProject = false;
    this.openProjectTab(project, true);
    this.projectStoresById.get(project.id)?.refreshThreads(project.sourceId ?? this.pendingProjectOpenSourceId);
    this.pendingProjectOpenSourceId = null;
  }

  /**
   * Reconciles opened project stores with refreshed project metadata.
   *
   * @param projects Refreshed project list.
   */
  private applyProjectMetadata(projects: OpenCodexProject[]): void {
    for (const project of projects) {
      const projectStore = this.projectStoresById.get(project.id)
        ?? this.findProjectStoreByPath(project.path, project.sourceId);

      if (projectStore === null) {
        continue;
      }

      if (projectStore.project.id !== project.id) {
        const previousProjectId = projectStore.project.id;
        this.projectStoresById.delete(projectStore.project.id);
        this.projectStoresById.set(project.id, projectStore);
        this.root.navigationStore.replaceProjectId(previousProjectId, project.id);
      }

      projectStore.setProject(project);
    }
  }

  /**
   * Resolves the source to use for a new project-open request.
   *
   * @returns Source identifier, or `null` when none is configured.
   */
  private resolveProjectOpenSourceId(): string | null {
    return this.root.homeStore.selectedSourceId
      ?? this.root.settings.defaultSourceId
      ?? this.root.sourcesStore.sources[0]?.id
      ?? null;
  }
}

/**
 * Creates local project metadata when only a path is available.
 *
 * @param projectPath Project path.
 * @param projectName Optional project display name.
 * @param sourceId Optional source identifier.
 * @returns Client-side project metadata.
 */
function createClientProject(
  projectPath: string,
  projectName: string | null,
  sourceId: string | null
): OpenCodexProject {
  const now = new Date().toISOString();
  const safePath = projectPath.trim().length > 0 ? projectPath.trim() : "unknown";
  const defaultName = projectName ?? readProjectName(safePath);

  return {
    id: `client:${sourceId ?? "orphan"}:${safePath}`,
    sourceId,
    path: safePath,
    defaultName,
    displayName: null,
    isHidden: false,
    preferences: {},
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    editedAt: now
  };
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
 * Reads the default project name from a filesystem-like path.
 *
 * @param projectPath Project path.
 * @returns Last path segment or the original path.
 */
function readProjectName(projectPath: string): string {
  const segments = projectPath.split(/[\\/]/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? projectPath;
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
