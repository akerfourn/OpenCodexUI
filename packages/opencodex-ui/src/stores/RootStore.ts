import { makeAutoObservable } from "mobx";
import Fuse from "fuse.js";

import type {
  OpenCodexApproval,
  OpenCodexClientTransport,
  OpenCodexEvent,
  OpenCodexMessage,
  OpenCodexMessagePhase,
  OpenCodexReasoningEffort,
  OpenCodexSettings,
  OpenCodexThread,
  OpenCodexThreadScope
} from "@open-codex-ui/opencodex-protocol";

export class RootStore {
  settings: OpenCodexSettings = {
    codexCommand: "codex",
    defaultModel: null,
    defaultReasoningEffort: "medium",
    showActivityPanel: true,
    experimentalApi: true
  };
  projectPath: string | null = null;
  threads: OpenCodexThread[] = [];
  currentThread: OpenCodexThread | null = null;
  messages: OpenCodexMessage[] = [];
  activity: string[] = [];
  approvals: OpenCodexApproval[] = [];
  models: string[] = [];
  selectedModel: string | null = null;
  reasoningEffort: OpenCodexReasoningEffort = "medium";
  scope: OpenCodexThreadScope = "currentProject";
  searchTerm = "";
  errorMessage: string | null = null;
  connectionStatus = "stopped";
  isWorking = false;
  isRefreshingThread = false;
  activeTurnId: string | null = null;
  currentProjectFilterAvailable = true;

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
    await this.transport.request({ type: "app.bootstrap" });
  }

  handleEvent(event: OpenCodexEvent): void {
    switch (event.type) {
      case "connection.status":
        this.connectionStatus = event.status;
        return;
      case "app.bootstrap":
        this.settings = event.settings;
        this.projectPath = event.projectPath;
        this.selectedModel = event.settings.defaultModel;
        this.reasoningEffort = event.settings.defaultReasoningEffort ?? "medium";
        return;
      case "threads.updated":
        this.threads = event.threads;
        this.currentProjectFilterAvailable = event.currentProjectFilterAvailable;
        logThreadsForDebug(event.threads, this.scope, this.searchTerm);
        return;
      case "thread.opened":
      case "thread.created":
        this.isRefreshingThread = false;
        this.currentThread = event.thread;
        this.messages = event.messages;
        this.activity = [];
        this.errorMessage = null;
        if (event.thread.model !== null) {
          this.selectedModel = event.thread.model;
        }
        if (event.thread.reasoningEffort !== null) {
          this.reasoningEffort = event.thread.reasoningEffort;
        }
        return;
      case "thread.renamed":
        this.applyThreadRename(event.threadId, event.name);
        return;
      case "message.started":
        this.currentThread = this.currentThread ?? this.findThread(event.threadId);
        this.messages.push(event.message);
        return;
      case "message.delta":
        this.appendAssistantDelta(event.threadId, event.turnId, event.messageId, event.delta, event.phase ?? null);
        return;
      case "activity.updated":
        if (this.settings.showActivityPanel && event.activity.content?.trim()) {
          this.activity.push(event.activity.content);
        }
        return;
      case "turn.started":
        this.isWorking = true;
        this.activeTurnId = event.turnId;
        return;
      case "turn.completed":
        this.isWorking = false;
        this.activeTurnId = null;
        return;
      case "approval.requested":
        this.approvals.push(event.approval);
        return;
      case "approval.resolved":
        this.approvals = this.approvals.filter((approval) => approval.id !== event.approvalId);
        return;
      case "models.updated":
        this.models = event.models;
        this.selectedModel = this.selectedModel ?? event.models[0] ?? null;
        return;
      case "error":
        this.errorMessage = event.details === undefined
          ? event.message
          : `${event.message}\n${JSON.stringify(event.details, null, 2)}`;
        this.isWorking = false;
        this.isRefreshingThread = false;
        return;
    }
  }

  refreshThreads(): void {
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
    void this.transport.request({ type: "threads.create" });
  }

  sendMessage(
    text: string,
    model: string | null = this.selectedModel,
    reasoningEffort: OpenCodexReasoningEffort = this.reasoningEffort
  ): void {
    const trimmedText = text.trim();

    if (trimmedText.length === 0 || this.isWorking) {
      return;
    }

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

    void this.transport.request({
      type: "threads.rename",
      threadId: this.currentThread.id,
      name
    });
  }

  resolveApproval(approvalId: string, decision: OpenCodexApproval["choices"][number]): void {
    void this.transport.request({ type: "approval.respond", approvalId, decision });
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

    const existing = this.messages.find((message) => message.itemId === itemId);

    if (existing !== undefined) {
      existing.content += delta;
      if (existing.phase === undefined || existing.phase === null) {
        existing.phase = phase;
      }
      return;
    }

    this.messages.push({
      id: itemId,
      threadId,
      role: "assistant",
      content: delta,
      status: "streaming",
      createdAt: new Date().toISOString(),
      turnId,
      itemId,
      phase
    });
  }

  private applyThreadRename(threadId: string, name: string): void {
    this.threads = this.threads.map((thread) => (
      thread.id === threadId ? { ...thread, title: name } : thread
    ));

    if (this.currentThread?.id === threadId) {
      this.currentThread = { ...this.currentThread, title: name };
    }
  }

  private findThread(threadId: string): OpenCodexThread | null {
    return this.threads.find((thread) => thread.id === threadId) ?? null;
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
