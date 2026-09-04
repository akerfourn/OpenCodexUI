/**
 * Holds the observable turn timeline for one loaded chat.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexActivity,
  OpenCodexImageAttachment,
  OpenCodexMessage,
  OpenCodexMessagePhase,
  OpenCodexThreadTokenUsage,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "../project/ProjectStore";
import type { RootStore } from "../RootStore";
import type { ChatStore } from "./ChatStore";
import { ChatTurnStore } from "./ChatTurnStore";
import { appendActivityItem } from "./chatActivityMutations";
import {
  applyThreadTurns,
  applyTurnDuration,
  findOrCreateTurn,
  movePlanItemsToLatestSubTurn,
  movePendingTurnToStartedTurn,
  upsertPendingUserTurn
} from "./chatTurnMutations";
import { readLoadOlderResult } from "./chatTimelinePagination";

/** Reading state retained while a chat timeline is not mounted. */
export interface ChatTimelineViewState {
  visibleTurnCount: number;
  turnCount: number;
  scrollTop: number;
  isPinnedToBottom: boolean;
}

/**
 * Stores turns, pagination and reading state for a single chat.
 */
export class ChatTimelineStore {
  /** Raw turns currently loaded in memory. */
  turns: OpenCodexTurn[] = [];
  /** Per-turn stores derived from `turns` for isolated rendering. */
  turnStores: ChatTurnStore[] = [];
  /** Whether older turns are available from the backend/cache. */
  hasMoreOlderMessages = false;
  /** Whether an older-turn page is loading. */
  isLoadingOlderMessages = false;
  /** Latest token usage snapshot for the thread context. */
  tokenUsage: OpenCodexThreadTokenUsage | null = null;
  /** Incremented when older messages are prepended so the UI can preserve scroll. */
  olderMessagesPrependVersion = 0;
  /** Incremented when the UI should scroll this chat to the bottom. */
  scrollToBottomVersion = 0;
  /** Timeline reading state retained while this chat view is unmounted. */
  timelineViewState: ChatTimelineViewState | null = null;
  /** Turn stores keyed by raw turn id. */
  private turnStoresById = new Map<string, ChatTurnStore>();
  /** Token usage snapshots retained while turns are loaded or updated live. */
  private turnTokenUsageById = new Map<string, OpenCodexThreadTokenUsage>();

  /**
   * Creates a timeline attached to its owning chat.
   *
   * @param parent Owning chat used to resolve the current thread dynamically.
   * @param projectStore Project used for pagination guards and source-aware state.
   * @param root Root store used for paginated timeline requests.
   */
  constructor(
    private readonly parent: ChatStore,
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<
      ChatTimelineStore,
      "parent" | "projectStore" | "root" | "turnStoresById" | "turnTokenUsageById"
    >(this, {
      parent: false,
      projectStore: false,
      root: false,
      turnStoresById: false,
      turnTokenUsageById: false
    }, { autoBind: true });
  }

  /**
   * Retains the timeline window and scroll position across view remounts.
   *
   * @param state Current timeline reading state.
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
   * Resets transient timeline state before loading a different snapshot.
   */
  clearLoadedState(): void {
    this.setTurns([]);
    this.tokenUsage = null;
    this.turnTokenUsageById.clear();
    this.hasMoreOlderMessages = false;
    this.isLoadingOlderMessages = false;
  }

  /**
   * Replaces raw turns and reconciles per-turn stores.
   *
   * @param turns Raw turns.
   */
  setTurns(turns: OpenCodexTurn[]): void {
    this.turns = turns.map((turn) => this.attachKnownTokenUsage(
      movePlanItemsToLatestSubTurn(turn)
    ));
    this.syncTurnStores();
  }

  /**
   * Appends one raw turn and creates its turn store.
   *
   * @param turn Raw turn.
   */
  appendTurn(turn: OpenCodexTurn): void {
    const enrichedTurn = this.attachKnownTokenUsage(movePlanItemsToLatestSubTurn(turn));
    this.turns.push(enrichedTurn);
    this.upsertTurnStore(enrichedTurn);
  }

