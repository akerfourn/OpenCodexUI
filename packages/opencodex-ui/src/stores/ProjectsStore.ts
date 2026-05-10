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
      default:
        this.threadEventsStore.handleEvent(event);
        return;
    }
  }

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
      ? this.root.homeStore.selectedSourceId ?? this.root.settings.defaultSourceId
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

  openProjectFromPicker(mode: "open" | "create"): void {
    const sourceId = this.root.homeStore.selectedSourceId ?? this.root.settings.defaultSourceId;

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

  openProjectFromInput(createIfMissing: boolean): void {
    this.openProject(this.root.homeStore.projectPathInput, createIfMissing);
  }

  refreshProjects(): void {
    void this.root.request({ type: "projects.list" });
  }

  setShowHiddenProjects(value: boolean): void {
    this.root.homeStore.setShowHiddenProjects(value);
  }

  setProjectHidden(projectId: string, isHidden: boolean): void {
    void this.root.request({
      type: "projects.setHidden",
      projectId,
      isHidden
    });
  }

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

  findProjectStoreForThread(threadId: string): ProjectStore | null {
    for (const projectStore of this.projectStoresById.values()) {
      if (projectStore.findThread(threadId) !== null || projectStore.chatsById.has(threadId)) {
        return projectStore;
      }
    }

    return null;
  }

  findChatStoreByThreadId(threadId: string): ChatStore | null {
    return this.findProjectStoreForThread(threadId)?.chatsById.get(threadId) ?? null;
  }

  rememberPendingThreadProject(threadId: string, projectId: string): void {
    this.pendingThreadProjectIds.set(threadId, projectId);
  }

  takePendingThreadProject(threadId: string): ProjectStore | null {
    const projectId = this.pendingThreadProjectIds.get(threadId);

    if (projectId === undefined) {
      return null;
    }

    this.pendingThreadProjectIds.delete(threadId);
    return this.projectStoresById.get(projectId) ?? null;
  }

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

  resetPendingProjectStates(): void {
    this.threadEventsStore.resetPendingProjectStates();
  }

  applyRecoverableThreadError(threadId: string): boolean {
    return this.threadEventsStore.applyRecoverableThreadError(threadId);
  }

  private applyProjectOpened(project: OpenCodexProject): void {
    this.root.homeStore.isOpeningProject = false;
    this.openProjectTab(project, true);
    this.projectStoresById.get(project.id)?.refreshThreads(this.pendingProjectOpenSourceId);
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
