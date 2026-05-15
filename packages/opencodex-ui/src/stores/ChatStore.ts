/**
 * Holds the observable UI state for one chat loaded in memory.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexActivity,
  OpenCodexApproval,
  OpenCodexImageAttachment,
  OpenCodexMessage,
  OpenCodexMessagePhase,
  OpenCodexReasoningEffort,
  OpenCodexThread,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "./RootStore";
import {
  appendActivityItem,
  applyThreadTurns,
  applyTurnDuration,
  findOrCreateTurn,
  movePendingTurnToStartedTurn,
  upsertPendingUserTurn
} from "./chatTurnMutations";
import {
  hasActiveRunningTurn
} from "./chatTurnUtils";

/**
 * Stores the loaded turns and runtime flags for a single chat.
 */
export class ChatStore {
  thread: OpenCodexThread;
  turns: OpenCodexTurn[] = [];
  approvals: OpenCodexApproval[] = [];
  hasMoreOlderMessages = false;
  isLoadingOlderMessages = false;
  isSyncing = false;
  isRefreshing = false;
  isRecovering = false;
  isWorking = false;
  isStartingTurn = false;
  isEditingLastTurn = false;
  hasUnseenCompletedTurn = false;
  activeTurnId: string | null = null;
  pendingTurnId: string | null = null;
  olderMessagesPrependVersion = 0;
  scrollToBottomVersion = 0;

  /**
   * Creates a chat store for the provided thread.
   *
   * @param thread Thread metadata used by the chat.
   */
  constructor(
    thread: OpenCodexThread,
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    this.thread = thread;
    makeAutoObservable<ChatStore, "projectStore" | "root">(this, {
      projectStore: false,
      root: false
    });
  }

  get canRefresh(): boolean {
    return (
      !this.projectStore.isOrphan &&
      !this.isRefreshing &&
      !this.isWorking &&
      !this.isStartingTurn &&
      !this.isEditingLastTurn &&
      !this.isRecovering
    );
  }

  /**
   * Returns whether the chat should show a running-work indicator.
   *
   * @returns `true` when a turn is currently active or starting.
   */
  get hasRunningTurnIndicator(): boolean {
    return (
      this.isWorking ||
      this.isStartingTurn ||
      this.isEditingLastTurn ||
      this.isRecovering
    );
  }

  /**
   * Returns whether the chat has completed work that the user has not opened.
   *
   * @returns `true` when unseen completed work should be highlighted.
   */
  get hasUnseenTurnIndicator(): boolean {
    return this.hasUnseenCompletedTurn && !this.hasRunningTurnIndicator;
  }

  get canSteerActiveTurn(): boolean {
    const sourceId = this.thread.sourceId ?? this.projectStore.project.sourceId;

    return (
      this.root.appStore.settings.allowTurnSteering &&
      this.isWorking &&
      this.activeTurnId !== null &&
      sourceId !== null &&
      !this.projectStore.isOrphan &&
      !this.isStartingTurn &&
      !this.isEditingLastTurn &&
      !this.isRecovering
    );
  }

  get editableLastUserItem(): {
    turnId: string;
    itemId: string;
    content: string;
    attachments: OpenCodexImageAttachment[];
  } | null {
    if (
      this.projectStore.isOrphan ||
      this.isWorking ||
      this.isStartingTurn ||
      this.isEditingLastTurn ||
      this.isRecovering ||
      this.turns.length === 0
    ) {
      return null;
    }

    const lastTurn = this.turns.at(-1);

    if (lastTurn === undefined || lastTurn.id.startsWith("pending:")) {
      return null;
    }

    const userItems = lastTurn.items.filter((item) => item.role === "user");

    if (userItems.length !== 1) {
      return null;
    }

    const userItem = userItems[0];

    if (userItem === undefined || userItem.kind === "steer") {
      return null;
    }

    return {
      turnId: lastTurn.id,
      itemId: userItem.id,
      content: userItem.content,
      attachments: userItem.attachments ?? []
    };
  }

  /**
   * Returns the approval currently pending for this chat.
   *
   * @returns Active approval, or `null` when none is pending.
   */
  get currentApproval(): OpenCodexApproval | null {
    return this.approvals[0] ?? null;
  }

