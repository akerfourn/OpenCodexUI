/**
 * Holds user-triggered commands and optimistic mutations for one chat.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexComposerReference,
  OpenCodexImageAttachment,
  OpenCodexReasoningEffort,
  OpenCodexRequest,
  OpenCodexServiceTier,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "./RootStore";
import type { ChatStore } from "./ChatStore";
import { cloneComposerReferences, cloneImageAttachments } from "./ChatComposerStore";
import {
  readEditableChatItem,
  readEditableChatItemIdentity
} from "./chatEditableTurn";
import {
  canEditLastTurn,
  canRunAdvancedChatAction,
  canRefreshChat,
  canSteerChat
} from "./chatActionGuards";
import { readChatErrorMessage } from "./chatErrorMessage";

/**
 * Stores user-triggered commands and their optimistic chat mutations.
 */
export class ChatActionsStore {
  /** Whether a thread rename request is currently in flight. */
  isRenaming = false;
  /** Last thread metadata confirmed by Codex, excluding an optimistic rename. */
  private confirmedThread: OpenCodexThread;

  /**
   * Creates action handlers attached to a chat.
   *
   * @param parent Owning chat whose state is read and mutated dynamically.
   * @param projectStore Project used for source and navigation operations.
   * @param root Root store used for transport requests and error reporting.
   */
  constructor(
    private readonly parent: ChatStore,
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    this.confirmedThread = parent.thread;
    makeAutoObservable<
      ChatActionsStore,
      "parent" | "projectStore" | "root" | "confirmedThread"
    >(
      this,
      {
        parent: false,
        projectStore: false,
        root: false,
        confirmedThread: false
      },
      { autoBind: true }
    );
  }

  /** Whether the current thread can be manually refreshed. */
  get canRefresh(): boolean {
    return canRefreshChat({
      isReadOnly: this.projectStore.isReadOnlyFromCache,
      runtime: this.parent.runtime
    });
  }

  /** Whether the user can send steering input into the active turn. */
  get canSteerActiveTurn(): boolean {
    return canSteerChat({
      allowTurnSteering: this.root.appStore.settingsStore.settings.allowTurnSteering,
      hasSource: this.parent.sourceId !== null,
      isReadOnly: this.projectStore.isReadOnlyFromCache,
      runtime: this.parent.runtime
    });
  }

  /** Last editable user message payload, when rollback/edit is allowed. */
  get editableLastUserItem(): {
    turnId: string;
    itemId: string;
    content: string;
    attachments: OpenCodexImageAttachment[];
  } | null {
    return readEditableChatItem(this.parent.timeline.turns, this.canEditLastTurn);
  }

  /** Identity of the last editable user item without cloning content. */
  get editableLastUserItemIdentity(): {
    turnId: string;
    itemId: string;
  } | null {
    return readEditableChatItemIdentity(this.parent.timeline.turns, this.canEditLastTurn);
  }

  /** Whether a last turn edit is currently permitted. */
  private get canEditLastTurn(): boolean {
    return canEditLastTurn({
      isReadOnly: this.projectStore.isReadOnlyFromCache,
      runtime: this.parent.runtime,
      turnCount: this.parent.timeline.turns.length
    });
  }

  /**
   * Requests a fresh snapshot for this thread.
   */
  refresh(): void {
    if (!this.canRefresh) {
      return;
    }

    this.parent.runtime.beginRefresh();
    this.projectStore.openThread(this.parent.thread.id);
  }

  /**
   * Starts recovery for a thread after a recoverable backend error.
   */
  recover(): void {
    if (this.parent.runtime.isRecovering || this.projectStore.isReadOnlyFromCache) {
      return;
    }

    this.parent.runtime.beginRecovery();
    void this.root.request({
      type: "threads.recover",
      threadId: this.parent.thread.id
    });
  }

  /**
   * Starts a Codex review action for the thread.
   */
  review(): void {
    this.startAdvancedAction("thread.review");
  }

  /**
   * Starts Codex context compaction for the thread.
   */
  compact(): void {
    this.startAdvancedAction("thread.compact");
  }

