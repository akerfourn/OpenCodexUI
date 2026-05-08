/**
 * Coordinates application-wide state, project tabs, and backend events.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexActivity,
  OpenCodexApproval,
  OpenCodexClientTransport,
  OpenCodexEvent,
  OpenCodexLanguage,
  OpenCodexMessage,
  OpenCodexMessagePhase,
  OpenCodexProject,
  OpenCodexReasoningEffort,
  OpenCodexSettings,
  OpenCodexThread,
  OpenCodexTurn,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

import { applyOpenCodexLanguage } from "../i18n/i18n";
import { ChatStore } from "./ChatStore";
import { HomeStore } from "./HomeStore";
import { ProjectStore } from "./ProjectStore";

export const HOME_TAB_ID = "home";

export type OpenCodexAppTab =
  | { id: typeof HOME_TAB_ID; type: "home" }
  | { id: string; type: "project"; projectId: string };

/**
 * Root store for the desktop UI.
 */
export class RootStore {
  settings: OpenCodexSettings = {
    codexCommand: "codex",
    defaultModel: null,
    defaultReasoningEffort: "medium",
    showActivityPanel: true,
    experimentalApi: true,
    language: "system"
  };
  readonly homeStore = new HomeStore();
  readonly projectStoresById = new Map<string, ProjectStore>();
  projects: OpenCodexProject[] = [];
  tabs: OpenCodexAppTab[] = [{ id: HOME_TAB_ID, type: "home" }];
  activeTabId = HOME_TAB_ID;
  launchProjectPath: string | null = null;
  projectCloseRequest: ProjectStore | null = null;
  approvals: OpenCodexApproval[] = [];
  models: string[] = [];
  selectedModel: string | null = null;
  reasoningEffort: OpenCodexReasoningEffort = "medium";
  errorMessage: string | null = null;
  connectionStatus = "stopped";
  isBootstrapping = false;
  pendingProjectTrustRequest: { projectPath: string; disabledFolders: string[] } | null = null;
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

  /**
   * Returns the currently active project tab store.
   *
   * @returns Active project store, or `null` when Home is active.
   */
  get activeProjectStore(): ProjectStore | null {
    const tab = this.tabs.find((entry) => entry.id === this.activeTabId);

    if (tab?.type !== "project") {
      return null;
    }

    return this.projectStoresById.get(tab.projectId) ?? null;
  }

