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
import type { ChatStore } from "./ChatStore";
import { CommitPromptStore } from "./CommitPromptStore";
import { HomeStore } from "./HomeStore";
import { LogsStore } from "./LogsStore";
import { NavigationStore } from "./NavigationStore";
import type { ProjectStore } from "./ProjectStore";
import { ProjectsStore } from "./ProjectsStore";
import { SourcesStore } from "./SourcesStore";

export { HOME_TAB_ID, type OpenCodexAppTab } from "./NavigationStore";

/**
 * Root store for the desktop UI.
 */
export class RootStore {
  readonly appStore = new AppStore(this);
  readonly approvalsStore = new ApprovalsStore(this);
  readonly commitPromptStore = new CommitPromptStore(this);
  readonly homeStore = new HomeStore();
  readonly logsStore = new LogsStore(this);
  readonly navigationStore = new NavigationStore(this);
  readonly projectsStore = new ProjectsStore(this);
  readonly sourcesStore = new SourcesStore(this);
  private threadSelectionStartedAt: number | null = null;

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
    return this.appStore.settings;
  }

  set settings(settings: OpenCodexSettings) {
    this.appStore.settings = settings;
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
    this.appStore.handleEvent(event);
    this.approvalsStore.handleEvent(event);
    this.logsStore.handleEvent(event);
    this.projectsStore.handleEvent(event);
    this.sourcesStore.handleEvent(event);

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
   * Starts timing instrumentation for thread selection.
   *
   * @param threadId Thread identifier.
   *
   * @returns Nothing.
   */
  startThreadSelectionTiming(threadId: string): void {
    console.info("[OpenCodexUI timing] thread selected", {
      timestamp: new Date().toISOString(),
      threadId
    });
    this.threadSelectionStartedAt = Date.now();
  }

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
      projectPath: this.activeProjectStore?.projectPath ?? null
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

  /**
   * Logs store population timings for a thread update.
   *
   * @param threadId Thread identifier.
   * @param source Source label used for logging.
   * @param turnCount Turn count.
   * @param changed Changed.
   * @param firstChangedIndex First changed index.
   *
   * @returns Nothing.
   */
  logStorePopulation(
    threadId: string,
    source: string,
    turnCount: number,
    changed: boolean,
    firstChangedIndex: number | null
  ): void {
    console.info("[OpenCodexUI timing] store populated", {
      timestamp: new Date().toISOString(),
      durationSinceSelectionMs: this.threadSelectionStartedAt === null
        ? null
        : Date.now() - this.threadSelectionStartedAt,
      threadId,
      source,
      turnCount,
      changed,
      firstChangedIndex
    });
  }

}