  /**
   * Updates the chat metadata while preserving loaded turns.
   *
   * @param thread Thread metadata to apply.
   *
   * @returns Nothing.
   */
  setThread(thread: OpenCodexThread): void {
    this.thread = thread;
  }

  /**
   * Resets the transient chat state before loading a different snapshot.
   *
   * @returns Nothing.
   */
  clearLoadedState(): void {
    this.turns = [];
    this.pendingTurnId = null;
    this.hasUnseenCompletedTurn = false;
    this.hasMoreOlderMessages = false;
    this.isLoadingOlderMessages = false;
    this.isSyncing = false;
    this.isRefreshing = false;
    this.isRecovering = false;
  }

  refresh(): void {
    if (!this.canRefresh) {
      return;
    }

    this.isRefreshing = true;
    this.projectStore.openThread(this.thread.id);
  }

  recover(): void {
    if (this.isRecovering || this.projectStore.isOrphan) {
      return;
    }

    this.isRecovering = true;
    this.isSyncing = true;
    void this.root.request({
      type: "threads.recover",
      threadId: this.thread.id
    });
  }

  loadOlderMessages(): void {
    if (
      this.isLoadingOlderMessages ||
      !this.hasMoreOlderMessages ||
      this.projectStore.loadingThreadId !== null
    ) {
      return;
    }

    this.isLoadingOlderMessages = true;
    void this.root.request({
      type: "threads.loadOlder",
      threadId: this.thread.id
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
    attachments: OpenCodexImageAttachment[] = [],
    model: string | null = this.root.appStore.selectedModel,
    reasoningEffort: OpenCodexReasoningEffort = this.root.appStore.reasoningEffort
  ): Promise<boolean> {
    const trimmedText = text.trim();
    const sourceId = this.thread.sourceId ?? this.projectStore.project.sourceId;

    if (
      (trimmedText.length === 0 && attachments.length === 0) ||
      this.projectStore.isOrphan ||
      sourceId === null ||
      this.isStartingTurn ||
      this.isEditingLastTurn ||
      this.isRecovering
    ) {
      return Promise.resolve(false);
    }

    if (this.isWorking) {
      if (!this.canSteerActiveTurn) {
        return Promise.resolve(false);
      }

      return this.steerActiveTurn(trimmedText, attachments);
    }

    this.isStartingTurn = true;
    this.createOptimisticUserTurn(trimmedText, attachments);

    void this.root.request({
      type: "turn.start",
      threadId: this.thread.id,
      projectPath: this.projectStore.projectPath,
      sourceId,
      text: trimmedText,
      attachments,
      model,
      reasoningEffort
    });

    return Promise.resolve(true);
  }

  interruptTurn(): void {
    if (this.activeTurnId === null) {
      return;
    }

    void this.root.request({
      type: "turn.interrupt",
      threadId: this.thread.id,
      turnId: this.activeTurnId
    });
  }

  editLastTurn(
    text: string,
    attachments: OpenCodexImageAttachment[] = [],
    model: string | null = this.root.appStore.selectedModel,
    reasoningEffort: OpenCodexReasoningEffort = this.root.appStore.reasoningEffort
  ): boolean {
    const trimmedText = text.trim();
    const sourceId = this.thread.sourceId ?? this.projectStore.project.sourceId;
    const editableItem = this.editableLastUserItem;
    const previousTurns = this.turns;
    const plainAttachments = cloneImageAttachments(attachments);

    if (
      editableItem === null ||
      (trimmedText.length === 0 && plainAttachments.length === 0) ||
      sourceId === null
    ) {
      return false;
    }

    this.isEditingLastTurn = true;
    this.isStartingTurn = true;
    this.turns = this.turns.slice(0, -1);
    this.pendingTurnId = null;
    this.createOptimisticUserTurn(trimmedText, plainAttachments);

    void this.root.request<{ threadId?: string }>({
      type: "turn.editLast",
      threadId: this.thread.id,
      projectPath: this.projectStore.projectPath,
      sourceId,
      text: trimmedText,
      attachments: plainAttachments,
      model,
      reasoningEffort
    }).then((result) => {
      const targetThreadId = result.threadId ?? this.thread.id;

      void this.root.request({
        type: "turn.start",
        threadId: targetThreadId,
        projectPath: this.projectStore.projectPath,
        sourceId,
        text: trimmedText,
        attachments: plainAttachments,
        model,
        reasoningEffort
      }).catch((error: unknown) => {
        runInAction(() => {
          this.isStartingTurn = false;
          this.isEditingLastTurn = false;
          this.root.appStore.errorMessage = readErrorMessage(error);
        });
      });
    }).catch((error: unknown) => {
      runInAction(() => {
        this.turns = previousTurns;
        this.pendingTurnId = null;
        this.isEditingLastTurn = false;
        this.isStartingTurn = false;
        this.root.appStore.errorMessage = readErrorMessage(error);
      });
    });

    return true;
  }

  rename(name: string): void {
    const trimmedName = name.trim();

    if (trimmedName.length === 0 || this.projectStore.isOrphan) {
      return;
    }

    this.projectStore.renameThread(this.thread.id, trimmedName);
    this.setThread({ ...this.thread, customTitle: trimmedName, title: trimmedName });

    void this.root.request({
      type: "threads.rename",
      threadId: this.thread.id,
      name: trimmedName
    });
  }

  applyOpenedSnapshot(
    turns: OpenCodexTurn[],
    source: "thread.opened" | "thread.created",
    hasMoreOlderMessages: boolean,
    shouldMergeTurns: boolean
  ): void {
    this.isRefreshing = false;
    this.isLoadingOlderMessages = false;
    this.isSyncing = false;
    this.isEditingLastTurn = false;
    this.pendingTurnId = null;
    this.hasMoreOlderMessages = source === "thread.opened" ? hasMoreOlderMessages : false;
    applyThreadTurns(this, this.root, turns, shouldMergeTurns ? "merge" : "replace", source);
    this.scrollToBottomVersion += 1;
    this.root.appStore.errorMessage = null;
    this.markSeen();

    if (this.thread.model !== null) {
      this.root.appStore.selectedModel = this.thread.model;
    }

    if (this.thread.reasoningEffort !== null) {
      this.root.appStore.reasoningEffort = this.thread.reasoningEffort;
    }
  }

  applyTurnsPrepended(turns: OpenCodexTurn[], hasMoreOlderMessages: boolean): void {
    this.isLoadingOlderMessages = false;
    this.hasMoreOlderMessages = hasMoreOlderMessages;
    this.turns = [...turns, ...this.turns];
    this.olderMessagesPrependVersion += 1;
  }

  applyTurnsSynced(turns: OpenCodexTurn[], hasMoreOlderMessages: boolean): void {
    applyThreadTurns(this, this.root, turns, "merge", "thread.turns.synced");
    this.hasMoreOlderMessages = hasMoreOlderMessages;
  }

  setSyncing(isSyncing: boolean): void {
    this.isSyncing = isSyncing;

    if (!isSyncing) {
      this.isRefreshing = false;
    }
  }

  setRecovering(isRecovering: boolean): void {
    this.isRecovering = isRecovering;
    this.isSyncing = isRecovering;
    this.isRefreshing = false;
    this.projectStore.loadingThreadId = null;
  }

  completeRecovery(): void {
    const hasRecoveredRunningTurn = hasActiveRunningTurn(this.turns, this.activeTurnId);
    this.isRecovering = false;
    this.isSyncing = false;
    this.isRefreshing = false;
    this.isWorking = hasRecoveredRunningTurn;

    if (!hasRecoveredRunningTurn) {
      this.activeTurnId = null;
      this.pendingTurnId = null;
    }
  }

  applyRename(name: string): void {
    this.projectStore.renameThread(this.thread.id, name);
    this.setThread({ ...this.thread, customTitle: name, title: name });
  }

  applyMessageStarted(message: OpenCodexMessage): void {
    this.isStartingTurn = false;
    upsertPendingUserTurn(this, message);
    this.scrollToBottomVersion += 1;
  }

  appendAssistantDelta(
    turnId: string,
    itemId: string,
    delta: string,
    phase: OpenCodexMessagePhase | null
  ): void {
    const turn = findOrCreateTurn(this, turnId);
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

  applyActivityUpdated(activity: OpenCodexActivity): void {
    appendActivityItem(this, activity);
  }

  applyTurnStarted(turnId: string): void {
    this.isStartingTurn = false;
    this.isEditingLastTurn = false;
    this.isWorking = true;
    this.hasUnseenCompletedTurn = false;
    this.activeTurnId = turnId;
    movePendingTurnToStartedTurn(this, turnId);
  }

  applyTurnCompleted(turnId: string, durationMs: number | null): void {
    const shouldMarkUnseen = !this.isVisibleChat();

    this.isWorking = false;
    this.activeTurnId = null;
    this.pendingTurnId = null;
    this.isEditingLastTurn = false;
    this.hasUnseenCompletedTurn = shouldMarkUnseen;
    applyTurnDuration(this, turnId, durationMs);
  }

  /**
   * Marks the latest completed work as seen.
   *
   * @returns Nothing.
   */
  markSeen(): void {
    this.hasUnseenCompletedTurn = false;
  }

  /**
   * Adds or replaces an approval attached to this chat.
   *
   * @param approval Approval request to store.
   *
   * @returns Nothing.
   */
  addApproval(approval: OpenCodexApproval): void {
    const existingIndex = this.approvals.findIndex((entry) => entry.id === approval.id);

    if (existingIndex === -1) {
      this.approvals.push(approval);
      return;
    }

    this.approvals.splice(existingIndex, 1, approval);
  }

  /**
   * Removes an approval from this chat.
   *
   * @param approvalId Approval identifier.
   *
   * @returns Nothing.
   */
  removeApproval(approvalId: string): void {
    this.approvals = this.approvals.filter((approval) => approval.id !== approvalId);
  }

  private createOptimisticUserTurn(
    content: string,
    attachments: OpenCodexImageAttachment[]
  ): void {
    const threadId = this.thread.id;
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
          createdAt: new Date().toISOString(),
          attachments
        }
      ]
    };

    this.pendingTurnId = turnId;
    this.turns.push(created);
    this.scrollToBottomVersion += 1;
  }

