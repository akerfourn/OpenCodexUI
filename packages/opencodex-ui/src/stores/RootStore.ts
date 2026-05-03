/**
 * Implements the MobX store that drives thread, turn, and approval state in the UI.
 */
import { makeAutoObservable, runInAction } from "mobx";
import Fuse from "fuse.js";

import type {
  OpenCodexApproval,
  OpenCodexActivity,
  OpenCodexClientTransport,
  OpenCodexEvent,
  OpenCodexLanguage,
  OpenCodexMessage,
  OpenCodexMessagePhase,
  OpenCodexReasoningEffort,
  OpenCodexSettings,
  OpenCodexThread,
  OpenCodexThreadScope,
  OpenCodexTurn,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";
import { applyOpenCodexLanguage } from "../i18n/i18n";

/**
 * Coordinates the observable UI state for threads, turns, approvals, and settings.
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
  projectPath: string | null = null;
  threads: OpenCodexThread[] = [];
  currentThread: OpenCodexThread | null = null;
  turns: OpenCodexTurn[] = [];
  activity: string[] = [];
  approvals: OpenCodexApproval[] = [];
  models: string[] = [];
  selectedModel: string | null = null;
  reasoningEffort: OpenCodexReasoningEffort = "medium";
  scope: OpenCodexThreadScope = "currentProject";
  searchTerm = "";
  errorMessage: string | null = null;
  connectionStatus = "stopped";
  isBootstrapping = false;
  isLoadingThreads = false;
  isCreatingThread = false;
  isStartingTurn = false;
  isLoadingOlderMessages = false;
  isSyncingCurrentThread = false;
  hasMoreOlderMessages = false;
  olderMessagesPrependVersion = 0;
  scrollToBottomVersion = 0;
  isWorking = false;
  isRefreshingThread = false;
  isRecoveringThread = false;
  loadingThreadId: string | null = null;
  activeTurnId: string | null = null;
  pendingTurnId: string | null = null;
  pendingProjectTrustRequest: { projectPath: string; disabledFolders: string[] } | null = null;
  currentProjectFilterAvailable = true;
  private threadSelectionStartedAt: number | null = null;

  /**
   * Creates a new root store instance.
   *
   * @param transport Transport implementation used to communicate with the backend.
   */
  constructor(private readonly transport: OpenCodexClientTransport) {
    makeAutoObservable(this);
    this.transport.onEvent((event) => this.handleEvent(event));
  }

  /**
   * Returns the threads matching the current search term.
   *
   * @returns Filtered thread list for the current search term.
   */
  get filteredThreads(): OpenCodexThread[] {
    const searchTerm = this.searchTerm.trim();

    if (searchTerm.length === 0) {
      return this.threads;
    }

    const fuse = new Fuse(this.threads, {
      ignoreLocation: true,
      keys: ["title", "preview", "projectName", "projectPath"],
      threshold: 0.35
    });
    const matchingThreadIds = new Set(
      fuse.search(searchTerm).map((result) => result.item.id)
    );

    return this.threads.filter((thread) => matchingThreadIds.has(thread.id));
  }

  /**
   * Returns the model options exposed by the UI.
   *
   * @returns Model list exposed by the UI.
   */
  get modelOptions(): string[] {
    const options = [...this.models];

    if (this.selectedModel !== null && !options.includes(this.selectedModel)) {
      options.unshift(this.selectedModel);
    }

    return options;
  }

  /**
   * Bootstraps the store by requesting the initial backend state.
   *
   * @returns Promise resolved when the operation completes.
   */
  async bootstrap(): Promise<void> {
    this.isBootstrapping = true;
    this.isLoadingThreads = true;

    try {
      await this.transport.request({ type: "app.bootstrap" });
    } catch {
      this.isBootstrapping = false;
      this.isLoadingThreads = false;
    }
  }

  /**
   * Applies a backend event to the observable UI state.
   *
   * @param event Event payload to apply or inspect.
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
        this.projectPath = event.projectPath;
        this.selectedModel = event.settings.defaultModel;
        this.reasoningEffort = event.settings.defaultReasoningEffort ?? "medium";
        return;
      case "threads.updated":
        this.isBootstrapping = false;
        this.isLoadingThreads = false;
        this.threads = event.threads.map((thread) => this.mergeThreadMetadata(thread));
        this.currentProjectFilterAvailable = event.currentProjectFilterAvailable;
        logThreadsForDebug(this.threads, this.scope, this.searchTerm);
        return;
      case "thread.opened":
      case "thread.created":
        const openedThread = this.mergeThreadMetadata(event.thread);
        const previousThreadId = this.currentThread?.id ?? null;
        const shouldMergeTurns = previousThreadId === openedThread.id;
        this.isCreatingThread = false;
        this.isRefreshingThread = false;
        this.isLoadingOlderMessages = false;
        this.isSyncingCurrentThread = false;
        this.loadingThreadId = null;
        this.currentThread = openedThread;
        this.upsertThread(openedThread);
        this.applyThreadTurns(
          openedThread.id,
          event.turns,
          shouldMergeTurns ? "merge" : "replace",
          event.type
        );
        this.pendingTurnId = null;
        this.activity = [];
        this.errorMessage = null;
        this.hasMoreOlderMessages = event.type === "thread.opened"
          ? event.hasMoreOlderMessages ?? false
          : false;
        this.scrollToBottomVersion += 1;
        if (openedThread.model !== null) {
          this.selectedModel = openedThread.model;
        }
        if (openedThread.reasoningEffort !== null) {
          this.reasoningEffort = openedThread.reasoningEffort;
        }
        return;
      case "thread.metadata.updated":
        const updatedThread = this.mergeThreadMetadata(event.thread);
        this.upsertThread(updatedThread);
        if (this.currentThread?.id === updatedThread.id) {
          this.currentThread = updatedThread;
          if (updatedThread.model !== null) {
            this.selectedModel = updatedThread.model;
          }
          if (updatedThread.reasoningEffort !== null) {
            this.reasoningEffort = updatedThread.reasoningEffort;
          }
        }
        return;
      case "thread.turns.prepended":
        if (this.currentThread?.id !== event.threadId) {
          return;
        }
        this.isLoadingOlderMessages = false;
        this.hasMoreOlderMessages = event.hasMoreOlderMessages;
        this.turns = [...event.turns, ...this.turns];
        this.olderMessagesPrependVersion += 1;
        return;
      case "thread.turns.synced":
        if (this.currentThread?.id !== event.threadId) {
          return;
        }
        this.applyThreadTurns(event.threadId, event.turns, "merge", "thread.turns.synced");
        this.hasMoreOlderMessages = event.hasMoreOlderMessages;
        return;
      case "thread.sync.started":
        if (this.currentThread?.id === event.threadId) {
          this.isSyncingCurrentThread = true;
        }
        return;
      case "thread.sync.completed":
        if (this.currentThread?.id === event.threadId) {
          this.isSyncingCurrentThread = false;
          this.isRefreshingThread = false;
        }
        return;
      case "thread.recovery.started":
        if (this.currentThread?.id === event.threadId) {
          this.isRecoveringThread = true;
          this.isSyncingCurrentThread = true;
          this.isRefreshingThread = false;
          this.loadingThreadId = null;
        }
        return;
      case "thread.recovery.completed":
        if (this.currentThread?.id === event.threadId) {
          const hasRecoveredRunningTurn = hasActiveRunningTurn(this.turns, this.activeTurnId);
          this.isRecoveringThread = false;
          this.isSyncingCurrentThread = false;
          this.isRefreshingThread = false;
          this.isWorking = hasRecoveredRunningTurn;
          if (!hasRecoveredRunningTurn) {
            this.activeTurnId = null;
            this.pendingTurnId = null;
          }
        }
        return;
      case "thread.renamed":
        this.applyThreadRename(event.threadId, event.name);
        return;
      case "message.started":
        this.isStartingTurn = false;
        this.currentThread = this.currentThread ?? this.findThread(event.threadId);
        this.upsertPendingUserTurn(event.threadId, event.message);
        this.scrollToBottomVersion += 1;
        return;
      case "message.delta":
        this.appendAssistantDelta(event.threadId, event.turnId, event.messageId, event.delta, event.phase ?? null);
        return;
      case "activity.updated":
        if (this.settings.showActivityPanel && event.activity.content?.trim()) {
          this.activity.push(event.activity.content);
        }
        this.appendActivityItem(event.threadId, event.activity);
        return;
      case "turn.started":
        this.isStartingTurn = false;
        this.isWorking = true;
        this.activeTurnId = event.turnId;
        this.movePendingTurnToStartedTurn(event.threadId, event.turnId);
        return;
      case "turn.completed":
        this.isWorking = false;
        this.activeTurnId = null;
        this.pendingTurnId = null;
        this.applyTurnDuration(event.turnId, event.durationMs);
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
        this.errorMessage = event.details === undefined
          ? event.message
          : `${event.message}\n${JSON.stringify(event.details, null, 2)}`;
        if (event.recoverable && event.threadId !== undefined && this.currentThread?.id === event.threadId) {
          this.isBootstrapping = false;
          this.isLoadingThreads = false;
          this.isCreatingThread = false;
          this.isStartingTurn = false;
          this.isLoadingOlderMessages = false;
          this.isSyncingCurrentThread = true;
          this.isRecoveringThread = true;
          this.isRefreshingThread = false;
          this.loadingThreadId = null;
          this.isWorking = true;
          return;
        }
        this.isBootstrapping = false;
        this.isLoadingThreads = false;
        this.isCreatingThread = false;
        this.isStartingTurn = false;
        this.isLoadingOlderMessages = false;
        this.isSyncingCurrentThread = false;
        this.isRecoveringThread = false;
        this.isWorking = false;
        this.isRefreshingThread = false;
        this.loadingThreadId = null;
        return;
    }
  }

  /**
   * Refreshes the thread list for the current scope and search term.
   *
   * @returns Nothing.
   */
  refreshThreads(): void {
    this.isLoadingThreads = true;

    console.info("[OpenCodexUI] threads.list request", {
      scope: this.scope,
      searchTerm: this.searchTerm
    });

    void this.transport.request({
      type: "threads.list",
      scope: this.scope,
      searchTerm: this.searchTerm
    });
  }

  /**
   * Opens a thread, preferring cached turns before refreshing from Codex.
   *
   * @param threadId Thread identifier.
   *
   * @returns Nothing.
   */
  openThread(threadId: string): void {
    if (this.loadingThreadId === threadId) {
      return;
    }

    console.info("[OpenCodexUI timing] thread selected", {
      timestamp: new Date().toISOString(),
      threadId
    });
    this.threadSelectionStartedAt = Date.now();

    const isChangingThread = this.currentThread?.id !== threadId;
    this.errorMessage = null;

    if (isChangingThread) {
      this.loadingThreadId = threadId;
      this.currentThread = this.findThread(threadId) ?? this.currentThread;
      this.turns = [];
      this.pendingTurnId = null;
      this.activity = [];
      this.hasMoreOlderMessages = false;
    } else {
      this.isSyncingCurrentThread = true;
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

    this.isRefreshingThread = true;
    this.openThread(currentThread.id);
  }

  /**
   * Checks whether the current thread can be refreshed.
   *
   * @returns `true` when the condition is met.
   */
  canRefreshCurrentThread(): boolean {
    return (
      this.currentThread !== null &&
      !this.isRefreshingThread &&
      !this.isWorking &&
      !this.isStartingTurn &&
      !this.isRecoveringThread
    );
  }

  /**
   * Requests recovery for the currently opened thread.
   *
   * @returns Nothing.
   */
  recoverCurrentThread(): void {
    if (this.currentThread === null || this.isRecoveringThread) {
      return;
    }

    this.isRecoveringThread = true;
    this.isSyncingCurrentThread = true;
    void this.transport.request({
      type: "threads.recover",
      threadId: this.currentThread.id
    });
  }

  /**
   * Creates a new empty thread and persists it in the cache index.
   *
   * @returns Nothing.
   */
  createThread(): void {
    this.isCreatingThread = true;
    this.loadingThreadId = null;
    this.currentThread = null;
    this.turns = [];
    this.pendingTurnId = null;
    this.activity = [];
    this.hasMoreOlderMessages = false;
    this.isSyncingCurrentThread = false;
    void this.transport.request({ type: "threads.create" });
  }

  /**
   * Requests older messages for the current thread.
   *
   * @returns Nothing.
   */
  loadOlderMessages(): void {
    if (
      this.currentThread === null ||
      this.isLoadingOlderMessages ||
      !this.hasMoreOlderMessages ||
      this.loadingThreadId !== null
    ) {
      return;
    }

    this.isLoadingOlderMessages = true;
    void this.transport.request({
      type: "threads.loadOlder",
      threadId: this.currentThread.id
    }).then((response) => {
      const result = readLoadOlderResult(response);

      if (result.turns.length === 0) {
        runInAction(() => {
          this.isLoadingOlderMessages = false;
          this.hasMoreOlderMessages = result.hasMoreOlderMessages;
        });
      }
    }).catch(() => {
      runInAction(() => {
        this.isLoadingOlderMessages = false;
      });
    });
  }

  /**
   * Sends a user message and creates an optimistic pending turn.
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

    if (trimmedText.length === 0 || this.isWorking || this.isStartingTurn) {
      return;
    }

    this.isStartingTurn = true;
    this.createOptimisticUserTurn(trimmedText);

    void this.transport.request({
      type: "turn.start",
      threadId: this.currentThread?.id ?? null,
      text: trimmedText,
      model,
      reasoningEffort
    });
  }

  /**
   * Sets the selected model in the UI state.
   *
   * @param value Value to normalize.
   *
   * @returns Nothing.
   */
  setSelectedModel(value: string | null): void {
    this.selectedModel = value;
  }

  /**
   * Sets the selected reasoning effort in the UI state.
   *
   * @param value Value to normalize.
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
    if (this.currentThread === null || this.activeTurnId === null) {
      return;
    }

    void this.transport.request({
      type: "turn.interrupt",
      threadId: this.currentThread.id,
      turnId: this.activeTurnId
    });
  }

  /**
   * Renames the currently opened thread.
   *
   * @param name Name value to persist.
   *
   * @returns Nothing.
   */
  renameCurrentThread(name: string): void {
    if (this.currentThread === null) {
      return;
    }

    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      return;
    }

    const threadId = this.currentThread.id;
    this.applyThreadRename(threadId, trimmedName);

    void this.transport.request({
      type: "threads.rename",
      threadId,
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

    void this.transport.request({ type: "system.openLink", href: trimmedHref });
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
   * Sets scope.
   *
   * @param scope Requested thread scope.
   *
   * @returns Nothing.
   */
  setScope(scope: OpenCodexThreadScope): void {
    this.scope = scope;
    this.refreshThreads();
  }

  /**
   * Sets search term.
   *
   * @param value Value to normalize.
   *
   * @returns Nothing.
   */
  setSearchTerm(value: string): void {
    this.searchTerm = value;
  }

  /**
   * Appends streamed assistant text to the active turn.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   * @param itemId Item identifier.
   * @param delta Incremental thread update.
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
    if (this.currentThread?.id !== threadId) {
      return;
    }

    const turn = this.findOrCreateTurn(threadId, turnId);
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
   * Applies the completed duration to a stored turn.
   *
   * @param turnId Turn identifier.
   * @param durationMs Duration ms.
   *
   * @returns Nothing.
   */
  private applyTurnDuration(turnId: string, durationMs: number | null): void {
    if (durationMs === null) {
      return;
    }

    const turn = this.turns.find((entry) => entry.id === turnId);

    if (turn !== undefined) {
      turn.durationMs = durationMs;
    }
  }

  /**
   * Appends an activity item to the active turn.
   *
   * @param threadId Thread identifier.
   * @param activity Activity payload.
   *
   * @returns Nothing.
   */
  private appendActivityItem(threadId: string, activity: OpenCodexActivity): void {
    if (this.currentThread?.id !== threadId || activity.content === undefined) {
      return;
    }

    const turnId = activity.title ?? this.activeTurnId ?? this.pendingTurnId;

    if (turnId === null || turnId.length === 0) {
      return;
    }

    const turn = this.findOrCreateTurn(threadId, turnId);
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
   * Applies a thread rename to the store state.
   *
   * @param threadId Thread identifier.
   * @param name Name value to persist.
   *
   * @returns Nothing.
   */
  private applyThreadRename(threadId: string, name: string): void {
    this.threads = this.threads.map((thread) => (
      thread.id === threadId ? { ...thread, customTitle: name, title: name } : thread
    ));

    if (this.currentThread?.id === threadId) {
      this.currentThread = { ...this.currentThread, customTitle: name, title: name };
    }
  }

  /**
   * Inserts or updates a thread in the store state.
   *
   * @param thread Thread payload to process.
   *
   * @returns Nothing.
   */
  private upsertThread(thread: OpenCodexThread): void {
    const mergedThread = this.mergeThreadMetadata(thread);
    const existingThread = this.findThread(thread.id);

    if (existingThread === null) {
      this.threads = [mergedThread, ...this.threads];
      return;
    }

    this.threads = this.threads.map((entry) => (
      entry.id === thread.id ? mergedThread : entry
    ));
  }

  /**
   * Merges incoming thread metadata with the existing store state.
   *
   * @param thread Thread payload to process.
   *
   * @returns Computed value.
   */
  private mergeThreadMetadata(thread: OpenCodexThread): OpenCodexThread {
    const existingThread = this.findThread(thread.id) ?? this.currentThread;

    if (existingThread === null || existingThread.id !== thread.id) {
      return thread;
    }

    if (thread.customTitle !== null && thread.customTitle.trim().length > 0) {
      return thread;
    }

    return {
      ...thread,
      customTitle: existingThread.customTitle,
      title: resolveThreadTitle(thread.codexTitle, existingThread.customTitle, thread.preview)
    };
  }

  /**
   * Finds a thread by identifier in the store state.
   *
   * @param threadId Thread identifier.
   *
   * @returns Computed value.
   */
  private findThread(threadId: string): OpenCodexThread | null {
    return this.threads.find((thread) => thread.id === threadId) ?? null;
  }

  /**
   * Applies a turn snapshot to the store using the requested merge strategy.
   *
   * @param threadId Thread identifier.
   * @param nextTurns Next turn collection.
   * @param strategy Strategy.
   * @param source Source label used for logging.
   *
   * @returns Nothing.
   */
  private applyThreadTurns(
    threadId: string,
    nextTurns: OpenCodexTurn[],
    strategy: "replace" | "merge",
    source: string
  ): void {
    if (strategy === "replace" || this.turns.length === 0) {
      this.turns = nextTurns;
      this.logStorePopulation(threadId, source, nextTurns.length, true, 0);
      return;
    }

    const firstChangedIndex = findFirstChangedTurnIndex(this.turns, nextTurns);

    if (firstChangedIndex === null) {
      this.logStorePopulation(threadId, source, nextTurns.length, false, null);
      return;
    }

    this.turns = [
      ...this.turns.slice(0, firstChangedIndex),
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
   * Associates the pending optimistic user turn with a backend thread.
   *
   * @param threadId Thread identifier.
   * @param message Human-readable message.
   *
   * @returns Nothing.
   */
  private upsertPendingUserTurn(threadId: string, message: OpenCodexMessage): void {
    const existingTurn = this.findPendingUserTurn(message.content);

    if (existingTurn !== null) {
      existingTurn.threadId = threadId;
      return;
    }

    const turn = this.findOrCreateTurn(threadId, `pending:${message.id}`);
    turn.items.push(toTurnItem(message));
    this.pendingTurnId = turn.id;
  }

  /**
   * Moves the optimistic pending turn to the started backend turn.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   *
   * @returns Nothing.
   */
  private movePendingTurnToStartedTurn(threadId: string, turnId: string): void {
    const pendingTurn = this.findPendingTurn();
    const existingTurn = this.turns.find((turn) => turn.id === turnId);

    if (pendingTurn === undefined) {
      this.findOrCreateTurn(threadId, turnId);
      return;
    }

    if (existingTurn !== undefined) {
      existingTurn.items = [...pendingTurn.items, ...existingTurn.items];
      this.turns = this.turns.filter((turn) => turn !== pendingTurn);
      return;
    }

    pendingTurn.id = turnId;
    pendingTurn.threadId = threadId;
    pendingTurn.status = "running";
    pendingTurn.startedAt = pendingTurn.startedAt ?? new Date().toISOString();
    this.pendingTurnId = null;
  }

  /**
   * Finds an existing turn or creates it in the store.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   *
   * @returns Computed value.
   */
  private findOrCreateTurn(threadId: string, turnId: string): OpenCodexTurn {
    const existing = this.turns.find((turn) => turn.id === turnId);

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

    this.turns.push(created);
    return created;
  }

  /**
   * Creates an optimistic pending user turn in the UI.
   *
   * @param content Text content to process.
   *
   * @returns Nothing.
   */
  private createOptimisticUserTurn(content: string): void {
    const threadId = this.currentThread?.id ?? "pending-thread";
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

    this.pendingTurnId = turnId;
    this.turns.push(created);
    this.scrollToBottomVersion += 1;
  }

  /**
   * Finds the current pending turn.
   *
   * @returns Computed value.
   */
  private findPendingTurn(): OpenCodexTurn | undefined {
    if (this.pendingTurnId !== null) {
      return this.turns.find((turn) => turn.id === this.pendingTurnId);
    }

    return this.turns.find((turn) => turn.id.startsWith("pending:"));
  }

  /**
   * Finds the pending user turn matching the provided content.
   *
   * @param content Text content to process.
   *
   * @returns Computed value.
   */
  private findPendingUserTurn(content: string): OpenCodexTurn | null {
    const pendingTurn = this.findPendingTurn();

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
 * @param scope Requested thread scope.
 * @param searchTerm Optional search term.
 *
 * @returns Nothing.
 */
function logThreadsForDebug(
  threads: OpenCodexThread[],
  scope: OpenCodexThreadScope,
  searchTerm: string
): void {
  console.info("[OpenCodexUI] threads.updated", {
    count: threads.length,
    scope,
    searchTerm,
    projects: Array.from(new Set(threads.map((thread) => thread.projectPath ?? "<sans projet>"))).sort()
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
 * Resolves thread title.
 *
 * @param codexTitle Codex title.
 * @param customTitle Custom title.
 * @param preview Preview.
 *
 * @returns Computed string value.
 */
function resolveThreadTitle(
  codexTitle: string,
  customTitle: string | null,
  preview: string
): string {
  const trimmedCustomTitle = customTitle?.trim() ?? "";
  const trimmedCodexTitle = codexTitle.trim();

  if (trimmedCustomTitle.length > 0) {
    return trimmedCustomTitle;
  }

  if (trimmedCodexTitle.length > 0) {
    return trimmedCodexTitle;
  }

  return preview;
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