  /**
   * Returns the project stores in tab order.
   *
   * @returns Project tab stores.
   */
  get projectTabStores(): ProjectStore[] {
    return this.tabs
      .filter((tab): tab is Extract<OpenCodexAppTab, { type: "project" }> => tab.type === "project")
      .map((tab) => this.projectStoresById.get(tab.projectId))
      .filter((projectStore): projectStore is ProjectStore => projectStore !== undefined);
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
   * Returns any chat currently running a turn.
   *
   * @returns Running chat store, or `null`.
   */
  get runningChatStore(): ChatStore | null {
    for (const projectStore of this.projectStoresById.values()) {
      for (const chatStore of projectStore.chatsById.values()) {
        if (chatStore.isWorking || chatStore.isStartingTurn) {
          return chatStore;
        }
      }
    }

    return null;
  }

  /**
   * Returns the current thread for compatibility with chat components.
   *
   * @returns Active thread, or `null`.
   */
  get currentThread(): OpenCodexThread | null {
    return this.activeChatStore?.thread ?? null;
  }

  /**
   * Returns the active chat turns.
   *
   * @returns Active turns.
   */
  get turns(): OpenCodexTurn[] {
    return this.activeChatStore?.turns ?? [];
  }

  /**
   * Returns the active chat activity log.
   *
   * @returns Activity text entries.
   */
  get activity(): string[] {
    return this.activeChatStore?.activity ?? [];
  }

  /**
   * Returns the active project filtered threads.
   *
   * @returns Filtered thread list.
   */
  get filteredThreads(): OpenCodexThread[] {
    return this.activeProjectStore?.filteredThreads ?? [];
  }

  /**
   * Returns the active project search term.
   *
   * @returns Search text.
   */
  get searchTerm(): string {
    return this.activeProjectStore?.searchTerm ?? "";
  }

  /**
   * Returns the legacy thread scope value used by the old thread list component.
   *
   * @returns Current project scope.
   */
  get scope(): "currentProject" {
    return "currentProject";
  }

  /**
   * Returns whether a project-scoped thread list can be shown.
   *
   * @returns `true` when a project tab is active.
   */
  get currentProjectFilterAvailable(): boolean {
    return this.activeProjectStore !== null;
  }

  /**
   * Returns whether threads are loading in the active project.
   *
   * @returns `true` when loading.
   */
  get isLoadingThreads(): boolean {
    return this.activeProjectStore?.isLoadingThreads ?? false;
  }

  /**
   * Returns whether a thread is being created in the active project.
   *
   * @returns `true` when creating.
   */
  get isCreatingThread(): boolean {
    return this.activeProjectStore?.isCreatingThread ?? false;
  }

  /**
   * Returns the loading thread identifier for the active project.
   *
   * @returns Thread identifier, or `null`.
   */
  get loadingThreadId(): string | null {
    return this.activeProjectStore?.loadingThreadId ?? null;
  }

  /**
   * Returns whether older messages are being loaded in the active chat.
   *
   * @returns `true` when loading.
   */
  get isLoadingOlderMessages(): boolean {
    return this.activeChatStore?.isLoadingOlderMessages ?? false;
  }

  /**
   * Returns whether the active chat is syncing from Codex.
   *
   * @returns `true` when syncing.
   */
  get isSyncingCurrentThread(): boolean {
    return this.activeChatStore?.isSyncing ?? false;
  }

  /**
   * Returns whether older messages are available for the active chat.
   *
   * @returns `true` when older messages exist.
   */
  get hasMoreOlderMessages(): boolean {
    return this.activeChatStore?.hasMoreOlderMessages ?? false;
  }

  /**
   * Returns the active chat older-message version.
   *
   * @returns Version number.
   */
  get olderMessagesPrependVersion(): number {
    return this.activeChatStore?.olderMessagesPrependVersion ?? 0;
  }

  /**
   * Returns the active chat scroll-bottom version.
   *
   * @returns Version number.
   */
  get scrollToBottomVersion(): number {
    return this.activeChatStore?.scrollToBottomVersion ?? 0;
  }

  /**
   * Returns whether the active chat is running a turn.
   *
   * @returns `true` when working.
   */
  get isWorking(): boolean {
    return this.activeChatStore?.isWorking ?? false;
  }

  /**
   * Returns whether the active chat is starting a turn.
   *
   * @returns `true` when starting.
   */
  get isStartingTurn(): boolean {
    return this.activeChatStore?.isStartingTurn ?? false;
  }

  /**
   * Returns whether the active chat is refreshing.
   *
   * @returns `true` when refreshing.
   */
  get isRefreshingThread(): boolean {
    return this.activeChatStore?.isRefreshing ?? false;
  }

  /**
   * Returns whether the active chat is recovering.
   *
   * @returns `true` when recovering.
   */
  get isRecoveringThread(): boolean {
    return this.activeChatStore?.isRecovering ?? false;
  }

  /**
   * Returns the active turn identifier.
   *
   * @returns Active turn identifier, or `null`.
   */
  get activeTurnId(): string | null {
    return this.activeChatStore?.activeTurnId ?? null;
  }

  /**
   * Returns model options exposed by the UI.
   *
   * @returns Model list.
   */
  get modelOptions(): string[] {
    const options = [...this.models];

    if (this.selectedModel !== null && !options.includes(this.selectedModel)) {
      options.unshift(this.selectedModel);
    }

    return options;
  }

  /**
   * Bootstraps the store by requesting initial backend state.
   *
   * @returns Promise resolved when the operation completes.
   */
  async bootstrap(): Promise<void> {
    this.isBootstrapping = true;

    try {
      await this.transport.request({ type: "app.bootstrap" });
    } catch {
      this.isBootstrapping = false;
    }
  }

  /**
   * Applies a backend event to observable state.
   *
   * @param event Event payload to apply.
   *
   * @returns Nothing.
   */
  handleEvent(event: OpenCodexEvent): void {
    switch (event.type) {
      case "connection.status":
        this.connectionStatus = event.status;
        return;
      case "app.bootstrap":
        this.settings = event.settings;
        applyOpenCodexLanguage(event.settings.language);
        this.launchProjectPath = event.projectPath;
        this.selectedModel = event.settings.defaultModel;
        this.reasoningEffort = event.settings.defaultReasoningEffort ?? "medium";
        return;
      case "projects.updated":
        this.isBootstrapping = false;
        this.projects = event.projects;
        this.applyProjectMetadata(event.projects);
        return;
      case "project.opened":
        this.homeStore.isOpeningProject = false;
        this.openProjectTab(event.project, true);
        this.refreshProjectThreads(this.projectStoresById.get(event.project.id) ?? null);
        return;
      case "threads.updated":
        this.applyThreadsUpdated(event.projectPath, event.threads);
        return;
      case "thread.opened":
      case "thread.created":
        this.applyThreadOpened(
          event.thread,
          event.turns,
          event.type,
          event.type === "thread.opened" ? event.hasMoreOlderMessages ?? false : false
        );
        return;
      case "thread.metadata.updated":
        this.applyThreadMetadata(event.thread);
        return;
      case "thread.turns.prepended":
        this.applyTurnsPrepended(event.threadId, event.turns, event.hasMoreOlderMessages);
        return;
      case "thread.turns.synced":
        this.applyTurnsSynced(event.threadId, event.turns, event.hasMoreOlderMessages);
        return;
      case "thread.sync.started":
        this.updateThreadSyncState(event.threadId, true);
        return;
      case "thread.sync.completed":
        this.updateThreadSyncState(event.threadId, false);
        return;
      case "thread.recovery.started":
        this.updateThreadRecoveryState(event.threadId, true);
        return;
      case "thread.recovery.completed":
        this.completeThreadRecovery(event.threadId);
        return;
      case "thread.renamed":
        this.applyThreadRename(event.threadId, event.name);
        return;
      case "message.started":
        this.applyMessageStarted(event.threadId, event.message);
        return;
      case "message.delta":
        this.appendAssistantDelta(event.threadId, event.turnId, event.messageId, event.delta, event.phase ?? null);
        return;
      case "activity.updated":
        this.applyActivityUpdated(event.threadId, event.activity);
        return;
      case "turn.started":
        this.applyTurnStarted(event.threadId, event.turnId);
        return;
      case "turn.completed":
        this.applyTurnCompleted(event.threadId, event.turnId, event.durationMs);
        return;
      case "approval.requested":
        this.approvals.push(event.approval);
        return;
      case "approval.resolved":
        this.approvals = this.approvals.filter((approval) => approval.id !== event.approvalId);
        return;
      case "project.trust.required":
        this.pendingProjectTrustRequest = {
          projectPath: event.projectPath,
          disabledFolders: event.disabledFolders
        };
        return;
      case "project.trust.completed":
        if (this.pendingProjectTrustRequest?.projectPath === event.projectPath) {
          this.pendingProjectTrustRequest = null;
        }
        return;
      case "models.updated":
        this.models = event.models;
        this.selectedModel = this.selectedModel ?? event.models[0] ?? null;
        return;
      case "error":
        this.applyErrorEvent(event);
        return;
      case "message.completed":
      case "activity.started":
      case "activity.completed":
        return;
    }
  }

  /**
   * Activates an application tab.
   *
   * @param tabId Tab identifier.
   *
   * @returns Nothing.
   */
  activateTab(tabId: string): void {
    if (this.tabs.some((tab) => tab.id === tabId)) {
      this.activeTabId = tabId;
    }
  }

  /**
   * Opens a project from a path.
   *
   * @param projectPath Project folder path.
   * @param createIfMissing Whether missing folders should be created.
   *
   * @returns Nothing.
   */
  openProject(projectPath: string, createIfMissing = false): void {
    const trimmedPath = projectPath.trim();

    if (trimmedPath.length === 0) {
      return;
    }

    const existingProject = this.findProjectStoreByPath(trimmedPath);

    if (existingProject !== null) {
      this.openProjectTab(existingProject.project, true);
      this.refreshProjectThreads(existingProject);
      return;
    }

    this.homeStore.isOpeningProject = true;
    this.errorMessage = null;
    void this.transport.request({
      type: "projects.open",
      projectPath: trimmedPath,
      createIfMissing
    }).catch(() => {
      runInAction(() => {
        this.homeStore.isOpeningProject = false;
      });
    });
  }

  /**
   * Opens a project through the host directory picker.
   *
   * @param mode Picker mode.
   *
   * @returns Nothing.
   */
  openProjectFromPicker(mode: "open" | "create"): void {
    this.homeStore.isOpeningProject = true;
    this.errorMessage = null;
    void this.transport.request({
      type: "projects.pickDirectory",
      mode
    }).then((project) => {
      if (project === null) {
        runInAction(() => {
          this.homeStore.isOpeningProject = false;
        });
      }
    }).catch(() => {
      runInAction(() => {
        this.homeStore.isOpeningProject = false;
      });
    });
  }

  /**
   * Opens a project from the Home path input.
   *
   * @param createIfMissing Whether missing folders should be created.
   *
   * @returns Nothing.
   */
  openProjectFromInput(createIfMissing: boolean): void {
    this.openProject(this.homeStore.projectPathInput, createIfMissing);
  }

  /**
   * Refreshes the cached project list and discovers external Codex threads.
   *
   * @returns Nothing.
   */
  refreshProjects(): void {
    void this.transport.request({ type: "projects.list" });
  }

  /**
   * Requests confirmation before closing a project tab.
   *
   * @param projectId Project identifier.
   *
   * @returns Nothing.
   */
  requestCloseProject(projectId: string): void {
    const projectStore = this.projectStoresById.get(projectId) ?? null;

    if (projectStore === null) {
      return;
    }

    this.projectCloseRequest = projectStore;
  }

  /**
   * Cancels the pending project close confirmation.
   *
   * @returns Nothing.
   */
  cancelCloseProject(): void {
    this.projectCloseRequest = null;
  }

  /**
   * Closes the confirmed project tab and clears its in-memory chat stores.
   *
   * @returns Nothing.
   */
  confirmCloseProject(): void {
    const projectStore = this.projectCloseRequest;

    if (projectStore === null || this.hasRunningTurnInProject(projectStore.project.id)) {
      return;
    }

    projectStore.clearMemory();
    this.projectStoresById.delete(projectStore.project.id);
    this.tabs = this.tabs.filter((tab) => tab.id !== projectStore.project.id);

    if (this.activeTabId === projectStore.project.id) {
      this.activeTabId = HOME_TAB_ID;
    }

    this.projectCloseRequest = null;
  }

  /**
   * Refreshes the active project thread list.
   *
   * @returns Nothing.
   */
  refreshThreads(): void {
    this.refreshProjectThreads(this.activeProjectStore);
  }

  /**
   * Opens a thread inside the active project.
   *
   * @param threadId Thread identifier.
   *
   * @returns Nothing.
   */
  openThread(threadId: string): void {
    const projectStore = this.activeProjectStore;

    if (projectStore === null || projectStore.loadingThreadId === threadId) {
      return;
    }

    console.info("[OpenCodexUI timing] thread selected", {
      timestamp: new Date().toISOString(),
      threadId
    });
    this.threadSelectionStartedAt = Date.now();

    const thread = projectStore.findThread(threadId);
    const chatStore = thread === null ? null : projectStore.getOrCreateChat(thread);
    const isChangingThread = projectStore.selectedChatId !== threadId;
    this.errorMessage = null;
    projectStore.selectChat(threadId);

    if (isChangingThread) {
      projectStore.loadingThreadId = threadId;
      if (chatStore !== null) {
        chatStore.clearLoadedState();
      }
    } else if (chatStore !== null) {
      chatStore.isSyncing = true;
    }

    void this.transport.request({ type: "threads.open", threadId });
  }

  /**
   * Refreshes the currently opened thread when allowed.
   *
   * @returns Nothing.
   */
  refreshCurrentThread(): void {
    const currentThread = this.currentThread;

    if (currentThread === null || !this.canRefreshCurrentThread()) {
      return;
    }

    const chatStore = this.activeChatStore;

    if (chatStore !== null) {
      chatStore.isRefreshing = true;
    }

    this.openThread(currentThread.id);
  }

  /**
   * Checks whether the current thread can be refreshed.
   *
   * @returns `true` when refresh is allowed.
   */
  canRefreshCurrentThread(): boolean {
    const chatStore = this.activeChatStore;

    return (
      chatStore !== null &&
      !chatStore.isRefreshing &&
      !chatStore.isWorking &&
      !chatStore.isStartingTurn &&
      !chatStore.isRecovering
    );
  }

  /**
   * Requests recovery for the currently opened thread.
   *
   * @returns Nothing.
   */
  recoverCurrentThread(): void {
    const chatStore = this.activeChatStore;

    if (chatStore === null || chatStore.isRecovering) {
      return;
    }

    chatStore.isRecovering = true;
    chatStore.isSyncing = true;
    void this.transport.request({
      type: "threads.recover",
      threadId: chatStore.thread.id
    });
  }

  /**
   * Creates a new empty thread in the active project.
   *
   * @returns Nothing.
   */
  createThread(): void {
    const projectStore = this.activeProjectStore;

    if (projectStore === null) {
      return;
    }

    projectStore.isCreatingThread = true;
    projectStore.loadingThreadId = null;
    projectStore.selectedChatId = null;
    void this.transport.request({
      type: "threads.create",
      projectPath: projectStore.projectPath
    });
  }

  /**
   * Requests older messages for the current thread.
   *
   * @returns Nothing.
   */
  loadOlderMessages(): void {
    const chatStore = this.activeChatStore;

    if (
      chatStore === null ||
      chatStore.isLoadingOlderMessages ||
      !chatStore.hasMoreOlderMessages ||
      this.loadingThreadId !== null
    ) {
      return;
    }

    chatStore.isLoadingOlderMessages = true;
    void this.transport.request({
      type: "threads.loadOlder",
      threadId: chatStore.thread.id
    }).then((response) => {
      const result = readLoadOlderResult(response);

      if (result.turns.length === 0) {
        runInAction(() => {
          chatStore.isLoadingOlderMessages = false;
          chatStore.hasMoreOlderMessages = result.hasMoreOlderMessages;
        });
      }
    }).catch(() => {
      runInAction(() => {
        chatStore.isLoadingOlderMessages = false;
      });
    });
  }

  /**
   * Sends a user message in the active chat.
   *
   * @param text User message text.
   * @param model Selected model identifier.
   * @param reasoningEffort Selected reasoning effort.
   *
   * @returns Nothing.
   */
  sendMessage(
    text: string,
    model: string | null = this.selectedModel,
    reasoningEffort: OpenCodexReasoningEffort = this.reasoningEffort
  ): void {
    const trimmedText = text.trim();
    const projectStore = this.activeProjectStore;
    const chatStore = this.activeChatStore;

    if (
      trimmedText.length === 0 ||
      projectStore === null ||
      chatStore === null ||
      this.runningChatStore !== null
    ) {
      return;
    }

    chatStore.isStartingTurn = true;
    this.createOptimisticUserTurn(chatStore, trimmedText);

    void this.transport.request({
      type: "turn.start",
      threadId: chatStore.thread.id,
      projectPath: projectStore.projectPath,
      text: trimmedText,
      model,
      reasoningEffort
    });
  }

  /**
   * Sets the selected model in the UI state.
   *
   * @param value Value to store.
   *
   * @returns Nothing.
   */
  setSelectedModel(value: string | null): void {
    this.selectedModel = value;
  }

  /**
   * Sets the selected reasoning effort.
   *
   * @param value Value to store.
   *
   * @returns Nothing.
   */
  setReasoningEffort(value: OpenCodexReasoningEffort): void {
    this.reasoningEffort = value;
  }

  /**
   * Updates the UI language locally and persists it in settings.
   *
   * @param language Language used for localized labels.
   *
   * @returns Nothing.
   */
  setLanguage(language: OpenCodexLanguage): void {
    this.settings = { ...this.settings, language };
    applyOpenCodexLanguage(language);
    void this.transport.request({
      type: "settings.update",
      patch: { language }
    });
  }

  /**
   * Interrupts the active turn on the backend.
   *
   * @returns Nothing.
   */
  interruptTurn(): void {
    const chatStore = this.activeChatStore;

    if (chatStore === null || chatStore.activeTurnId === null) {
      return;
    }

    void this.transport.request({
      type: "turn.interrupt",
      threadId: chatStore.thread.id,
      turnId: chatStore.activeTurnId
    });
  }

  /**
   * Renames the current thread.
   *
   * @param name Name value to persist.
   *
   * @returns Nothing.
   */
  renameCurrentThread(name: string): void {
    const chatStore = this.activeChatStore;
    const trimmedName = name.trim();

    if (chatStore === null || trimmedName.length === 0) {
      return;
    }

    this.applyThreadRename(chatStore.thread.id, trimmedName);

    void this.transport.request({
      type: "threads.rename",
      threadId: chatStore.thread.id,
      name: trimmedName
    });
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
   * Sends the selected approval decision back to Codex.
   *
   * @param approvalId Approval identifier.
   * @param decision Approval decision to apply.
   *
   * @returns Nothing.
   */
  resolveApproval(approvalId: string, decision: OpenCodexApproval["choices"][number]): void {
    void this.transport.request({ type: "approval.respond", approvalId, decision });
  }

  /**
   * Marks a project as trusted through the Codex configuration API.
   *
   * @param projectPath Project path.
   *
   * @returns Nothing.
   */
  trustProject(projectPath: string): void {
    void this.transport.request({ type: "project.trust", projectPath });
  }

  /**
   * Dismisses the pending project trust request in the UI.
   *
   * @param projectPath Project path.
   *
   * @returns Nothing.
   */
  dismissProjectTrustRequest(projectPath: string): void {
    this.pendingProjectTrustRequest = null;
    void this.transport.request({ type: "project.trust.dismiss", projectPath });
  }

  /**
   * Sets the active project search term.
   *
   * @param value Value to normalize.
   *
   * @returns Nothing.
   */
  setSearchTerm(value: string): void {
    this.activeProjectStore?.setSearchTerm(value);
  }

  /**
   * Keeps old scope calls harmless while project tabs own filtering.
   *
   * @returns Nothing.
   */
  setScope(_scope?: unknown): void {
    this.refreshThreads();
  }

  /**
   * Refreshes the thread list for one project store.
   *
   * @param projectStore Project store to refresh.
   *
   * @returns Nothing.
   */
  private refreshProjectThreads(projectStore: ProjectStore | null): void {
    if (projectStore === null) {
      return;
    }

    projectStore.isLoadingThreads = true;
    void this.transport.request({
      type: "threads.list",
      scope: "currentProject",
      projectPath: projectStore.projectPath,
      searchTerm: projectStore.searchTerm
    });
  }

  /**
   * Applies refreshed project metadata to open project stores.
   *
   * @param projects Project collection from the backend.
   *
   * @returns Nothing.
   */
  private applyProjectMetadata(projects: OpenCodexProject[]): void {
    for (const project of projects) {
      const projectStore = this.projectStoresById.get(project.id) ?? this.findProjectStoreByPath(project.path);

      if (projectStore === null) {
        continue;
      }

      if (projectStore.project.id !== project.id) {
        this.projectStoresById.delete(projectStore.project.id);
        this.projectStoresById.set(project.id, projectStore);
        this.tabs = this.tabs.map((tab) => (
          tab.id === projectStore.project.id ? { id: project.id, type: "project", projectId: project.id } : tab
        ));
      }

      projectStore.setProject(project);
    }
  }

  /**
   * Opens a project tab, ensuring only one tab exists per project path.
   *
   * @param project Project metadata.
   * @param activate Whether the tab should become active.
   *
   * @returns Project store for the tab.
   */
  private openProjectTab(project: OpenCodexProject, activate: boolean): ProjectStore {
    const existingStore = this.projectStoresById.get(project.id) ?? this.findProjectStoreByPath(project.path);
    const projectStore = existingStore ?? new ProjectStore(project);

    if (this.projects.some((entry) => entry.id === project.id)) {
      this.projects = this.projects.map((entry) => entry.id === project.id ? project : entry);
    } else {
      this.projects = [project, ...this.projects];
    }

    projectStore.setProject(project);
    this.projectStoresById.set(project.id, projectStore);

    if (!this.tabs.some((tab) => tab.id === project.id)) {
      this.tabs = [...this.tabs, { id: project.id, type: "project", projectId: project.id }];
    }

    if (activate) {
      this.activeTabId = project.id;
    }

    return projectStore;
  }

  /**
   * Applies a refreshed thread list to the matching project store.
   *
   * @param projectPath Project path associated with the update.
   * @param threads Thread collection.
   *
   * @returns Nothing.
   */
  private applyThreadsUpdated(projectPath: string | null, threads: OpenCodexThread[]): void {
    const projectStore = projectPath === null ? this.activeProjectStore : this.findProjectStoreByPath(projectPath);

    if (projectStore === null) {
      return;
    }

    projectStore.isLoadingThreads = false;
    projectStore.setThreads(threads);
    logThreadsForDebug(threads, projectStore.projectPath, projectStore.searchTerm);
  }

  /**
   * Applies a full opened-thread snapshot.
   *
   * @param thread Thread metadata.
   * @param turns Turn collection.
   * @param source Event source.
   * @param hasMoreOlderMessages Whether older messages are available.
   *
   * @returns Nothing.
   */
  private applyThreadOpened(
    thread: OpenCodexThread,
    turns: OpenCodexTurn[],
    source: "thread.opened" | "thread.created",
    hasMoreOlderMessages: boolean
  ): void {
    const projectStore = this.ensureProjectStoreForThread(thread);
    const openedThread = projectStore.upsertThread(thread);
    const chatStore = projectStore.getOrCreateChat(openedThread);
    const shouldMergeTurns = projectStore.selectedChatId === openedThread.id && chatStore.turns.length > 0;

    projectStore.isCreatingThread = false;
    projectStore.loadingThreadId = null;
    projectStore.selectChat(openedThread.id);
    chatStore.isRefreshing = false;
    chatStore.isLoadingOlderMessages = false;
    chatStore.isSyncing = false;
    chatStore.pendingTurnId = null;
    chatStore.activity = [];
    chatStore.hasMoreOlderMessages = source === "thread.opened" ? hasMoreOlderMessages : false;
    this.applyThreadTurns(chatStore, openedThread.id, turns, shouldMergeTurns ? "merge" : "replace", source);
    chatStore.scrollToBottomVersion += 1;
    this.errorMessage = null;

    if (openedThread.model !== null) {
      this.selectedModel = openedThread.model;
    }

    if (openedThread.reasoningEffort !== null) {
      this.reasoningEffort = openedThread.reasoningEffort;
    }
  }

  /**
   * Applies incoming thread metadata.
   *
   * @param thread Thread payload to apply.
   *
   * @returns Nothing.
   */
  private applyThreadMetadata(thread: OpenCodexThread): void {
    const projectStore = this.findProjectStoreForThread(thread.id) ?? this.ensureProjectStoreForThread(thread);
    const updatedThread = projectStore.upsertThread(thread);
    const chatStore = projectStore.chatsById.get(updatedThread.id);

    if (chatStore !== undefined) {
      chatStore.setThread(updatedThread);
    }

    if (this.currentThread?.id === updatedThread.id) {
      if (updatedThread.model !== null) {
        this.selectedModel = updatedThread.model;
      }

      if (updatedThread.reasoningEffort !== null) {
        this.reasoningEffort = updatedThread.reasoningEffort;
      }
    }
  }

  /**
   * Prepends older turns to a loaded chat.
   *
   * @param threadId Thread identifier.
   * @param turns Older turns.
   * @param hasMoreOlderMessages Whether more older messages exist.
   *
   * @returns Nothing.
   */
  private applyTurnsPrepended(
    threadId: string,
    turns: OpenCodexTurn[],
    hasMoreOlderMessages: boolean
  ): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.isLoadingOlderMessages = false;
    chatStore.hasMoreOlderMessages = hasMoreOlderMessages;
    chatStore.turns = [...turns, ...chatStore.turns];
    chatStore.olderMessagesPrependVersion += 1;
  }

  /**
   * Applies a synced turn snapshot to a chat.
   *
   * @param threadId Thread identifier.
   * @param turns Synced turns.
   * @param hasMoreOlderMessages Whether more older messages exist.
   *
   * @returns Nothing.
   */
  private applyTurnsSynced(
    threadId: string,
    turns: OpenCodexTurn[],
    hasMoreOlderMessages: boolean
  ): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    this.applyThreadTurns(chatStore, threadId, turns, "merge", "thread.turns.synced");
    chatStore.hasMoreOlderMessages = hasMoreOlderMessages;
  }

