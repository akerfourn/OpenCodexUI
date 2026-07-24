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
 * Checks whether a terminal turn can be rolled back for editing.
 *
 * @param status Turn status reported by Codex.
 * @returns Whether the status represents a finished editable turn.
 */
function isEditableTerminalTurnStatus(status: string | null): boolean {
  return status === "completed" || status === "failed" || status === "interrupted";
}

/** Reading state retained while a chat timeline is not mounted. */
export interface ChatTimelineViewState {
  visibleTurnCount: number;
  turnCount: number;
  scrollTop: number;
  isPinnedToBottom: boolean;
}

/**
 * Stores the loaded turns and runtime flags for a single chat.
 */
export class ChatStore {
  /** Thread metadata for this chat. */
  thread: OpenCodexThread;
  /** Raw turns currently loaded in memory. */
  turns: OpenCodexTurn[] = [];
  /** Per-turn stores derived from `turns` for isolated rendering. */
  turnStores: ChatTurnStore[] = [];
  /** Approvals attached to this chat. */
  approvals: OpenCodexApproval[] = [];
  /** Whether older turns are available from the backend/cache. */
  hasMoreOlderMessages = false;
  /** Whether an older-turn page is loading. */
  isLoadingOlderMessages = false;
  /** Whether this thread is synchronizing with Codex. */
  isSyncing = false;
  /** Whether the current thread snapshot is being refreshed. */
  isRefreshing = false;
  /** Whether the chat is recovering after a recoverable thread error. */
  isRecovering = false;
  /** Whether Codex currently has an active turn for this chat. */
  isWorking = false;
  /** Whether a start-turn request is in flight before Codex confirms a turn id. */
  isStartingTurn = false;
  /** Whether the last turn is being edited and restarted. */
  isEditingLastTurn = false;
  /** Whether completed work is unseen by the user. */
  hasUnseenCompletedTurn = false;
  /** Active Codex turn id while a turn is running. */
  activeTurnId: string | null = null;
  /** Optimistic local turn id waiting for Codex confirmation. */
  pendingTurnId: string | null = null;
  /** Composer model selected for future turns in this chat. */
  selectedModel: string | null = null;
  /** Composer reasoning effort selected for future turns in this chat. */
  reasoningEffort: OpenCodexReasoningEffort = "medium";
  /** Optional service tier selected for future turns in this chat. */
  selectedServiceTier: OpenCodexServiceTier | null = null;
  /** Plain-text composer draft preserved per chat. */
  composerDraft = "";
  /** Markdown composer draft with references serialized. */
  composerDraftMarkdown = "";
  /** Structured references embedded in the composer draft. */
  composerDraftReferences: OpenCodexComposerReference[] = [];
  /** Image attachments currently staged in the composer. */
  composerAttachments: OpenCodexImageAttachment[] = [];
  /** Latest token usage snapshot for the thread context. */
  tokenUsage: OpenCodexThreadTokenUsage | null = null;
  /** Incremented when older messages are prepended so the UI can preserve scroll. */
  olderMessagesPrependVersion = 0;
  /** Incremented when the UI should scroll this chat to the bottom. */
  scrollToBottomVersion = 0;
  /** Timeline reading state retained while this chat view is unmounted. */
  timelineViewState: ChatTimelineViewState | null = null;
  /** Whether the user explicitly changed the model for this chat. */
  private hasExplicitModelSelection = false;
  /** Whether the user explicitly changed reasoning effort for this chat. */
  private hasExplicitReasoningEffortSelection = false;
  /** Whether a runtime status request is in flight. */
  private isReadingRuntimeStatus = false;
  /** Poll timer used to recover from missed turn-completed notifications. */
  private runtimeStatusPollId: ReturnType<typeof setInterval> | null = null;
  /** Turn stores keyed by raw turn id. */
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

  /** Whether the current thread can be manually refreshed. */
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

