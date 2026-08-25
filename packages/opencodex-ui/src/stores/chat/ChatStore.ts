/**
 * Holds the observable UI state for one chat loaded in memory.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexApproval,
  OpenCodexMessage,
  OpenCodexReasoningEffort,
  OpenCodexThread,
  OpenCodexThreadRuntimeStatus,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "../project/ProjectStore";
import type { RootStore } from "../RootStore";
import { ChatActionsStore } from "./ChatActionsStore";
import { ChatComposerStore } from "./ChatComposerStore";
import { ChatRuntimeStore } from "./ChatRuntimeStore";
import { ChatTimelineStore } from "./ChatTimelineStore";
import { hasActiveRunningTurn } from "./chatTurnUtils";
import { readChatErrorMessage } from "./chatErrorMessage";

export type { ChatTimelineViewState } from "./ChatTimelineStore";

/**
 * Stores the loaded turns and cross-domain event state for a single chat.
 */
export class ChatStore {
  /** Thread metadata for this chat. */
  thread: OpenCodexThread;
  /** Approvals attached to this chat. */
  approvals: OpenCodexApproval[] = [];
  /** User-triggered commands and optimistic mutations for this chat. */
  readonly actions: ChatActionsStore;
  /** Model settings, draft, and attachments for this chat. */
  readonly composer: ChatComposerStore;
  /** Turn timeline, pagination state, and per-turn rendering stores. */
  readonly timeline: ChatTimelineStore;
  /** Runtime flags, transitions, and status polling for this chat. */
  readonly runtime: ChatRuntimeStore;

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
    this.composer = new ChatComposerStore(this);
    this.timeline = new ChatTimelineStore(this, projectStore, root);
    this.runtime = new ChatRuntimeStore(this);
    this.actions = new ChatActionsStore(this, projectStore, root);
    makeAutoObservable<
      ChatStore,
      | "projectStore"
      | "root"
      | "actions"
      | "composer"
      | "timeline"
      | "runtime"
    >(this, {
      projectStore: false,
      root: false,
      actions: false,
      composer: false,
      timeline: false,
      runtime: false
    });
  }

  /**
   * Returns the Codex source that owns this chat.
   *
   * @returns Resolved source identifier, or `null` when unavailable.
   */
  get sourceId(): string | null {
    return this.projectStore.resolveThreadSourceId(this.thread);
  }

  /** Application store used by the composer to resolve current model options. */
  get appStore(): RootStore["appStore"] {
    return this.root.appStore;
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
    this.applyThread(thread, true);
  }

  /**
   * Applies thread metadata and optionally records it as backend-confirmed.
   *
   * @param thread Thread metadata to apply.
   * @param updateConfirmed Whether this snapshot may be used for rollback.
   *
   * @returns Nothing.
   */
  private applyThread(thread: OpenCodexThread, updateConfirmed: boolean): void {
    this.thread = this.projectStore.ensureThreadSource(thread);
    this.projectStore.registerChatRoute(this);

    if (updateConfirmed) {
      this.actions.syncConfirmedThread(this.thread);
    }

    this.composer.applyThreadMetadata();
  }

  /**
   * Applies thread metadata for an optimistic action without confirming it.
   *
   * @param thread Optimistic thread metadata.
   *
   * @returns Nothing.
   */
  applyOptimisticThread(thread: OpenCodexThread): void {
    this.applyThread(thread, false);
  }

  /**
   * Applies and persists composer metadata on the visible and confirmed threads.
   *
   * @param model Selected model identifier.
   * @param reasoningEffort Selected reasoning effort.
   *
   * @returns Nothing.
   */
  applyComposerThreadMetadata(
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null
  ): void {
    const thread = {
      ...this.thread,
      model,
      reasoningEffort
    };

    this.thread = thread;
    this.actions.syncConfirmedComposerMetadata(model, reasoningEffort);
    this.projectStore.upsertThread(thread);

    void this.root.request({
      type: "threads.updateComposerSettings",
      threadId: thread.id,
      model,
      reasoningEffort
    }).catch((error: unknown) => {
      runInAction(() => {
        this.root.appStore.errorMessage = readChatErrorMessage(error);
      });
    });
  }

  /**
   * Resets the transient chat state before loading a different snapshot.
   *
   * @returns Nothing.
   */
  clearLoadedState(): void {
    this.timeline.clearLoadedState();
    this.runtime.reset();
  }

  /**
   * Releases timers owned by this chat store.
   */
  dispose(): void {
    this.runtime.dispose();
  }

  applyOpenedSnapshot(
    turns: OpenCodexTurn[],
    source: "thread.opened" | "thread.created",
    hasMoreOlderMessages: boolean,
    shouldMergeTurns: boolean
  ): void {
    this.runtime.applyOpenedSnapshot();
    this.timeline.isLoadingOlderMessages = false;
    this.timeline.hasMoreOlderMessages = source === "thread.opened" ? hasMoreOlderMessages : false;
    this.timeline.applySnapshot(turns, shouldMergeTurns ? "merge" : "replace");

    if (!shouldMergeTurns) {
      this.timeline.scrollToBottomVersion += 1;
    }

    this.root.appStore.errorMessage = null;
    this.markSeen();
  }

  /**
   * Completes recovery and restores running state when a turn is still active.
   */
  completeRecovery(): void {
    const hasRecoveredRunningTurn = hasActiveRunningTurn(
      this.timeline.turns,
      this.runtime.activeTurnId
    );
    this.runtime.completeRecovery(hasRecoveredRunningTurn);
  }

  /**
   * Applies a backend-confirmed thread rename.
   *
   * @param name New thread title.
   */
  applyRename(name: string): void {
    this.projectStore.renameThread(this.thread.id, name);
    this.setThread({ ...this.thread, customTitle: name, title: name });
    this.actions.isRenaming = false;
  }

  /**
   * Applies a message-started notification.
   *
   * @param message Started message item.
   */
  applyMessageStarted(message: OpenCodexMessage): void {
    this.runtime.applyMessageStarted();
    const pendingTurnId = this.timeline.applyMessageStarted(message, this.runtime.pendingTurnId);
    this.runtime.setPendingTurnId(pendingTurnId);
    this.timeline.scrollToBottomVersion += 1;
  }

  /**
   * Applies a turn-started notification from Codex.
   *
   * @param turnId Started turn identifier.
   */
  applyTurnStarted(turnId: string): void {
    this.runtime.applyTurnStarted(turnId);
    const pendingTurnId = this.timeline.movePendingTurnToStartedTurn(
      turnId,
      this.runtime.pendingTurnId
    );
    this.runtime.finalizeTurnStarted(pendingTurnId);
  }

  /**
   * Applies a turn-completed notification when it matches the active turn.
   *
   * @param turnId Completed turn identifier.
   * @param durationMs Optional turn duration.
   * @param turnStatus Terminal status reported by Codex, when available.
   * @param errorMessage Error reported by Codex, when available.
   */
  applyTurnCompleted(
    turnId: string,
    durationMs: number | null,
    turnStatus?: string,
    errorMessage?: string
  ): void {
    this.timeline.applyTurnDuration(turnId, durationMs);

    const completedTurn = this.timeline.turns.find((turn) => turn.id === turnId);

    if (completedTurn !== undefined && turnStatus !== undefined && turnStatus.length > 0) {
      completedTurn.status = turnStatus;
    }

    if (completedTurn !== undefined && errorMessage !== undefined && errorMessage.length > 0) {
      completedTurn.errorMessage = errorMessage;
    }

    if (this.runtime.activeTurnId !== null && this.runtime.activeTurnId !== turnId) {
      return;
    }

    const shouldMarkUnseen = !this.isVisibleChat();

    this.runtime.applyTurnCompleted(shouldMarkUnseen);
  }

  /**
   * Marks the latest completed work as seen.
   *
   * @returns Nothing.
   */
  markSeen(): void {
    this.runtime.markSeen();
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
   * Reads the current runtime status for this chat.
   *
   * @returns Promise resolved with the current runtime status.
   */
  async readRuntimeStatus(): Promise<OpenCodexThreadRuntimeStatus> {
    return this.root.request<OpenCodexThreadRuntimeStatus>({
      type: "threads.runtimeStatus.read",
      threadId: this.thread.id
    });
  }

  /**
   * Applies a runtime status response for this thread.
   *
   * @param status Runtime status response.
   */
  applyRuntimeStatus(status: OpenCodexThreadRuntimeStatus): void {
    if (
      !this.runtime.isWorking ||
      this.runtime.activeTurnId === null ||
      status.threadId !== this.thread.id
    ) {
      return;
    }

    if (status.isActive !== false) {
      return;
    }

    this.applyRuntimeIdle();
  }

  /** Whether the owning project only exposes cached, read-only data. */
  get isReadOnlyFromCache(): boolean {
    return this.projectStore.isReadOnlyFromCache;
  }

  /**
   * Marks the chat idle after runtime status says no turn is active.
   */
  private applyRuntimeIdle(): void {
    const shouldMarkUnseen = !this.isVisibleChat();

    this.runtime.applyRuntimeIdle(shouldMarkUnseen);
    this.runtime.beginRefresh();
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

}