  /**
   * Sends a new message or steers the active turn.
   *
   * @param text Message text.
   * @param attachments Image attachments.
   * @param references Composer references.
   * @param model Model identifier, or `null` for the backend default.
   * @param reasoningEffort Reasoning effort for the new turn.
   * @param serviceTier Optional service tier for the new turn.
   * @returns Promise resolved with whether the request was accepted.
   */
  send(
    text: string,
    attachments: OpenCodexImageAttachment[] = [],
    references: OpenCodexComposerReference[] = [],
    model: string | null = this.parent.composer.selectedModel,
    reasoningEffort: OpenCodexReasoningEffort = this.parent.composer.reasoningEffort,
    serviceTier: OpenCodexServiceTier | null = this.parent.composer.selectedServiceTier
  ): Promise<boolean> {
    const trimmedText = text.trim();
    const sourceId = this.parent.sourceId;
    const plainAttachments = cloneImageAttachments(attachments);
    const plainReferences = cloneComposerReferences(references);

    if (
      (trimmedText.length === 0 && plainAttachments.length === 0) ||
      this.projectStore.isReadOnlyFromCache ||
      sourceId === null ||
      this.parent.runtime.isStartingTurn ||
      this.parent.runtime.isEditingLastTurn ||
      this.parent.runtime.isRecovering
    ) {
      return Promise.resolve(false);
    }

    if (this.parent.runtime.isWorking) {
      if (!this.canSteerActiveTurn) {
        return Promise.resolve(false);
      }

      return this.steerActiveTurn(trimmedText, plainAttachments, plainReferences);
    }

    this.parent.runtime.beginTurnStart();
    this.createOptimisticUserTurn(trimmedText, plainAttachments);

    void this.root.request({
      type: "turn.start",
      threadId: this.parent.thread.id,
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
        this.root.appStore.errorMessage = readChatErrorMessage(error);
      });
    });

    return Promise.resolve(true);
  }

  /**
   * Requests interruption of the active Codex turn.
   */
  interrupt(): void {
    if (this.parent.runtime.activeTurnId === null) {
      return;
    }

    void this.root.request({
      type: "turn.interrupt",
      threadId: this.parent.thread.id,
      turnId: this.parent.runtime.activeTurnId
    });
  }

  /**
   * Edits the latest completed user turn and starts its replacement.
   *
   * @param text Replacement message text.
   * @param attachments Image attachments.
   * @param model Model identifier, or `null` for the backend default.
   * @param reasoningEffort Reasoning effort for the replacement turn.
   * @param references Composer references.
   * @param serviceTier Optional service tier for the replacement turn.
   * @returns Whether the edit request was accepted locally.
   */
  editLast(
    text: string,
    attachments: OpenCodexImageAttachment[] = [],
    model: string | null = this.parent.composer.selectedModel,
    reasoningEffort: OpenCodexReasoningEffort = this.parent.composer.reasoningEffort,
    references: OpenCodexComposerReference[] = [],
    serviceTier: OpenCodexServiceTier | null = this.parent.composer.selectedServiceTier
  ): boolean {
    const trimmedText = text.trim();
    const sourceId = this.parent.sourceId;
    const editableItem = this.editableLastUserItem;
    const previousTurns = this.parent.timeline.turns;
    const plainAttachments = cloneImageAttachments(attachments);

    if (
      editableItem === null ||
      (trimmedText.length === 0 && plainAttachments.length === 0) ||
      sourceId === null
    ) {
      return false;
    }

    this.parent.runtime.beginLastTurnEdit();
    this.parent.timeline.setTurns(this.parent.timeline.turns.slice(0, -1));
    this.parent.runtime.clearPendingTurn();
    this.createOptimisticUserTurn(trimmedText, plainAttachments);

    void this.root.request<{ threadId?: string }>({
      type: "turn.editLast",
      threadId: this.parent.thread.id,
      projectPath: this.projectStore.projectPath,
      sourceId,
      text: trimmedText,
      attachments: plainAttachments,
      references: cloneComposerReferences(references),
      model,
      reasoningEffort,
      serviceTier
    }).then((result) => {
      const targetThreadId = result.threadId ?? this.parent.thread.id;

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
          this.parent.runtime.clearEditStart();
          this.root.appStore.errorMessage = readChatErrorMessage(error);
        });
      });
    }).catch((error: unknown) => {
      runInAction(() => {
        this.parent.timeline.setTurns(previousTurns);
        this.parent.runtime.clearAfterEditFailure();
        this.root.appStore.errorMessage = readChatErrorMessage(error);
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

    if (
      trimmedName.length === 0 ||
      this.projectStore.isReadOnlyFromCache ||
      this.isRenaming
    ) {
      return;
    }

    this.isRenaming = true;
    this.projectStore.renameThread(this.parent.thread.id, trimmedName);
    this.parent.applyOptimisticThread({
      ...this.parent.thread,
      customTitle: trimmedName,
      title: trimmedName
    });

    void this.root.request({
      type: "threads.rename",
      threadId: this.parent.thread.id,
      name: trimmedName
    }).then(() => {
      runInAction(() => {
        this.confirmedThread = {
          ...this.confirmedThread,
          customTitle: trimmedName,
          title: trimmedName
        };
        this.isRenaming = false;
      });
    }).catch((error: unknown) => {
      runInAction(() => {
        const restoredThread = this.confirmedThread;

        this.projectStore.renameThread(this.parent.thread.id, restoredThread.title);
        this.parent.applyOptimisticThread(restoredThread);
        this.isRenaming = false;

        if (this.root.appStore.errorMessage === null) {
          this.root.appStore.errorMessage = readChatErrorMessage(error);
        }
      });
    });
  }

  /**
   * Synchronizes the confirmed thread snapshot after backend metadata changes.
   *
   * @param thread Backend-confirmed thread metadata.
   */
  syncConfirmedThread(thread: OpenCodexThread): void {
    this.confirmedThread = thread;
  }

  /**
   * Updates only confirmed composer metadata while another optimistic action is active.
   *
   * @param model Selected model identifier.
   * @param reasoningEffort Selected reasoning effort.
   */
  syncConfirmedComposerMetadata(
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null
  ): void {
    this.confirmedThread = {
      ...this.confirmedThread,
      model,
      reasoningEffort
    };
  }

  /** Whether an advanced Codex action can start a new turn now. */
  private get canRunAdvancedAction(): boolean {
    return canRunAdvancedChatAction({
      isReadOnly: this.projectStore.isReadOnlyFromCache,
      runtime: this.parent.runtime
    });
  }

  /**
   * Starts a review or compaction request with shared turn-state handling.
   *
   * @param type Advanced action request type.
   */
  private startAdvancedAction(type: "thread.review" | "thread.compact"): void {
    if (!this.canRunAdvancedAction) {
      return;
    }

    this.parent.runtime.beginTurnStart();
    const request = {
      type,
      threadId: this.parent.thread.id,
      projectPath: this.projectStore.projectPath
    } as OpenCodexRequest;

    void this.root.request(request).catch((error: unknown) => {
      runInAction(() => {
        this.parent.runtime.clearTurnStart();
        this.root.appStore.errorMessage = readChatErrorMessage(error);
      });
    });
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
    this.parent.runtime.pendingTurnId = this.parent.timeline.createOptimisticUserTurn(
      this.parent.thread.id,
      content,
      attachments
    );
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
    const turnId = this.parent.runtime.activeTurnId;

    if (turnId === null) {
      return Promise.resolve(false);
    }

    const optimisticItemId = this.parent.timeline.createOptimisticSteerItem(
      turnId,
      content,
      attachments
    );

    return this.root.request({
      type: "turn.steer",
      threadId: this.parent.thread.id,
      turnId,
      text: content,
      attachments,
      references: cloneComposerReferences(references)
    }).then(() => true).catch(() => {
      runInAction(() => {
        this.parent.timeline.removeTurnItem(turnId, optimisticItemId);
      });
      return false;
    });
  }

  /**
   * Clears optimistic turn state after a failed start-turn request.
   */
  private clearPendingTurnAfterStartFailure(): void {
    const pendingTurnId = this.parent.runtime.pendingTurnId;

    this.parent.runtime.clearAfterStartFailure();

    if (pendingTurnId === null) {
      return;
    }

    this.parent.timeline.removePendingTurn(pendingTurnId);
  }
}
