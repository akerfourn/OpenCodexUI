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

/**
 * Stores recent projects and opened project workspaces.
 */
export class ProjectsStore implements RootChildStore {
  projects: OpenCodexProject[] = [];
  readonly projectStoresById = new Map<string, ProjectStore>();
  readonly threadEventsStore: ProjectThreadEventsStore;
  readonly trustStore: ProjectTrustStore;
  private readonly pendingThreadProjectIds = new Map<string, string>();
  private pendingProjectOpenSourceId: string | null = null;

  constructor(private readonly root: RootStore) {
    this.threadEventsStore = new ProjectThreadEventsStore(this, root);
    this.trustStore = new ProjectTrustStore(this, root);
    makeAutoObservable<ProjectsStore, "root">(this, { root: false });
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
      default:
        this.threadEventsStore.handleEvent(event);
        return;
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
   *
   * @returns Matching project store, or `null`.
   */
  findProjectStoreForThread(threadId: string): ProjectStore | null {
    for (const projectStore of this.projectStoresById.values()) {
      if (projectStore.findThread(threadId) !== null || projectStore.chatsById.has(threadId)) {
        return projectStore;
      }
    }

    return null;
  }

  /**
   * Finds a loaded chat store by thread identifier.
   *
   * @param threadId Thread identifier.
   *
   * @returns Matching chat store, or `null`.
   */
  findChatStoreByThreadId(threadId: string): ChatStore | null {
    return this.findProjectStoreForThread(threadId)?.chatsById.get(threadId) ?? null;
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

  private applyProjectOpened(project: OpenCodexProject): void {
    this.root.homeStore.isOpeningProject = false;
    this.openProjectTab(project, true);
    this.projectStoresById.get(project.id)?.refreshThreads(project.sourceId ?? this.pendingProjectOpenSourceId);
    this.pendingProjectOpenSourceId = null;
  }

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

  private resolveProjectOpenSourceId(): string | null {
    return this.root.homeStore.selectedSourceId
      ?? this.root.settings.defaultSourceId
      ?? this.root.sourcesStore.sources[0]?.id
      ?? null;
  }
}

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
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    editedAt: now
  };
}

function readProjectName(projectPath: string): string {
  const segments = projectPath.split(/[\\/]/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? projectPath;
}
