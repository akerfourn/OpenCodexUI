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
  loadingThreadId: string | null = null;
  activeTurnId: string | null = null;
  pendingTurnId: string | null = null;
  pendingProjectTrustRequest: { projectPath: string; disabledFolders: string[] } | null = null;
  currentProjectFilterAvailable = true;
  private threadSelectionStartedAt: number | null = null;

  constructor(private readonly transport: OpenCodexClientTransport) {
    makeAutoObservable(this);
    this.transport.onEvent((event) => this.handleEvent(event));
  }

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

  get modelOptions(): string[] {
    const options = [...this.models];

    if (this.selectedModel !== null && !options.includes(this.selectedModel)) {
      options.unshift(this.selectedModel);
    }

    return options;
  }

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
        this.isBootstrapping = false;
        this.isLoadingThreads = false;
        this.isCreatingThread = false;
        this.isStartingTurn = false;
        this.isLoadingOlderMessages = false;
        this.isSyncingCurrentThread = false;
        this.isWorking = false;
        this.isRefreshingThread = false;
        this.loadingThreadId = null;
        return;
    }
  }

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

  refreshCurrentThread(): void {
    if (this.currentThread === null || this.isRefreshingThread) {
      return;
    }

    this.isRefreshingThread = true;
    this.openThread(this.currentThread.id);
  }

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

  setSelectedModel(value: string | null): void {
    this.selectedModel = value;
  }

  setReasoningEffort(value: OpenCodexReasoningEffort): void {
    this.reasoningEffort = value;
  }

  setLanguage(language: OpenCodexLanguage): void {
    this.settings = { ...this.settings, language };
    applyOpenCodexLanguage(language);
    void this.transport.request({
      type: "settings.update",
      patch: { language }
    });
  }

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

  openExternalLink(href: string): void {
    const trimmedHref = href.trim();

    if (trimmedHref.length === 0) {
      return;
    }

    void this.transport.request({ type: "system.openLink", href: trimmedHref });
  }

  resolveApproval(approvalId: string, decision: OpenCodexApproval["choices"][number]): void {
    void this.transport.request({ type: "approval.respond", approvalId, decision });
  }

  trustProject(projectPath: string): void {
    void this.transport.request({ type: "project.trust", projectPath });
  }

  dismissProjectTrustRequest(projectPath: string): void {
    this.pendingProjectTrustRequest = null;
    void this.transport.request({ type: "project.trust.dismiss", projectPath });
  }

  setScope(scope: OpenCodexThreadScope): void {
    this.scope = scope;
    this.refreshThreads();
  }

  setSearchTerm(value: string): void {
    this.searchTerm = value;
  }

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

  private applyTurnDuration(turnId: string, durationMs: number | null): void {
    if (durationMs === null) {
      return;
    }

    const turn = this.turns.find((entry) => entry.id === turnId);

    if (turn !== undefined) {
      turn.durationMs = durationMs;
    }
  }

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

  private applyThreadRename(threadId: string, name: string): void {
    this.threads = this.threads.map((thread) => (
      thread.id === threadId ? { ...thread, customTitle: name, title: name } : thread
    ));

    if (this.currentThread?.id === threadId) {
      this.currentThread = { ...this.currentThread, customTitle: name, title: name };
    }
  }

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

  private findThread(threadId: string): OpenCodexThread | null {
    return this.threads.find((thread) => thread.id === threadId) ?? null;
  }

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

  private findPendingTurn(): OpenCodexTurn | undefined {
    if (this.pendingTurnId !== null) {
      return this.turns.find((turn) => turn.id === this.pendingTurnId);
    }

    return this.turns.find((turn) => turn.id.startsWith("pending:"));
  }

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

function getTurnSignature(turn: OpenCodexTurn): string {
  return JSON.stringify(turn);
}

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

function toMessageStatus(status: OpenCodexActivity["status"]): OpenCodexTurnItem["status"] {
  if (status === "running") {
    return "streaming";
  }

  return status;
}
