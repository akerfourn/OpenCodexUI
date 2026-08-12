import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexProject,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "./ChatStore";
import { createClientProject, resolveProjectOpenSourceId } from "./projectMapping";
import { ProjectStore } from "./ProjectStore";
import { ProjectThreadEventsStore } from "./ProjectThreadEventsStore";
import { ProjectThreadRouteIndex } from "./ProjectThreadRouteIndex";
import { ProjectTrustStore } from "./ProjectTrustStore";
import type { RootStore } from "./RootStore";
import type { RootChildStore } from "./RootChildStore";

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
  /** Non-observable index for loaded and pending thread routes. */
  private readonly threadRoutes: ProjectThreadRouteIndex;
  /** Source selected when opening a project before the backend responds. */
  private pendingProjectOpenSourceId: string | null = null;

  /**
   * Creates the projects store and its event sub-stores.
   *
   * @param root Root store used for backend requests and navigation.
   */
  constructor(private readonly root: RootStore) {
    this.threadRoutes = new ProjectThreadRouteIndex(() => this.projectStoresById);
    this.threadEventsStore = new ProjectThreadEventsStore(this, root);
    this.trustStore = new ProjectTrustStore(this, root);
    makeAutoObservable<ProjectsStore, "root" | "threadRoutes">(this, {
      root: false,
      threadRoutes: false
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

    let resolvedSourceId: string | null;

    if (sourceId === undefined) {
      resolvedSourceId = resolveProjectOpenSourceId(
        this.root.homeStore.selectedSourceId,
        this.root.appStore.settingsStore.settings.defaultSourceId,
        this.root.sourcesStore.sources[0]?.id
      );
    } else {
      resolvedSourceId = sourceId;
    }
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
    const sourceId = resolveProjectOpenSourceId(
      this.root.homeStore.selectedSourceId,
      this.root.appStore.settingsStore.settings.defaultSourceId,
      this.root.sourcesStore.sources[0]?.id
    );

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

  /** Finds an opened project by its source-aware path. */
  findProjectStoreByPath(projectPath: string, sourceId?: string | null): ProjectStore | null {
    return this.threadRoutes.findProjectStoreByPath(projectPath, sourceId);
  }

  /** Finds the opened project that owns a source-aware thread route. */
  findProjectStoreForThread(
    threadId: string,
    sourceId?: string | null
  ): ProjectStore | null {
    return this.threadRoutes.findProjectStoreForThread(threadId, sourceId);
  }

  /** Finds the loaded chat for a source-aware thread route. */
  findChatStoreByThreadId(threadId: string, sourceId?: string | null): ChatStore | null {
    return this.threadRoutes.findChatStoreByThreadId(threadId, sourceId);
  }

  /**
   * Opens a thread through an explicit source-aware route.
   *
   * @param sourceId Source that owns the thread.
   * @param threadId Thread to activate.
   * @returns Nothing.
   */
  navigateToThread(sourceId: string | null, threadId: string): void {
    const projectStore = this.findProjectStoreForThread(threadId, sourceId);

    if (projectStore !== null) {
      this.root.navigationStore.ensureProjectTab(projectStore.project.id, true);
      projectStore.openThread(threadId);
      return;
    }

    this.threadRoutes.rememberNotificationRoute(sourceId, threadId);
    void this.root.request({
      type: "threads.open",
      threadId,
      sourceId
    }).catch(() => {
      this.threadRoutes.forgetNotificationRoute(sourceId, threadId);
    });
  }

  /**
   * Opens a thread selected from a desktop notification.
   *
   * @param sourceId Source that produced the notification.
   * @param threadId Thread to activate.
   * @returns Nothing.
   */
  navigateToThreadFromNotification(sourceId: string | null, threadId: string): void {
    this.navigateToThread(sourceId, threadId);
  }

  /** Consumes a pending notification route after thread metadata arrives. */
  consumePendingNotificationRoute(thread: OpenCodexThread): boolean {
    return this.threadRoutes.consumePendingNotificationRoute(thread);
  }

  /** Registers or refreshes the indexed route for a loaded chat. */
  registerLoadedChat(projectStore: ProjectStore, chatStore: ChatStore): void {
    this.threadRoutes.registerLoadedChat(projectStore, chatStore);
  }

  /** Removes the indexed route owned by a loaded chat. */
  unregisterLoadedChat(chatStore: ChatStore): void {
    this.threadRoutes.unregisterLoadedChat(chatStore);
  }

  /** Remembers which project initiated a pending thread request. */
  rememberPendingThreadProject(threadId: string, projectId: string): void {
    this.threadRoutes.rememberPendingThreadProject(threadId, projectId);
  }

  /** Consumes the project associated with a pending thread request. */
  takePendingThreadProject(threadId: string): ProjectStore | null {
    return this.threadRoutes.takePendingThreadProject(threadId);
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

}
