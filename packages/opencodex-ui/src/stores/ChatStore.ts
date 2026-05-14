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
      !this.isRecovering
    );
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
  ): void {
    const trimmedText = text.trim();
    const sourceId = this.thread.sourceId ?? this.projectStore.project.sourceId;

    if (
      (trimmedText.length === 0 && attachments.length === 0) ||
      this.projectStore.isOrphan ||
      sourceId === null ||
      this.isWorking ||
      this.isStartingTurn ||
      this.isRecovering
    ) {
      return;
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
    this.pendingTurnId = null;
    this.hasMoreOlderMessages = source === "thread.opened" ? hasMoreOlderMessages : false;
    applyThreadTurns(this, this.root, turns, shouldMergeTurns ? "merge" : "replace", source);
    this.scrollToBottomVersion += 1;
    this.root.appStore.errorMessage = null;

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
    this.isWorking = true;
    this.activeTurnId = turnId;
    movePendingTurnToStartedTurn(this, turnId);
  }

  applyTurnCompleted(turnId: string, durationMs: number | null): void {
    this.isWorking = false;
    this.activeTurnId = null;
    this.pendingTurnId = null;
    applyTurnDuration(this, turnId, durationMs);
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