  /**
   * Updates the sync flag on a loaded chat.
   *
   * @param threadId Thread identifier.
   * @param isSyncing Whether the chat is syncing.
   *
   * @returns Nothing.
   */
  private updateThreadSyncState(threadId: string, isSyncing: boolean): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.isSyncing = isSyncing;

    if (!isSyncing) {
      chatStore.isRefreshing = false;
    }
  }

  /**
   * Updates the recovery flag on a loaded chat.
   *
   * @param threadId Thread identifier.
   * @param isRecovering Whether the chat is recovering.
   *
   * @returns Nothing.
   */
  private updateThreadRecoveryState(threadId: string, isRecovering: boolean): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.isRecovering = isRecovering;
    chatStore.isSyncing = isRecovering;
    chatStore.isRefreshing = false;
    const projectStore = this.findProjectStoreForThread(threadId);

    if (projectStore !== null) {
      projectStore.loadingThreadId = null;
    }
  }

  /**
   * Completes recovery for a loaded chat.
   *
   * @param threadId Thread identifier.
   *
   * @returns Nothing.
   */
  private completeThreadRecovery(threadId: string): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    const hasRecoveredRunningTurn = hasActiveRunningTurn(chatStore.turns, chatStore.activeTurnId);
    chatStore.isRecovering = false;
    chatStore.isSyncing = false;
    chatStore.isRefreshing = false;
    chatStore.isWorking = hasRecoveredRunningTurn;

    if (!hasRecoveredRunningTurn) {
      chatStore.activeTurnId = null;
      chatStore.pendingTurnId = null;
    }
  }

  /**
   * Applies a thread rename to all local stores.
   *
   * @param threadId Thread identifier.
   * @param name New title.
   *
   * @returns Nothing.
   */
  private applyThreadRename(threadId: string, name: string): void {
    const projectStore = this.findProjectStoreForThread(threadId);

    if (projectStore === null) {
      return;
    }

    projectStore.threads = projectStore.threads.map((thread) => (
      thread.id === threadId ? { ...thread, customTitle: name, title: name } : thread
    ));

    const chatStore = projectStore.chatsById.get(threadId);

    if (chatStore !== undefined) {
      chatStore.setThread({ ...chatStore.thread, customTitle: name, title: name });
    }
  }

  /**
   * Applies a started user message to a chat.
   *
   * @param threadId Thread identifier.
   * @param message Human-readable message.
   *
   * @returns Nothing.
   */
  private applyMessageStarted(threadId: string, message: OpenCodexMessage): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.isStartingTurn = false;
    this.upsertPendingUserTurn(chatStore, threadId, message);
    chatStore.scrollToBottomVersion += 1;
  }

  /**
   * Appends streamed assistant text to a loaded chat.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   * @param itemId Item identifier.
   * @param delta Incremental text.
   * @param phase Assistant message phase.
   *
   * @returns Nothing.
   */
  private appendAssistantDelta(
    threadId: string,
    turnId: string,
    itemId: string,
    delta: string,
    phase: OpenCodexMessagePhase | null
  ): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    const turn = this.findOrCreateTurn(chatStore, threadId, turnId);
    turn.status = "running";
    const existing = turn.items.find((item) => item.id === itemId);

    if (existing !== undefined) {
      existing.content += delta;
      if (existing.phase === undefined || existing.phase === null) {
        existing.phase = phase;
      }
      return;
    }

    turn.items.push({
      id: itemId,
      role: "assistant",
      content: delta,
      status: "streaming",
      createdAt: new Date().toISOString(),
      phase
    });
  }

  /**
   * Applies an activity update to a loaded chat.
   *
   * @param threadId Thread identifier.
   * @param activity Activity payload.
   *
   * @returns Nothing.
   */
  private applyActivityUpdated(threadId: string, activity: OpenCodexActivity): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    if (this.settings.showActivityPanel && activity.content?.trim()) {
      chatStore.activity.push(activity.content);
    }

    this.appendActivityItem(chatStore, threadId, activity);
  }

  /**
   * Applies a turn-started event to a chat.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   *
   * @returns Nothing.
   */
  private applyTurnStarted(threadId: string, turnId: string): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.isStartingTurn = false;
    chatStore.isWorking = true;
    chatStore.activeTurnId = turnId;
    this.movePendingTurnToStartedTurn(chatStore, threadId, turnId);
  }

  /**
   * Applies a turn-completed event to a chat.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   * @param durationMs Turn duration in milliseconds.
   *
   * @returns Nothing.
   */
  private applyTurnCompleted(threadId: string, turnId: string, durationMs: number | null): void {
    const chatStore = this.findChatStore(threadId);

    if (chatStore === null) {
      return;
    }

    chatStore.isWorking = false;
    chatStore.activeTurnId = null;
    chatStore.pendingTurnId = null;
    this.applyTurnDuration(chatStore, turnId, durationMs);
  }

  /**
   * Applies an error event and clears pending loading states when needed.
   *
   * @param event Error event payload.
   *
   * @returns Nothing.
   */
  private applyErrorEvent(event: Extract<OpenCodexEvent, { type: "error" }>): void {
    this.errorMessage = event.details === undefined
      ? event.message
      : `${event.message}\n${JSON.stringify(event.details, null, 2)}`;

    if (event.recoverable && event.threadId !== undefined) {
      const chatStore = this.findChatStore(event.threadId);

      if (chatStore !== null) {
        chatStore.isStartingTurn = false;
        chatStore.isSyncing = true;
        chatStore.isRecovering = true;
        chatStore.isRefreshing = false;
        chatStore.isWorking = true;
        const projectStore = this.findProjectStoreForThread(event.threadId);

        if (projectStore !== null) {
          projectStore.loadingThreadId = null;
        }

        return;
      }
    }

    this.isBootstrapping = false;
    this.homeStore.isOpeningProject = false;
    this.resetPendingProjectStates();
  }

  /**
   * Clears pending state for all loaded projects and chats.
   *
   * @returns Nothing.
   */
  private resetPendingProjectStates(): void {
    for (const projectStore of this.projectStoresById.values()) {
      projectStore.isLoadingThreads = false;
      projectStore.isCreatingThread = false;
      projectStore.loadingThreadId = null;

      for (const chatStore of projectStore.chatsById.values()) {
        chatStore.isLoadingOlderMessages = false;
        chatStore.isSyncing = false;
        chatStore.isRecovering = false;
        chatStore.isWorking = false;
        chatStore.isStartingTurn = false;
        chatStore.isRefreshing = false;
      }
    }
  }

  /**
   * Applies a turn snapshot to the store using the requested merge strategy.
   *
   * @param chatStore Chat store to update.
   * @param threadId Thread identifier.
   * @param nextTurns Next turn collection.
   * @param strategy Strategy.
   * @param source Source label used for logging.
   *
   * @returns Nothing.
   */
  private applyThreadTurns(
    chatStore: ChatStore,
    threadId: string,
    nextTurns: OpenCodexTurn[],
    strategy: "replace" | "merge",
    source: string
  ): void {
    if (strategy === "replace" || chatStore.turns.length === 0) {
      chatStore.turns = nextTurns;
      this.logStorePopulation(threadId, source, nextTurns.length, true, 0);
      return;
    }

    const firstChangedIndex = findFirstChangedTurnIndex(chatStore.turns, nextTurns);

    if (firstChangedIndex === null) {
      this.logStorePopulation(threadId, source, nextTurns.length, false, null);
      return;
    }

    chatStore.turns = [
      ...chatStore.turns.slice(0, firstChangedIndex),
      ...nextTurns.slice(firstChangedIndex)
    ];
    this.logStorePopulation(threadId, source, nextTurns.length, true, firstChangedIndex);
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
  private logStorePopulation(
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

  /**
   * Finds an opened project store by project path.
   *
   * @param projectPath Project path to match.
   *
   * @returns Matching project store, or `null`.
   */
  private findProjectStoreByPath(projectPath: string): ProjectStore | null {
    const normalizedPath = projectPath.trim();

    for (const projectStore of this.projectStoresById.values()) {
      if (projectStore.projectPath === normalizedPath) {
        return projectStore;
      }
    }

    return null;
  }

  /**
   * Finds the project store that currently owns a thread.
   *
   * @param threadId Thread identifier.
   *
   * @returns Matching project store, or `null`.
   */
  private findProjectStoreForThread(threadId: string): ProjectStore | null {
    for (const projectStore of this.projectStoresById.values()) {
      if (projectStore.findThread(threadId) !== null || projectStore.chatsById.has(threadId)) {
        return projectStore;
      }
    }

    return null;
  }

  /**
   * Finds an in-memory chat store by thread identifier.
   *
   * @param threadId Thread identifier.
   *
   * @returns Matching chat store, or `null`.
   */
  private findChatStore(threadId: string): ChatStore | null {
    return this.findProjectStoreForThread(threadId)?.chatsById.get(threadId) ?? null;
  }

  /**
   * Ensures a project store exists for incoming thread metadata.
   *
   * @param thread Thread metadata.
   *
   * @returns Project store for the thread.
   */
  private ensureProjectStoreForThread(thread: OpenCodexThread): ProjectStore {
    const projectPath = thread.projectPath ?? this.activeProjectStore?.projectPath ?? this.launchProjectPath ?? "";
    const existingStore = this.findProjectStoreByPath(projectPath);

    if (existingStore !== null) {
      return existingStore;
    }

    const project = createClientProject(projectPath, thread.projectName);
    this.projects = [project, ...this.projects];
    return this.openProjectTab(project, false);
  }

  /**
   * Checks whether a project contains a running turn.
   *
   * @param projectId Project identifier.
   *
   * @returns `true` when a turn is active.
   */
  private hasRunningTurnInProject(projectId: string): boolean {
    const projectStore = this.projectStoresById.get(projectId) ?? null;

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

  /**
   * Appends an activity item to the active turn.
   *
   * @param chatStore Chat store to update.
   * @param threadId Thread identifier.
   * @param activity Activity payload.
   *
   * @returns Nothing.
   */
  private appendActivityItem(
    chatStore: ChatStore,
    threadId: string,
    activity: OpenCodexActivity
  ): void {
    if (activity.content === undefined) {
      return;
    }

    const turnId = activity.title ?? chatStore.activeTurnId ?? chatStore.pendingTurnId;

    if (turnId === null || turnId.length === 0) {
      return;
    }

    const turn = this.findOrCreateTurn(chatStore, threadId, turnId);
    const existing = turn.items.find((item) => item.id === activity.id);
    turn.status = "running";

    if (existing !== undefined) {
      existing.content += activity.content;
      existing.status = toMessageStatus(activity.status);
      return;
    }

    turn.items.push({
      id: activity.id,
      role: "activity",
      content: activity.content,
      status: toMessageStatus(activity.status),
      createdAt: new Date().toISOString(),
      kind: activity.kind,
      summary: activity.summary,
      details: activity.details
    });
  }

  /**
   * Applies the completed duration to a stored turn.
   *
   * @param chatStore Chat store to update.
   * @param turnId Turn identifier.
   * @param durationMs Duration ms.
   *
   * @returns Nothing.
   */
  private applyTurnDuration(chatStore: ChatStore, turnId: string, durationMs: number | null): void {
    if (durationMs === null) {
      return;
    }

    const turn = chatStore.turns.find((entry) => entry.id === turnId);

    if (turn !== undefined) {
      turn.durationMs = durationMs;
    }
  }

  /**
   * Associates the pending optimistic user turn with a backend thread.
   *
   * @param chatStore Chat store to update.
   * @param threadId Thread identifier.
   * @param message Human-readable message.
   *
   * @returns Nothing.
   */
  private upsertPendingUserTurn(
    chatStore: ChatStore,
    threadId: string,
    message: OpenCodexMessage
  ): void {
    const existingTurn = this.findPendingUserTurn(chatStore, message.content);

    if (existingTurn !== null) {
      existingTurn.threadId = threadId;
      return;
    }

    const turn = this.findOrCreateTurn(chatStore, threadId, `pending:${message.id}`);
    turn.items.push(toTurnItem(message));
    chatStore.pendingTurnId = turn.id;
  }

  /**
   * Moves the optimistic pending turn to the started backend turn.
   *
   * @param chatStore Chat store to update.
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   *
   * @returns Nothing.
   */
  private movePendingTurnToStartedTurn(
    chatStore: ChatStore,
    threadId: string,
    turnId: string
  ): void {
    const pendingTurn = this.findPendingTurn(chatStore);
    const existingTurn = chatStore.turns.find((turn) => turn.id === turnId);

    if (pendingTurn === undefined) {
      this.findOrCreateTurn(chatStore, threadId, turnId);
      return;
    }

    if (existingTurn !== undefined) {
      existingTurn.items = [...pendingTurn.items, ...existingTurn.items];
      chatStore.turns = chatStore.turns.filter((turn) => turn !== pendingTurn);
      return;
    }

    pendingTurn.id = turnId;
    pendingTurn.threadId = threadId;
    pendingTurn.status = "running";
    pendingTurn.startedAt = pendingTurn.startedAt ?? new Date().toISOString();
    chatStore.pendingTurnId = null;
  }

  /**
   * Finds an existing turn or creates it in the store.
   *
   * @param chatStore Chat store to update.
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   *
   * @returns Turn entry.
   */
  private findOrCreateTurn(
    chatStore: ChatStore,
    threadId: string,
    turnId: string
  ): OpenCodexTurn {
    const existing = chatStore.turns.find((turn) => turn.id === turnId);

    if (existing !== undefined) {
      return existing;
    }

    const created: OpenCodexTurn = {
      id: turnId,
      threadId,
      status: null,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      items: []
    };

    chatStore.turns.push(created);
    return created;
  }

  /**
   * Creates an optimistic pending user turn in the UI.
   *
   * @param chatStore Chat store to update.
   * @param content Text content to process.
   *
   * @returns Nothing.
   */
  private createOptimisticUserTurn(chatStore: ChatStore, content: string): void {
    const threadId = chatStore.thread.id;
    const turnId = `pending:${Date.now()}`;
    const created: OpenCodexTurn = {
      id: turnId,
      threadId,
      status: "running",
      startedAt: new Date().toISOString(),
      completedAt: null,
      durationMs: null,
      items: [
        {
          id: `${turnId}:user`,
          role: "user",
          content,
          status: "completed",
          createdAt: new Date().toISOString()
        }
      ]
    };

    chatStore.pendingTurnId = turnId;
    chatStore.turns.push(created);
    chatStore.scrollToBottomVersion += 1;
  }

  /**
   * Finds the current pending turn.
   *
   * @param chatStore Chat store to inspect.
   *
   * @returns Pending turn, or `undefined`.
   */
  private findPendingTurn(chatStore: ChatStore): OpenCodexTurn | undefined {
    if (chatStore.pendingTurnId !== null) {
      return chatStore.turns.find((turn) => turn.id === chatStore.pendingTurnId);
    }

    return chatStore.turns.find((turn) => turn.id.startsWith("pending:"));
  }

  /**
   * Finds the pending user turn matching the provided content.
   *
   * @param chatStore Chat store to inspect.
   * @param content Text content to process.
   *
   * @returns Matching turn, or `null`.
   */
  private findPendingUserTurn(chatStore: ChatStore, content: string): OpenCodexTurn | null {
    const pendingTurn = this.findPendingTurn(chatStore);

    if (pendingTurn === undefined) {
      return null;
    }

    const pendingUserItem = pendingTurn.items.find((item) => item.role === "user");

    if (pendingUserItem?.content !== content) {
      return null;
    }

    return pendingTurn;
  }
}

/**
 * Handles log threads for debug.
 *
 * @param threads Thread collection to process.
 * @param projectPath Project path.
 * @param searchTerm Optional search term.
 *
 * @returns Nothing.
 */
function logThreadsForDebug(
  threads: OpenCodexThread[],
  projectPath: string,
  searchTerm: string
): void {
  console.info("[OpenCodexUI] threads.updated", {
    count: threads.length,
    projectPath,
    searchTerm
  });

  console.table(
    threads.map((thread) => ({
      title: thread.title || thread.preview || "<sans titre>",
      projectPath: thread.projectPath,
      branchName: thread.branchName,
      updatedAt: thread.updatedAt,
      status: thread.status
    }))
  );
}

/**
 * Normalizes the load-older response returned by the backend.
 *
 * @param value Value to normalize.
 *
 * @returns Computed value.
 */
function readLoadOlderResult(value: unknown): {
  turns: OpenCodexTurn[];
  hasMoreOlderMessages: boolean;
} {
  if (typeof value !== "object" || value === null) {
    return { turns: [], hasMoreOlderMessages: false };
  }

  const result = value as {
    turns?: unknown;
    hasMoreOlderMessages?: unknown;
  };

  return {
    turns: Array.isArray(result.turns) ? result.turns as OpenCodexTurn[] : [],
    hasMoreOlderMessages: result.hasMoreOlderMessages === true
  };
}

/**
 * Finds the first turn index whose content changed between two snapshots.
 *
 * @param currentTurns Current turn collection.
 * @param nextTurns Next turn collection.
 *
 * @returns Numeric value, or `null` when unavailable.
 */
function findFirstChangedTurnIndex(
  currentTurns: OpenCodexTurn[],
  nextTurns: OpenCodexTurn[]
): number | null {
  const sharedLength = Math.min(currentTurns.length, nextTurns.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const currentTurn = currentTurns[index];
    const nextTurn = nextTurns[index];

    if (currentTurn === undefined || nextTurn === undefined) {
      return index;
    }

    if (currentTurn.id !== nextTurn.id || getTurnSignature(currentTurn) !== getTurnSignature(nextTurn)) {
      return index;
    }
  }

  if (currentTurns.length !== nextTurns.length) {
    return sharedLength;
  }

  return null;
}

/**
 * Returns turn signature.
 *
 * @param turn Turn payload to process.
 *
 * @returns Computed string value.
 */
function getTurnSignature(turn: OpenCodexTurn): string {
  return JSON.stringify(turn);
}

/**
 * Checks whether the active turn is still running from the UI perspective.
 *
 * @param turns Turn collection to process.
 * @param activeTurnId Active turn identifier.
 *
 * @returns `true` when the condition is met.
 */
function hasActiveRunningTurn(turns: OpenCodexTurn[], activeTurnId: string | null): boolean {
  if (activeTurnId === null) {
    return false;
  }

  const turn = turns.find((entry) => entry.id === activeTurnId);

  if (turn === undefined || turn.status === "completed") {
    return false;
  }

  return !turn.items.some((item) => item.role === "assistant" && item.phase === "final_answer");
}

/**
 * Maps a UI message into the turn-item representation used by the store.
 *
 * @param message Human-readable message.
 *
 * @returns Computed value.
 */
function toTurnItem(message: OpenCodexMessage): OpenCodexTurnItem {
  const item: OpenCodexTurnItem = {
    id: message.itemId ?? message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    createdAt: message.createdAt
  };

  if (message.phase !== undefined) {
    item.phase = message.phase;
  }

  if (message.kind !== undefined) {
    item.kind = message.kind;
  }

  if (message.summary !== undefined) {
    item.summary = message.summary;
  }

  if (message.details !== undefined) {
    item.details = message.details;
  }

  return item;
}

/**
 * Maps an activity status to the message status used by turn items.
 *
 * @param status Status value to normalize.
 *
 * @returns Computed value.
 */
function toMessageStatus(status: OpenCodexActivity["status"]): OpenCodexTurnItem["status"] {
  if (status === "running") {
    return "streaming";
  }

  return status;
}

/**
 * Creates a client-side project entry when the cache has not emitted one yet.
 *
 * @param projectPath Project path.
 * @param projectName Optional display name from thread metadata.
 *
 * @returns Project payload.
 */
function createClientProject(projectPath: string, projectName: string | null): OpenCodexProject {
  const now = new Date().toISOString();
  const safePath = projectPath.trim().length > 0 ? projectPath.trim() : "unknown";
  const defaultName = projectName ?? readProjectName(safePath);

  return {
    id: `client:${safePath}`,
    path: safePath,
    defaultName,
    displayName: null,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    editedAt: now
  };
}

/**
 * Derives a display name from a project path.
 *
 * @param projectPath Project path.
 *
 * @returns Project name.
 */
function readProjectName(projectPath: string): string {
  const segments = projectPath.split(/[\\/]/).filter((segment) => segment.length > 0);
  return segments.at(-1) ?? projectPath;
}
