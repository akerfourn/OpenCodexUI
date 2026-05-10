import { makeAutoObservable } from "mobx";

import type { OpenCodexEvent } from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { ProjectsStore } from "./ProjectsStore";
import type { RootStore } from "./RootStore";
import type { RootChildStore } from "./RootChildStore";

export type ProjectTrustRequest = {
  projectPath: string;
  disabledFolders: string[];
};

export class ProjectTrustStore implements RootChildStore {
  pendingTrustRequest: ProjectTrustRequest | null = null;

  constructor(
    private readonly projectsStore: ProjectsStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ProjectTrustStore, "projectsStore" | "root">(this, {
      projectsStore: false,
      root: false
    });
  }

  get currentTrustRequest(): ProjectTrustRequest | null {
    const activeProjectRequest = this.root.activeProjectStore?.trustRequest ?? null;

    if (activeProjectRequest !== null) {
      return activeProjectRequest;
    }

    const anyProjectRequest = this.findAnyProjectTrustRequest();

    if (anyProjectRequest !== null) {
      return anyProjectRequest;
    }

    return this.pendingTrustRequest;
  }

  handleEvent(event: OpenCodexEvent): void {
    switch (event.type) {
      case "project.trust.required":
        this.addTrustRequest({
          projectPath: event.projectPath,
          disabledFolders: event.disabledFolders
        });
        return;
      case "project.trust.completed":
        this.clearTrustRequest(event.projectPath);
        return;
      default:
        return;
    }
  }

  trustProject(projectPath: string): void {
    void this.root.request({ type: "project.trust", projectPath });
  }

  dismissProjectTrustRequest(projectPath: string): void {
    this.clearTrustRequest(projectPath);
    void this.root.request({ type: "project.trust.dismiss", projectPath });
  }

  attachPendingTrustRequest(projectStore: ProjectStore): void {
    if (this.pendingTrustRequest?.projectPath !== projectStore.projectPath) {
      return;
    }

    projectStore.setTrustRequest(this.pendingTrustRequest);
    this.pendingTrustRequest = null;
  }

  private addTrustRequest(request: ProjectTrustRequest): void {
    const projectStore = this.findSingleProjectStoreByPath(request.projectPath);

    if (projectStore !== null) {
      projectStore.setTrustRequest(request);
      return;
    }

    this.pendingTrustRequest = request;
  }

  private clearTrustRequest(projectPath: string): void {
    if (this.pendingTrustRequest?.projectPath === projectPath) {
      this.pendingTrustRequest = null;
    }

    for (const projectStore of this.projectsStore.projectStoresById.values()) {
      projectStore.clearTrustRequest(projectPath);
    }
  }

  private findSingleProjectStoreByPath(projectPath: string): ProjectStore | null {
    const matches = Array.from(this.projectsStore.projectStoresById.values())
      .filter((projectStore) => projectStore.projectPath === projectPath);

    return matches.length === 1 ? matches[0] ?? null : null;
  }

  private findAnyProjectTrustRequest(): ProjectTrustRequest | null {
    for (const projectStore of this.projectsStore.projectStoresById.values()) {
      if (projectStore.trustRequest !== null) {
        return projectStore.trustRequest;
      }
    }

    return null;
  }
}