  private steerActiveTurn(
    content: string,
    attachments: OpenCodexImageAttachment[]
  ): Promise<boolean> {
    const turnId = this.activeTurnId;

    if (turnId === null) {
      return Promise.resolve(false);
    }

    const optimisticItemId = this.createOptimisticSteerItem(turnId, content, attachments);

    return this.root.request({
      type: "turn.steer",
      threadId: this.thread.id,
      turnId,
      text: content,
      attachments
    }).then(() => true).catch(() => {
      runInAction(() => {
        this.removeTurnItem(turnId, optimisticItemId);
      });
      return false;
    });
  }

  private createOptimisticSteerItem(
    turnId: string,
    content: string,
    attachments: OpenCodexImageAttachment[]
  ): string {
    const turn = findOrCreateTurn(this, turnId);
    const itemId = `${turnId}:steer:${Date.now()}:${Math.random().toString(16).slice(2)}`;

    turn.items.push({
      id: itemId,
      role: "user",
      kind: "steer",
      content,
      status: "completed",
      createdAt: new Date().toISOString(),
      attachments
    });
    this.scrollToBottomVersion += 1;

    return itemId;
  }

  private removeTurnItem(turnId: string, itemId: string): void {
    const turn = this.turns.find((entry) => entry.id === turnId);

    if (turn === undefined) {
      return;
    }

    turn.items = turn.items.filter((item) => item.id !== itemId);
  }

  private isVisibleChat(): boolean {
    return (
      this.root.navigationStore.activeProjectStore?.project.id === this.projectStore.project.id &&
      this.projectStore.selectedChatId === this.thread.id
    );
  }

}

function cloneImageAttachments(attachments: OpenCodexImageAttachment[]): OpenCodexImageAttachment[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    source: attachment.source,
    value: attachment.value,
    name: attachment.name ?? null,
    previewUrl: attachment.previewUrl ?? null
  }));
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
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
