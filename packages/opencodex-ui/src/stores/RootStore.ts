/**
 * Coordinates application-wide state, project tabs, and backend events.
 */
import { makeAutoObservable } from "mobx";

import type {
  OpenCodexClientTransport,
  OpenCodexEvent,
  OpenCodexImageAttachment,
  OpenCodexRequest,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import { AppStore } from "./AppStore";
import { ApprovalsStore } from "./ApprovalsStore";
import { ChatEventLogStore } from "./ChatEventLogStore";
import { CollaborationStore } from "./CollaborationStore";
import type { ChatStore } from "./ChatStore";
import { CommitPromptStore } from "./CommitPromptStore";
import { HomeStore } from "./HomeStore";
import { LogsStore } from "./LogsStore";
import { NavigationStore } from "./NavigationStore";
import { PluginsStore } from "./PluginsStore";
import type { ProjectStore } from "./ProjectStore";
import { ProjectsStore } from "./ProjectsStore";
import { ProjectGroupsStore } from "./ProjectGroupsStore";
import { SourcesStore } from "./SourcesStore";
import { UsageStore } from "./UsageStore";

export { HOME_TAB_ID, type OpenCodexAppTab } from "./NavigationStore";

/**
 * Root store for the desktop UI.
 */
export class RootStore {
  readonly appStore = new AppStore(this);
  readonly approvalsStore = new ApprovalsStore(this);
  readonly chatEventLogStore = new ChatEventLogStore(this);
  readonly collaborationStore = new CollaborationStore(this);
  readonly commitPromptStore = new CommitPromptStore(this);
  readonly homeStore = new HomeStore();
  readonly logsStore = new LogsStore(this);
  readonly navigationStore = new NavigationStore(this);
  readonly pluginsStore = new PluginsStore(this);
  readonly projectsStore = new ProjectsStore(this);
  readonly projectGroupsStore = new ProjectGroupsStore(this);
  readonly sourcesStore = new SourcesStore(this);
  readonly usageStore = new UsageStore(this);
  /**
   * Creates a root store instance.
   *
   * @param transport Transport implementation used to communicate with the backend.
   */
  constructor(private readonly transport: OpenCodexClientTransport) {
    makeAutoObservable(this);
    this.transport.onEvent((event) => this.handleEvent(event));
  }

  request<T = unknown>(request: OpenCodexRequest): Promise<T> {
    return this.transport.request<T>(request);
  }

  get settings(): OpenCodexSettings {
    return this.appStore.settingsStore.settings;
  }

  set settings(settings: OpenCodexSettings) {
    this.appStore.settingsStore.replaceSettings(settings);
  }

  /**
   * Returns the currently active project tab store.
   *
   * @returns Active project store, or `null` when Home is active.
   */
  get activeProjectStore(): ProjectStore | null {
    return this.navigationStore.activeProjectStore;
  }

  /**
   * Returns the chat selected in the active project tab.
   *
   * @returns Active chat store, or `null`.
   */
  get activeChatStore(): ChatStore | null {
    return this.activeProjectStore?.selectedChat ?? null;
  }

  /**
   * Bootstraps the store by requesting initial backend state.
   *
   * @returns Promise resolved when the operation completes.
   */
  async bootstrap(): Promise<void> {
    await this.appStore.bootstrap();
  }

  /**
   * Applies a backend event to observable state.
   *
   * @param event Event payload to apply.
   *
   * @returns Nothing.
   */
  handleEvent(event: OpenCodexEvent): void {
    if (event.type === "app.navigation.requested") {
      this.projectsStore.navigateToThreadFromNotification(event.sourceId, event.threadId);
      return;
    }

    this.appStore.handleEvent(event);
    this.chatEventLogStore.handleEvent(event);
    this.collaborationStore.handleEvent(event);
    if (event.type === "models.updated") {
      this.projectsStore.reconcileReasoningEfforts();
    }
    this.approvalsStore.handleEvent(event);
    this.logsStore.handleEvent(event);
    this.projectsStore.handleEvent(event);
    this.projectGroupsStore.handleEvent(event);
    this.sourcesStore.handleEvent(event);
    this.usageStore.handleEvent(event);

    if (event.type === "error") {
      this.applyErrorEvent(event);
    }
  }

  /**
   * Opens the source management section on Home.
   *
   * @returns Nothing.
   */
  openSourcesHome(): void {
    this.homeStore.selectSection("sources");
    this.navigationStore.activateHome();
  }

  /**
   * Opens the persisted application logs section on Home.
   *
   * @returns Nothing.
   */
  openLogsHome(): void {
    this.homeStore.selectSection("logs");
    this.navigationStore.activateHome();
    void this.logsStore.loadLatest();
  }

  /**
   * Opens the native image picker for composer attachments.
   *
   * @returns Selected image attachments.
   */
  async pickImageAttachments(): Promise<OpenCodexImageAttachment[]> {
    return this.transport.request<OpenCodexImageAttachment[]>({ type: "attachments.pickImages" });
  }

  /**
   * Requests opening of an external link.
   *
   * @param href Link target to open.
   *
   * @returns Nothing.
   */
  openExternalLink(href: string): void {
    const trimmedHref = href.trim();

    if (trimmedHref.length === 0) {
      return;
    }

    void this.transport.request({
      type: "system.openLink",
      href: trimmedHref,
      projectPath: this.activeProjectStore?.projectPath ?? null,
      sourceId: this.activeProjectStore?.project.sourceId ?? null
    });
  }

  /**
   * Requests opening of a project folder through its configured source opener.
   *
   * @param projectPath Project folder path.
   * @param sourceId Source identifier.
   *
   * @returns Nothing.
   */
  openProjectInIde(projectPath: string, sourceId: string | null): void {
    if (sourceId === null) {
      return;
    }

    void this.transport.request({
      type: "system.openProject",
      projectPath,
      sourceId
    });
  }

  /**
   * Requests opening a project folder in the host file manager.
   *
   * @param projectPath Project folder path.
   * @param sourceId Source identifier.
   *
   * @returns Nothing.
   */
  openProjectFolder(projectPath: string, sourceId: string | null): void {
    if (sourceId === null) {
      return;
    }

    void this.transport.request({
      type: "system.openProjectFolder",
      projectPath,
      sourceId
    });
  }

  /**
   * Requests opening a host terminal in the project folder.
   *
   * @param projectPath Project folder path.
   * @param sourceId Source identifier.
   *
   * @returns Nothing.
   */
  openProjectTerminal(projectPath: string, sourceId: string | null): void {
    if (sourceId === null) {
      return;
    }

    void this.transport.request({
      type: "system.openProjectTerminal",
      projectPath,
      sourceId
    });
  }

  /**
   * Opens the source-scoped usage history in a dedicated native window.
   *
   * @param sourceId Source whose usage history should be displayed.
   * @returns Nothing.
   */
  openUsageHistory(sourceId: string): void {
    if (sourceId.trim().length === 0) {
      return;
    }

    void this.transport.request({
      type: "app.openUsageHistory",
      sourceId
    });
  }

  /**
   * Applies an error event and clears pending loading states when needed.
   *
   * @param event Error event payload.
   *
   * @returns Nothing.
   */
  private applyErrorEvent(event: Extract<OpenCodexEvent, { type: "error" }>): void {
    this.appStore.applyError(event);

    if (event.recoverable && event.threadId !== undefined) {
      if (this.projectsStore.applyRecoverableThreadError(event.threadId)) {
        return;
      }
    }

    this.appStore.isBootstrapping = false;
    this.homeStore.isOpeningProject = false;
    this.projectsStore.resetPendingProjectStates();
  }

}
