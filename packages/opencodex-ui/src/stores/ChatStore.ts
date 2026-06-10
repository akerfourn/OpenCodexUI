/**
 * Holds the observable UI state for one chat loaded in memory.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexActivity,
  OpenCodexApproval,
  OpenCodexComposerReference,
  OpenCodexImageAttachment,
  OpenCodexMessage,
  OpenCodexMessagePhase,
  OpenCodexReasoningEffort,
  OpenCodexServiceTier,
  OpenCodexThread,
  OpenCodexThreadRuntimeStatus,
  OpenCodexThreadTokenUsage,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "./RootStore";
import { ChatTurnStore } from "./ChatTurnStore";
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

const THREAD_RUNTIME_STATUS_POLL_INTERVAL_MS = 30_000;

/**
 * Stores the loaded turns and runtime flags for a single chat.
 */
export class ChatStore {
  thread: OpenCodexThread;
  turns: OpenCodexTurn[] = [];
  turnStores: ChatTurnStore[] = [];
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
  selectedModel: string | null = null;
  reasoningEffort: OpenCodexReasoningEffort = "medium";
  selectedServiceTier: OpenCodexServiceTier | null = null;
  composerDraft = "";
  composerDraftMarkdown = "";
  composerDraftReferences: OpenCodexComposerReference[] = [];
  composerAttachments: OpenCodexImageAttachment[] = [];
  tokenUsage: OpenCodexThreadTokenUsage | null = null;
  olderMessagesPrependVersion = 0;
  scrollToBottomVersion = 0;
  private hasExplicitModelSelection = false;
  private hasExplicitReasoningEffortSelection = false;
  private isReadingRuntimeStatus = false;
  private runtimeStatusPollId: ReturnType<typeof setInterval> | null = null;
  private turnStoresById = new Map<string, ChatTurnStore>();

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
    this.thread = projectStore.ensureThreadSource(thread);
    this.selectedModel = resolveInitialSelectedModel(thread, root);
    this.reasoningEffort = resolveInitialReasoningEffort(thread, root);
    makeAutoObservable<
      ChatStore,
      | "projectStore"
      | "root"
      | "turnStoresById"
      | "hasExplicitModelSelection"
      | "hasExplicitReasoningEffortSelection"
      | "isReadingRuntimeStatus"
      | "runtimeStatusPollId"
      | "updateComposerThreadMetadata"
    >(this, {
      projectStore: false,
      root: false,
      turnStoresById: false,
      hasExplicitModelSelection: false,
      hasExplicitReasoningEffortSelection: false,
      isReadingRuntimeStatus: false,
      runtimeStatusPollId: false,
      updateComposerThreadMetadata: false
    });
  }

  get canRefresh(): boolean {
    return (
      !this.projectStore.isReadOnlyFromCache &&
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
    return (
      this.root.appStore.settings.allowTurnSteering &&
      this.isWorking &&
      this.activeTurnId !== null &&
      this.sourceId !== null &&
      !this.projectStore.isReadOnlyFromCache &&
      !this.isStartingTurn &&
      !this.isEditingLastTurn &&
      !this.isRecovering
    );
  }

  /**
   * Returns the Codex source that owns this chat.
   *
   * @returns Resolved source identifier, or `null` when unavailable.
   */
  get sourceId(): string | null {
    return this.projectStore.resolveThreadSourceId(this.thread);
  }

  get editableLastUserItem(): {
    turnId: string;
    itemId: string;
    content: string;
    attachments: OpenCodexImageAttachment[];
  } | null {
    if (
      this.projectStore.isReadOnlyFromCache ||
      this.isWorking ||
      this.isStartingTurn ||
      this.isEditingLastTurn ||
      this.isRecovering ||
      this.turns.length === 0
    ) {
      return null;
    }

    const lastTurn = this.turns.at(-1);

    if (
      lastTurn === undefined ||
      lastTurn.id.startsWith("pending:") ||
      lastTurn.status !== "completed"
    ) {
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

  get editableLastUserItemIdentity(): {
    turnId: string;
    itemId: string;
  } | null {
    if (
      this.projectStore.isReadOnlyFromCache ||
      this.isWorking ||
      this.isStartingTurn ||
      this.isEditingLastTurn ||
      this.isRecovering ||
      this.turns.length === 0
    ) {
      return null;
    }

    const lastTurn = this.turns.at(-1);

    if (
      lastTurn === undefined ||
      lastTurn.id.startsWith("pending:") ||
      lastTurn.status !== "completed"
    ) {
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
      itemId: userItem.id
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
    this.thread = this.projectStore.ensureThreadSource(thread);

    if (!this.hasExplicitModelSelection && this.thread.model !== null) {
      this.selectedModel = this.thread.model;
    }

    if (!this.hasExplicitReasoningEffortSelection && this.thread.reasoningEffort !== null) {
      this.reasoningEffort = this.thread.reasoningEffort;
    }
  }

  /**
   * Updates the model used by this chat composer for future turns.
   *
   * @param value Model identifier, or `null` for backend default.
   *
   * @returns Nothing.
   */
  setSelectedModel(value: string | null): void {
    this.selectedModel = value;
    this.selectedServiceTier = resolveAvailableServiceTier(value, this.selectedServiceTier, this.root);
    this.hasExplicitModelSelection = true;
    this.updateComposerThreadMetadata(value, this.reasoningEffort);
  }

  /**
   * Updates the reasoning effort used by this chat composer for future turns.
   *
   * @param value Reasoning effort to use for future turns.
   *
   * @returns Nothing.
   */
  setReasoningEffort(value: OpenCodexReasoningEffort): void {
    this.reasoningEffort = value;
    this.hasExplicitReasoningEffortSelection = true;
    this.updateComposerThreadMetadata(this.selectedModel, value);
  }

  /**
   * Updates the service tier used by this chat composer for future turns.
   *
   * @param value Service tier identifier, or `null` for Codex default.
   *
   * @returns Nothing.
   */
  setSelectedServiceTier(value: OpenCodexServiceTier | null): void {
    this.selectedServiceTier = resolveAvailableServiceTier(this.selectedModel, value, this.root);
  }

  /**
   * Updates the in-memory composer draft for this chat.
   *
   * @param value Plain text draft.
   * @param markdown Markdown serialization including composer references.
   * @param references Composer references embedded in the markdown draft.
   *
   * @returns Nothing.
   */
  setComposerDraft(
    value: string,
    markdown: string,
    references: OpenCodexComposerReference[]
  ): void {
    this.composerDraft = value;
    this.composerDraftMarkdown = markdown;
    this.composerDraftReferences = cloneComposerReferences(references);
  }

  /**
   * Appends image attachments to the in-memory composer draft.
   *
   * @param attachments Image attachments to add.
   *
   * @returns Nothing.
   */
  addComposerAttachments(attachments: OpenCodexImageAttachment[]): void {
    this.composerAttachments = [
      ...this.composerAttachments,
      ...cloneImageAttachments(attachments)
    ];
  }

  /**
   * Removes one image attachment from the in-memory composer draft.
   *
   * @param attachmentId Attachment identifier.
   *
   * @returns Nothing.
   */
  removeComposerAttachment(attachmentId: string): void {
    this.composerAttachments = this.composerAttachments.filter((attachment) => {
      return attachment.id !== attachmentId;
    });
  }

  /**
   * Clears the in-memory composer draft after a successful send.
   *
   * @returns Nothing.
   */
  clearComposerDraft(): void {
    this.composerDraft = "";
    this.composerDraftMarkdown = "";
    this.composerDraftReferences = [];
    this.composerAttachments = [];
  }

  /**
   * Applies local composer metadata to the visible thread and cache.
   *
   * @param model Selected model identifier.
   * @param reasoningEffort Selected reasoning effort.
   *
   * @returns Nothing.
   */
  private updateComposerThreadMetadata(
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null
  ): void {
    const thread = {
      ...this.thread,
      model,
      reasoningEffort
    };

    this.thread = thread;
    this.projectStore.upsertThread(thread);

    void this.root.request({
      type: "threads.updateComposerSettings",
      threadId: thread.id,
      model,
      reasoningEffort
    }).catch((error: unknown) => {
      runInAction(() => {
        this.root.appStore.errorMessage = readErrorMessage(error);
      });
    });
  }

  /**
   * Resets the transient chat state before loading a different snapshot.
   *
   * @returns Nothing.
   */
  clearLoadedState(): void {
    this.setTurns([]);
    this.stopRuntimeStatusPolling();
    this.isWorking = false;
    this.isStartingTurn = false;
    this.isEditingLastTurn = false;
    this.activeTurnId = null;
    this.pendingTurnId = null;
    this.hasUnseenCompletedTurn = false;
    this.hasMoreOlderMessages = false;
    this.isLoadingOlderMessages = false;
    this.isSyncing = false;
    this.isRefreshing = false;
    this.isRecovering = false;
    this.tokenUsage = null;
  }

  dispose(): void {
    this.stopRuntimeStatusPolling();
  }

  setTurns(turns: OpenCodexTurn[]): void {
    this.turns = turns;
    this.syncTurnStores();
  }

  appendTurn(turn: OpenCodexTurn): void {
    this.turns.push(turn);
    this.upsertTurnStore(turn);
  }

  syncTurnStores(): void {
    const nextStores: ChatTurnStore[] = [];
    const nextStoresById = new Map<string, ChatTurnStore>();

    for (const turn of this.turns) {
      const existingStore = this.turnStoresById.get(turn.id);
      const turnStore = existingStore ?? new ChatTurnStore(turn);

      if (existingStore !== undefined) {
        turnStore.setTurn(turn);
      }

      nextStores.push(turnStore);
      nextStoresById.set(turn.id, turnStore);
    }

    this.turnStores = nextStores;
    this.turnStoresById = nextStoresById;
  }

  private upsertTurnStore(turn: OpenCodexTurn): void {
    const existingStore = this.turnStoresById.get(turn.id);

    if (existingStore !== undefined) {
      existingStore.setTurn(turn);
      return;
    }

    const turnStore = new ChatTurnStore(turn);
    this.turnStoresById.set(turn.id, turnStore);
    this.turnStores.push(turnStore);
  }

  refresh(): void {
    if (!this.canRefresh) {
      return;
    }

    this.isRefreshing = true;
    this.projectStore.openThread(this.thread.id);
  }

  recover(): void {
    if (this.isRecovering || this.projectStore.isReadOnlyFromCache) {
      return;
    }

    this.isRecovering = true;
    this.isSyncing = true;
    void this.root.request({
      type: "threads.recover",
      threadId: this.thread.id
    });
  }

  startReview(): void {
    if (!this.canRunAdvancedAction) {
      return;
    }

    this.isStartingTurn = true;
    void this.root.request({
      type: "thread.review",
      threadId: this.thread.id,
      projectPath: this.projectStore.projectPath
    }).catch((error: unknown) => {
      runInAction(() => {
        this.isStartingTurn = false;
        this.root.appStore.errorMessage = readErrorMessage(error);
      });
    });
  }

  compactThread(): void {
    if (!this.canRunAdvancedAction) {
      return;
    }

    this.isStartingTurn = true;
    void this.root.request({
      type: "thread.compact",
      threadId: this.thread.id,
      projectPath: this.projectStore.projectPath
    }).catch((error: unknown) => {
      runInAction(() => {
        this.isStartingTurn = false;
        this.root.appStore.errorMessage = readErrorMessage(error);
      });
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
    references: OpenCodexComposerReference[] = [],
    model: string | null = this.selectedModel,
    reasoningEffort: OpenCodexReasoningEffort = this.reasoningEffort,
    serviceTier: OpenCodexServiceTier | null = this.selectedServiceTier
  ): Promise<boolean> {
    const trimmedText = text.trim();
    const sourceId = this.sourceId;
    const plainAttachments = cloneImageAttachments(attachments);
    const plainReferences = cloneComposerReferences(references);

    if (
      (trimmedText.length === 0 && plainAttachments.length === 0) ||
      this.projectStore.isReadOnlyFromCache ||
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

      return this.steerActiveTurn(trimmedText, plainAttachments, plainReferences);
    }

    this.isStartingTurn = true;
    this.createOptimisticUserTurn(trimmedText, plainAttachments);

    void this.root.request({
      type: "turn.start",
      threadId: this.thread.id,
      projectPath: this.projectStore.projectPath,
      sourceId,
      text: trimmedText,
      attachments: plainAttachments,
      references: plainReferences,
      model,
      reasoningEffort,
      serviceTier
    }).catch((error: unknown) => {
      runInAction(() => {
        this.clearPendingTurnAfterStartFailure();
        this.root.appStore.errorMessage = readErrorMessage(error);
      });
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
    model: string | null = this.selectedModel,
    reasoningEffort: OpenCodexReasoningEffort = this.reasoningEffort,
    references: OpenCodexComposerReference[] = [],
    serviceTier: OpenCodexServiceTier | null = this.selectedServiceTier
  ): boolean {
    const trimmedText = text.trim();
    const sourceId = this.sourceId;
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
    this.setTurns(this.turns.slice(0, -1));
    this.pendingTurnId = null;
    this.createOptimisticUserTurn(trimmedText, plainAttachments);

    void this.root.request<{ threadId?: string }>({
      type: "turn.editLast",
      threadId: this.thread.id,
      projectPath: this.projectStore.projectPath,
      sourceId,
      text: trimmedText,
      attachments: plainAttachments,
      references: cloneComposerReferences(references),
      model,
      reasoningEffort,
      serviceTier
    }).then((result) => {
      const targetThreadId = result.threadId ?? this.thread.id;

      void this.root.request({
        type: "turn.start",
        threadId: targetThreadId,
        projectPath: this.projectStore.projectPath,
        sourceId,
        text: trimmedText,
        attachments: plainAttachments,
        references: cloneComposerReferences(references),
        model,
        reasoningEffort,
        serviceTier
      }).catch((error: unknown) => {
        runInAction(() => {
          this.isStartingTurn = false;
          this.isEditingLastTurn = false;
          this.root.appStore.errorMessage = readErrorMessage(error);
        });
      });
    }).catch((error: unknown) => {
      runInAction(() => {
        this.setTurns(previousTurns);
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

    if (trimmedName.length === 0 || this.projectStore.isReadOnlyFromCache) {
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
  }

  applyTurnsPrepended(turns: OpenCodexTurn[], hasMoreOlderMessages: boolean): void {
    this.isLoadingOlderMessages = false;
    this.hasMoreOlderMessages = hasMoreOlderMessages;
    this.setTurns([...turns, ...this.turns]);
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
      this.stopRuntimeStatusPolling();
      return;
    }

    this.startRuntimeStatusPolling();
  }

  applyRename(name: string): void {
    this.projectStore.renameThread(this.thread.id, name);
    this.setThread({ ...this.thread, customTitle: name, title: name });
  }

  applyTokenUsage(usage: OpenCodexThreadTokenUsage | null): void {
    this.tokenUsage = usage;
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
    this.startRuntimeStatusPolling();
  }

  applyTurnCompleted(turnId: string, durationMs: number | null): void {
    applyTurnDuration(this, turnId, durationMs);

    if (this.activeTurnId !== null && this.activeTurnId !== turnId) {
      return;
    }

    const shouldMarkUnseen = !this.isVisibleChat();

    this.isWorking = false;
    this.activeTurnId = null;
    this.pendingTurnId = null;
    this.isEditingLastTurn = false;
    this.hasUnseenCompletedTurn = shouldMarkUnseen;
    this.stopRuntimeStatusPolling();
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
    this.appendTurn(created);
    this.scrollToBottomVersion += 1;
  }

  private steerActiveTurn(
    content: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[]
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
      attachments,
      references: cloneComposerReferences(references)
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

  private clearPendingTurnAfterStartFailure(): void {
    const pendingTurnId = this.pendingTurnId;

    this.isStartingTurn = false;
    this.isWorking = false;
    this.activeTurnId = null;
    this.pendingTurnId = null;
    this.stopRuntimeStatusPolling();

    if (pendingTurnId === null) {
      return;
    }

    this.setTurns(this.turns.filter((turn) => turn.id !== pendingTurnId));
  }

  private startRuntimeStatusPolling(): void {
    if (this.runtimeStatusPollId !== null) {
      return;
    }

    this.runtimeStatusPollId = setInterval(() => {
      void this.reconcileRuntimeStatus();
    }, THREAD_RUNTIME_STATUS_POLL_INTERVAL_MS);
  }

  private stopRuntimeStatusPolling(): void {
    if (this.runtimeStatusPollId === null) {
      return;
    }

    clearInterval(this.runtimeStatusPollId);
    this.runtimeStatusPollId = null;
    this.isReadingRuntimeStatus = false;
  }

  private async reconcileRuntimeStatus(): Promise<void> {
    if (!this.shouldReadRuntimeStatus()) {
      return;
    }

    this.isReadingRuntimeStatus = true;

    try {
      const status = await this.root.request<OpenCodexThreadRuntimeStatus>({
        type: "threads.runtimeStatus.read",
        threadId: this.thread.id
      });

      runInAction(() => {
        this.applyRuntimeStatus(status);
      });
    } catch {
      runInAction(() => {
        this.isReadingRuntimeStatus = false;
      });
    }
  }

  private shouldReadRuntimeStatus(): boolean {
    return (
      this.isWorking &&
      this.activeTurnId !== null &&
      !this.isReadingRuntimeStatus &&
      !this.projectStore.isReadOnlyFromCache
    );
  }

  private applyRuntimeStatus(status: OpenCodexThreadRuntimeStatus): void {
    this.isReadingRuntimeStatus = false;

    if (!this.isWorking || this.activeTurnId === null || status.threadId !== this.thread.id) {
      return;
    }

    if (status.isActive !== false) {
      return;
    }

    this.applyRuntimeIdle();
  }

  private applyRuntimeIdle(): void {
    const shouldMarkUnseen = !this.isVisibleChat();

    this.isWorking = false;
    this.isStartingTurn = false;
    this.isEditingLastTurn = false;
    this.activeTurnId = null;
    this.pendingTurnId = null;
    this.hasUnseenCompletedTurn = shouldMarkUnseen;
    this.stopRuntimeStatusPolling();
    this.isRefreshing = true;
    this.projectStore.openThread(this.thread.id);
  }

  private isVisibleChat(): boolean {
    return (
      this.root.navigationStore.activeProjectStore?.project.id === this.projectStore.project.id &&
      this.projectStore.selectedChatId === this.thread.id
    );
  }

  private get canRunAdvancedAction(): boolean {
    return (
      !this.projectStore.isReadOnlyFromCache &&
      !this.isWorking &&
      !this.isStartingTurn &&
      !this.isEditingLastTurn &&
      !this.isRecovering
    );
  }

}

function cloneComposerReferences(references: OpenCodexComposerReference[]): OpenCodexComposerReference[] {
  return references.map((reference) => ({
    type: reference.type,
    name: reference.name,
    path: reference.path
  }));
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

function resolveInitialSelectedModel(thread: OpenCodexThread, root: RootStore): string | null {
  if (thread.model !== null) {
    return thread.model;
  }

  return root.appStore.models[0]?.model ?? root.appStore.selectedModel ?? root.appStore.settings.defaultModel;
}

function resolveInitialReasoningEffort(
  thread: OpenCodexThread,
  root: RootStore
): OpenCodexReasoningEffort {
  return thread.reasoningEffort ?? root.appStore.settings.defaultReasoningEffort ?? "medium";
}

function resolveAvailableServiceTier(
  model: string | null,
  serviceTier: OpenCodexServiceTier | null,
  root: RootStore
): OpenCodexServiceTier | null {
  if (serviceTier === null) {
    return null;
  }

  const tiers = root.appStore.getServiceTierOptions(model);
  const isAvailable = tiers.some((tier) => tier.id === serviceTier);

  return isAvailable ? serviceTier : null;
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