  /** Whether the user can send steering input into the active turn. */
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

  /** Last editable user message payload, when rollback/edit is allowed. */
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
      !isEditableTerminalTurnStatus(lastTurn.status)
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

  /** Identity of the last editable user item without cloning content. */
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
      !isEditableTerminalTurnStatus(lastTurn.status)
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
    this.projectStore.registerChatRoute(this);

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
    this.reasoningEffort = this.root.appStore.resolveReasoningEffort(value, this.reasoningEffort);
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
   * Reconciles the current effort after a model catalog refresh.
   *
   * @returns Nothing.
   */
  reconcileReasoningEffort(): void {
    const nextReasoningEffort = this.root.appStore.resolveReasoningEffort(
      this.selectedModel,
      this.reasoningEffort
    );

    if (nextReasoningEffort === this.reasoningEffort) {
      return;
    }

    this.reasoningEffort = nextReasoningEffort;
    this.updateComposerThreadMetadata(this.selectedModel, nextReasoningEffort);
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
   * Retains the timeline window and scroll position across view remounts.
   *
   * @param state Current timeline reading state.
   *
   * @returns Nothing.
   */
  setTimelineViewState(state: ChatTimelineViewState): void {
    this.timelineViewState = {
      visibleTurnCount: state.visibleTurnCount,
      turnCount: state.turnCount,
      scrollTop: state.scrollTop,
      isPinnedToBottom: state.isPinnedToBottom
    };
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

  /**
   * Releases timers owned by this chat store.
   */
  dispose(): void {
    this.stopRuntimeStatusPolling();
  }

  /**
   * Replaces raw turns and reconciles per-turn stores.
   *
   * @param turns Raw turns.
   */
  setTurns(turns: OpenCodexTurn[]): void {
    this.turns = turns;
    this.syncTurnStores();
  }

  /**
   * Appends one raw turn and creates its turn store.
   *
   * @param turn Raw turn.
   */
  appendTurn(turn: OpenCodexTurn): void {
    this.turns.push(turn);
    this.upsertTurnStore(turn);
  }

  /**
   * Reconciles per-turn stores with the current raw turn list.
   */
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

  /**
   * Inserts or updates the store for one raw turn.
   *
   * @param turn Raw turn.
   */
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

  /**
   * Requests a fresh snapshot for this thread.
   */
  refresh(): void {
    if (!this.canRefresh) {
      return;
    }

    this.isRefreshing = true;
    this.projectStore.openThread(this.thread.id);
  }

  /**
   * Starts recovery for a thread after a recoverable backend error.
   */
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

  /**
   * Starts a Codex review action for the thread.
   */
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

  /**
   * Starts Codex context compaction for the thread.
   */
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

  /**
   * Requests the next page of older turns.
   */
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

  /**
   * Requests interruption of the active Codex turn.
   */
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

  /**
   * Renames the thread locally and in Codex.
   *
   * @param name New thread title.
   */
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
    applyThreadTurns(this, turns, shouldMergeTurns ? "merge" : "replace");

    if (!shouldMergeTurns) {
      this.scrollToBottomVersion += 1;
    }

    this.root.appStore.errorMessage = null;
    this.markSeen();
  }

  /**
   * Applies older turns loaded before the current first turn.
   *
   * @param turns Older turns.
   * @param hasMoreOlderMessages Whether more older turns remain.
   */
  applyTurnsPrepended(turns: OpenCodexTurn[], hasMoreOlderMessages: boolean): void {
    this.isLoadingOlderMessages = false;
    this.hasMoreOlderMessages = hasMoreOlderMessages;
    this.setTurns([...turns, ...this.turns]);
    this.olderMessagesPrependVersion += 1;
  }

  /**
   * Applies a background turn sync.
   *
   * @param turns Synced turns.
   * @param hasMoreOlderMessages Whether more older turns remain.
   */
  applyTurnsSynced(turns: OpenCodexTurn[], hasMoreOlderMessages: boolean): void {
    applyThreadTurns(this, turns, "merge");
    this.hasMoreOlderMessages = hasMoreOlderMessages;
  }

  /**
   * Updates the synchronization flag.
   *
   * @param isSyncing Whether sync is active.
   */
  setSyncing(isSyncing: boolean): void {
    this.isSyncing = isSyncing;

    if (!isSyncing) {
      this.isRefreshing = false;
    }
  }

  /**
   * Updates recovery flags while a thread is being recovered.
   *
   * @param isRecovering Whether recovery is active.
   */
  setRecovering(isRecovering: boolean): void {
    this.isRecovering = isRecovering;
    this.isSyncing = isRecovering;
    this.isRefreshing = false;
    this.projectStore.loadingThreadId = null;
  }

  /**
   * Completes recovery and restores running state when a turn is still active.
   */
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

  /**
   * Applies a backend-confirmed thread rename.
   *
   * @param name New thread title.
   */
  applyRename(name: string): void {
    this.projectStore.renameThread(this.thread.id, name);
    this.setThread({ ...this.thread, customTitle: name, title: name });
  }

  /**
   * Applies token usage for this thread.
   *
   * @param usage Token usage snapshot.
   */
  applyTokenUsage(usage: OpenCodexThreadTokenUsage | null): void {
    this.tokenUsage = usage;
  }

  /**
   * Applies a message-started notification.
   *
   * @param message Started message item.
   */
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

  /**
   * Applies a reasoning/activity update.
   *
   * @param activity Activity item.
   */
  applyActivityUpdated(activity: OpenCodexActivity): void {
    appendActivityItem(this, activity);
  }

  /**
   * Applies a turn-started notification from Codex.
   *
   * @param turnId Started turn identifier.
   */
  applyTurnStarted(turnId: string): void {
    this.isStartingTurn = false;
    this.isEditingLastTurn = false;
    this.isWorking = true;
    this.hasUnseenCompletedTurn = false;
    this.activeTurnId = turnId;
    movePendingTurnToStartedTurn(this, turnId);
    this.startRuntimeStatusPolling();
  }

  /**
   * Applies a turn-completed notification when it matches the active turn.
   *
   * @param turnId Completed turn identifier.
   * @param durationMs Optional turn duration.
   * @param turnStatus Terminal status reported by Codex, when available.
   */
  applyTurnCompleted(
    turnId: string,
    durationMs: number | null,
    turnStatus?: string
  ): void {
    applyTurnDuration(this, turnId, durationMs);

    const completedTurn = this.turns.find((turn) => turn.id === turnId);

    if (completedTurn !== undefined && turnStatus !== undefined && turnStatus.length > 0) {
      completedTurn.status = turnStatus;
    }

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

  /**
   * Creates a temporary user turn before Codex returns the real turn id.
   *
   * @param content User message content.
   * @param attachments Image attachments.
   */
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

  /**
   * Sends a steering message into the active turn with optimistic UI.
   *
   * @param content Steering message content.
   * @param attachments Image attachments.
   * @param references Composer references.
   * @returns Promise resolved with whether steering succeeded.
   */
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

  /**
   * Adds an optimistic steering item to the active turn.
   *
   * @param turnId Active turn identifier.
   * @param content Steering message content.
   * @param attachments Image attachments.
   * @returns Optimistic item identifier.
   */
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

  /**
   * Removes one item from a turn after an optimistic failure.
   *
   * @param turnId Turn identifier.
   * @param itemId Item identifier.
   */
  private removeTurnItem(turnId: string, itemId: string): void {
    const turn = this.turns.find((entry) => entry.id === turnId);

    if (turn === undefined) {
      return;
    }

    turn.items = turn.items.filter((item) => item.id !== itemId);
  }

  /**
   * Clears optimistic turn state after a failed start-turn request.
   */
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

  /**
   * Starts polling runtime status as a fallback for missed completion events.
   */
  private startRuntimeStatusPolling(): void {
    if (this.runtimeStatusPollId !== null) {
      return;
    }

    this.runtimeStatusPollId = setInterval(() => {
      void this.reconcileRuntimeStatus();
    }, THREAD_RUNTIME_STATUS_POLL_INTERVAL_MS);
  }

  /**
   * Stops runtime status polling and clears its in-flight flag.
   */
  private stopRuntimeStatusPolling(): void {
    if (this.runtimeStatusPollId === null) {
      return;
    }

    clearInterval(this.runtimeStatusPollId);
    this.runtimeStatusPollId = null;
    this.isReadingRuntimeStatus = false;
  }

  /**
   * Reads runtime status and reconciles stale local working state.
   *
   * @returns Promise resolved when reconciliation completes.
   */
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

  /**
   * Checks whether runtime status polling should issue a request.
   *
   * @returns Whether runtime status should be read.
   */
  private shouldReadRuntimeStatus(): boolean {
    return (
      this.isWorking &&
      this.activeTurnId !== null &&
      !this.isReadingRuntimeStatus &&
      !this.projectStore.isReadOnlyFromCache
    );
  }

  /**
   * Applies a runtime status response for this thread.
   *
   * @param status Runtime status response.
   */
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

  /**
   * Marks the chat idle after runtime status says no turn is active.
   */
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

  /**
   * Checks whether this chat is currently visible to the user.
   *
   * @returns Whether the chat is active in the selected project tab.
   */
  private isVisibleChat(): boolean {
    return (
      this.root.navigationStore.activeProjectStore?.project.id === this.projectStore.project.id &&
      this.projectStore.selectedChatId === this.thread.id
    );
  }

  /** Whether advanced Codex actions can start a new turn now. */
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

/**
 * Clones composer references before crossing request boundaries.
 *
 * @param references Composer references.
 * @returns Plain cloned references.
 */
function cloneComposerReferences(references: OpenCodexComposerReference[]): OpenCodexComposerReference[] {
  return references.map((reference) => ({
    type: reference.type,
    name: reference.name,
    path: reference.path
  }));
}

/**
 * Clones image attachments before crossing request boundaries.
 *
 * @param attachments Image attachments.
 * @returns Plain cloned attachments.
 */
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

/**
 * Converts unknown errors into displayable chat error text.
 *
 * @param error Unknown caught error.
 * @returns Error message.
 */
function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Resolves the initial model for a chat composer.
 *
 * @param thread Thread metadata.
 * @param root Root store.
 * @returns Model identifier, or `null`.
 */
function resolveInitialSelectedModel(thread: OpenCodexThread, root: RootStore): string | null {
  if (thread.model !== null) {
    return thread.model;
  }

  return root.appStore.models[0]?.model ?? root.appStore.selectedModel ?? root.appStore.settings.defaultModel;
}

/**
 * Resolves the initial reasoning effort for a chat composer.
 *
 * @param thread Thread metadata.
 * @param root Root store.
 * @returns Reasoning effort.
 */
function resolveInitialReasoningEffort(
  thread: OpenCodexThread,
  root: RootStore
): OpenCodexReasoningEffort {
  const selectedModel = resolveInitialSelectedModel(thread, root);
  const configuredEffort = thread.reasoningEffort ?? root.appStore.settings.defaultReasoningEffort ?? "medium";
  return root.appStore.resolveReasoningEffort(selectedModel, configuredEffort);
}

/**
 * Keeps a selected service tier only when available for the selected model.
 *
 * @param model Model identifier.
 * @param serviceTier Selected service tier.
 * @param root Root store.
 * @returns Available service tier, or `null`.
 */
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

/**
 * Reads the load-older response defensively.
 *
 * @param value Unknown backend response.
 * @returns Normalized load-older result.
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
