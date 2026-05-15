import { makeAutoObservable } from "mobx";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "./RootStore";

export const HOME_TAB_ID = "home";

export type OpenCodexAppTab =
  | { id: typeof HOME_TAB_ID; type: "home" }
  | { id: string; type: "project"; projectId: string };

/**
 * Stores UI navigation state for home and opened project tabs.
 */
export class NavigationStore {
  tabs: OpenCodexAppTab[] = [{ id: HOME_TAB_ID, type: "home" }];
  activeTabId = HOME_TAB_ID;
  projectCloseRequest: ProjectStore | null = null;

  constructor(private readonly root: RootStore) {
    makeAutoObservable<NavigationStore, "root">(this, { root: false });
  }

  /**
   * Returns the project store selected by the active tab.
   *
   * @returns Active project store, or `null` when Home is active.
   */
  get activeProjectStore(): ProjectStore | null {
    const tab = this.tabs.find((entry) => entry.id === this.activeTabId);

    if (tab?.type !== "project") {
      return null;
    }

    return this.root.projectsStore.projectStoresById.get(tab.projectId) ?? null;
  }

  /**
   * Returns opened project stores in tab order.
   *
   * @returns Project stores currently represented by tabs.
   */
  get projectTabStores(): ProjectStore[] {
    return this.tabs
      .filter((tab): tab is Extract<OpenCodexAppTab, { type: "project" }> => tab.type === "project")
      .map((tab) => this.root.projectsStore.projectStoresById.get(tab.projectId))
      .filter((projectStore): projectStore is ProjectStore => projectStore !== undefined);
  }

  /**
   * Activates an existing tab.
   *
   * @param tabId Tab identifier to activate.
   *
   * @returns Nothing.
   */
  activateTab(tabId: string): void {
    if (this.tabs.some((tab) => tab.id === tabId)) {
      this.activeTabId = tabId;
      this.markActiveProjectChatSeen();
    }
  }

  /**
   * Activates the Home tab.
   *
   * @returns Nothing.
   */
  activateHome(): void {
    this.activeTabId = HOME_TAB_ID;
  }

  /**
   * Ensures a project tab exists and optionally activates it.
   *
   * @param projectId Project identifier.
   * @param activate Whether to make the tab active.
   *
   * @returns Nothing.
   */
  ensureProjectTab(projectId: string, activate: boolean): void {
    if (!this.tabs.some((tab) => tab.id === projectId)) {
      this.tabs = [...this.tabs, { id: projectId, type: "project", projectId }];
    }

    if (activate) {
      this.activeTabId = projectId;
      this.markActiveProjectChatSeen();
    }
  }

  /**
   * Replaces a project identifier in tab state after metadata reconciliation.
   *
   * @param previousProjectId Previous project identifier.
   * @param nextProjectId Replacement project identifier.
   *
   * @returns Nothing.
   */
  replaceProjectId(previousProjectId: string, nextProjectId: string): void {
    this.tabs = this.tabs.map((tab) => (
      tab.type === "project" && tab.projectId === previousProjectId
        ? { id: nextProjectId, type: "project", projectId: nextProjectId }
        : tab
    ));

    if (this.activeTabId === previousProjectId) {
      this.activeTabId = nextProjectId;
    }
  }

  /**
   * Opens the close confirmation flow for a project tab.
   *
   * @param projectId Project identifier to close.
   *
   * @returns Nothing.
   */
  requestCloseProject(projectId: string): void {
    const projectStore = this.root.projectsStore.projectStoresById.get(projectId) ?? null;

    if (projectStore === null) {
      return;
    }

    this.projectCloseRequest = projectStore;
  }

  /**
   * Cancels the pending close confirmation flow.
   *
   * @returns Nothing.
   */
  cancelCloseProject(): void {
    this.projectCloseRequest = null;
  }

  /**
   * Closes the pending project tab when no chat is running.
   *
   * @returns Nothing.
   */
  confirmCloseProject(): void {
    const projectStore = this.projectCloseRequest;

    if (projectStore === null || this.hasRunningTurnInProject(projectStore.project.id)) {
      return;
    }

    projectStore.clearMemory();
    this.root.projectsStore.projectStoresById.delete(projectStore.project.id);
    this.tabs = this.tabs.filter((tab) => tab.id !== projectStore.project.id);
    this.projectCloseRequest = null;

    if (this.activeTabId === projectStore.project.id) {
      this.activeTabId = HOME_TAB_ID;
    }
  }

  private hasRunningTurnInProject(projectId: string): boolean {
    const projectStore = this.root.projectsStore.projectStoresById.get(projectId) ?? null;

    if (projectStore === null) {
      return false;
    }

    for (const chatStore of projectStore.chatsById.values()) {
      if (chatStore.isWorking || chatStore.isStartingTurn || chatStore.isRecovering) {
        return true;
      }
    }

    return false;
  }

  private markActiveProjectChatSeen(): void {
    this.activeProjectStore?.markSelectedChatSeen();
  }
}