  /**
   * Merges an opened or synchronized snapshot with live timeline data.
   *
   * @param turns Incoming turns.
   * @param strategy Replace or incremental merge mode.
   */
  applySnapshot(turns: OpenCodexTurn[], strategy: "replace" | "merge"): void {
    applyThreadTurns(this, turns, strategy);
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
   * Applies an incremental background turn sync.
   *
   * @param turns Synced turns.
   * @param hasMoreOlderMessages Whether more older turns remain.
   */
  applyTurnsSynced(turns: OpenCodexTurn[], hasMoreOlderMessages: boolean): void {
    applyThreadTurns(this, turns, "merge");
    this.hasMoreOlderMessages = hasMoreOlderMessages;
  }

  /**
   * Requests the next page of older turns.
   */
  loadOlderMessages(): void {
    if (
      this.isLoadingOlderMessages ||
      !this.hasMoreOlderMessages ||
      this.projectStore.threadListStore.loadingThreadId !== null
    ) {
      return;
    }

    this.isLoadingOlderMessages = true;
    void this.root.request({
      type: "threads.loadOlder",
      threadId: this.parent.thread.id
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
   * Applies token usage for this thread and enriches the matching turn.
   *
   * @param usage Token usage snapshot.
   */
  applyTokenUsage(usage: OpenCodexThreadTokenUsage | null): void {
    this.tokenUsage = usage;

    if (usage === null) {
      return;
    }

    this.turnTokenUsageById.set(usage.turnId, usage);
    const turn = this.turns.find((entry) => entry.id === usage.turnId);

    if (turn === undefined) {
      return;
    }

    this.setTurns(this.turns.map((entry) => (
      entry.id === usage.turnId
        ? { ...entry, tokenUsage: usage }
        : entry
    )));
  }

  /**
   * Adds the started user message to the pending timeline turn.
   *
   * @param message Started message item.
   * @param pendingTurnId Current optimistic turn identifier.
   * @returns Unchanged pending id when reused, or the newly created id.
   */
  applyMessageStarted(
    message: OpenCodexMessage,
    pendingTurnId: string | null
  ): string | null {
    return upsertPendingUserTurn(
      this,
      this.parent.thread.id,
      message,
      pendingTurnId
    );
  }

  /**
   * Appends one assistant streaming delta.
   *
   * @param turnId Turn identifier.
   * @param itemId Message identifier.
   * @param delta Text delta.
   * @param phase Optional message phase.
   */
  appendAssistantDelta(
    turnId: string,
    itemId: string,
    delta: string,
    phase: OpenCodexMessagePhase | null
  ): void {
    const turn = findOrCreateTurn(this, this.parent.thread.id, turnId);
    turn.status = "running";
    const existing = turn.items.find((item) => item.id === itemId);

    if (existing !== undefined) {
      const shouldRefreshForFirstContent = existing.content.length === 0 && delta.length > 0;
      existing.content += delta;

      const shouldRefreshForPhase = (
        existing.phase === undefined || existing.phase === null
      ) && phase !== null && phase !== undefined;

      if (shouldRefreshForPhase) {
        existing.phase = phase;
      }

      if (shouldRefreshForFirstContent || shouldRefreshForPhase) {
        this.refreshTurnStructure(turnId);
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
    this.refreshTurnStructure(turnId);
  }

  /**
   * Applies a reasoning/activity update to the active timeline turn.
   *
   * @param activity Activity item.
   * @param activeTurnId Current runtime turn id.
   * @param pendingTurnId Optimistic turn id, when present.
   */
  applyActivityUpdated(
    activity: OpenCodexActivity,
    activeTurnId: string | null,
    pendingTurnId: string | null
  ): void {
    const turnId = activity.title ?? activeTurnId ?? pendingTurnId;
    const structureChanged = appendActivityItem(
      this,
      activity,
      turnId,
      this.parent.thread.id
    );

    if (structureChanged && turnId !== null) {
      this.refreshTurnStructure(turnId);
    }
  }

  /**
   * Applies a completed turn duration to a stored turn.
   *
   * @param turnId Turn identifier.
   * @param durationMs Duration in milliseconds, or `null`.
   */
  applyTurnDuration(turnId: string, durationMs: number | null): void {
    applyTurnDuration(this, turnId, durationMs);
  }

  /**
   * Creates a temporary user turn before Codex returns the real turn id.
   *
   * @param threadId Owning thread identifier.
   * @param content User message content.
   * @param attachments Image attachments.
   * @returns New pending turn id.
   */
  createOptimisticUserTurn(
    threadId: string,
    content: string,
    attachments: OpenCodexImageAttachment[]
  ): string {
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

    this.appendTurn(created);
    this.scrollToBottomVersion += 1;
    return turnId;
  }

  /**
   * Adds an optimistic steering item to the active turn.
   *
   * @param turnId Active turn identifier.
   * @param content Steering message content.
   * @param attachments Image attachments.
   * @returns Optimistic item identifier.
   */
  createOptimisticSteerItem(
    turnId: string,
    content: string,
    attachments: OpenCodexImageAttachment[]
  ): string {
    const turn = findOrCreateTurn(this, this.parent.thread.id, turnId);
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
    turn.items = movePlanItemsToLatestSubTurn(turn).items;
    this.refreshTurnStructure(turnId);
    this.scrollToBottomVersion += 1;
    return itemId;
  }

  /**
   * Removes one optimistic item after its request fails.
   *
   * @param turnId Turn identifier.
   * @param itemId Item identifier.
   */
  removeTurnItem(turnId: string, itemId: string): void {
    const turn = this.turns.find((entry) => entry.id === turnId);

    if (turn === undefined) {
      return;
    }

    const nextItems = turn.items.filter((item) => item.id !== itemId);

    if (nextItems.length === turn.items.length) {
      return;
    }

    turn.items = nextItems;
    turn.items = movePlanItemsToLatestSubTurn(turn).items;
    this.refreshTurnStructure(turnId);
  }

  /**
   * Moves a pending turn to the Codex turn id while preserving runtime ownership.
   *
   * @param turnId Confirmed Codex turn identifier.
   * @param pendingTurnId Current optimistic turn identifier.
   * @returns Unchanged pending id unless a direct rename confirms it.
   */
  movePendingTurnToStartedTurn(turnId: string, pendingTurnId: string | null): string | null {
    return movePendingTurnToStartedTurn(
      this,
      this.parent.thread.id,
      pendingTurnId,
      turnId
    );
  }

  /**
   * Finds or creates a raw turn for timeline updates.
   *
   * @param turnId Turn identifier.
   * @returns Existing or newly created turn.
   */
  findOrCreateTurn(turnId: string): OpenCodexTurn {
    return findOrCreateTurn(this, this.parent.thread.id, turnId);
  }

  /**
   * Removes an optimistic pending turn after a failed start request.
   *
   * @param pendingTurnId Pending turn identifier.
   */
  removePendingTurn(pendingTurnId: string | null): void {
    if (pendingTurnId === null) {
      return;
    }

    this.setTurns(this.turns.filter((turn) => turn.id !== pendingTurnId));
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

      if (existingStore !== undefined && existingStore.turn !== turn) {
        turnStore.setTurn(turn);
      }

      nextStores.push(turnStore);
      nextStoresById.set(turn.id, turnStore);
    }

    this.turnStores = nextStores;
    this.turnStoresById = nextStoresById;
  }

  /**
   * Adds or updates the store for one raw turn.
   *
   * @param turn Raw turn.
   */
  private upsertTurnStore(turn: OpenCodexTurn): void {
    const existingStore = this.turnStoresById.get(turn.id);

    if (existingStore !== undefined) {
      if (existingStore.turn !== turn) {
        existingStore.setTurn(turn);
      }
      return;
    }

    const turnStore = new ChatTurnStore(turn);
    this.turnStoresById.set(turn.id, turnStore);
    this.turnStores.push(turnStore);
  }

  /** Rebuilds one cached turn structure after a live structural mutation. */
  refreshTurnStructure(turnId: string): void {
    this.turnStoresById.get(turnId)?.refreshStructure();
  }

  /**
   * Adds known token usage to a turn when a snapshot omits it.
   *
   * @param turn Turn to enrich.
   * @returns Original or enriched turn.
   */
  private attachKnownTokenUsage(turn: OpenCodexTurn): OpenCodexTurn {
    if (turn.tokenUsage !== undefined) {
      if (turn.tokenUsage === null) {
        this.turnTokenUsageById.delete(turn.id);
      } else {
        this.turnTokenUsageById.set(turn.id, turn.tokenUsage);
      }

      return turn;
    }

    const knownUsage = this.turnTokenUsageById.get(turn.id);

    if (knownUsage === undefined) {
      return turn;
    }

    return {
      ...turn,
      tokenUsage: knownUsage
    };
  }
}
