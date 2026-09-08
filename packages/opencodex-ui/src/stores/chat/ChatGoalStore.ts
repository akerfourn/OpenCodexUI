/** Holds UI state and lifecycle metadata for the native Codex goal of a chat. */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexThreadGoal,
  OpenCodexThreadGoalPatch,
  OpenCodexThreadGoalStatus
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../RootStore";
import type { ChatStore } from "./ChatStore";
import {
  clearPersistedGoal,
  hasPersistedDraftGoal,
  hasPersistedStartedGoal,
  persistDraftGoal,
  persistStartedGoal
} from "./chatGoalStartedPersistence";
import { readChatErrorMessage } from "./chatErrorMessage";

const GOAL_STATUSES: readonly OpenCodexThreadGoalStatus[] = [
  "active",
  "paused",
  "blocked",
  "usageLimited",
  "budgetLimited",
  "complete"
];

/** Manages native goal reads and mutations for one loaded chat. */
export class ChatGoalStore {
  /** Goal currently known by the renderer. */
  goal: OpenCodexThreadGoal | null = null;
  /** Whether this goal has been explicitly started in this or an earlier UI session. */
  hasStarted = false;
  /** In-flight goal read shared by the header and the goal dialog. */
  private loadingPromise: Promise<void> | null = null;
  /** Whether a goal read is currently in flight. */
  isLoading = false;
  /** Whether a goal mutation is currently in flight. */
  isSaving = false;
  /** Last goal-specific error shown by the dialog. */
  error: string | null = null;
  /** Whether at least one read has completed for this chat. */
  hasLoaded = false;

  /** Creates native goal state for a chat. */
  constructor(
    private readonly chatStore: ChatStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ChatGoalStore, "chatStore" | "root" | "loadingPromise">(this, {
      chatStore: false,
      root: false,
      loadingPromise: false
    }, { autoBind: true });
  }

  /**
   * Loads the native goal from the source app-server.
   *
   * @param force Whether to ignore a previously loaded snapshot.
   * @returns Promise resolved when the read finishes.
   */
  async load(force = false): Promise<void> {
    if (this.loadingPromise !== null) {
      await this.loadingPromise;
      return;
    }

    if (this.hasLoaded && !force) {
      return;
    }

    const loadingPromise = this.loadFromSource();
    this.loadingPromise = loadingPromise;

    try {
      await loadingPromise;
    } finally {
      if (this.loadingPromise === loadingPromise) {
        this.loadingPromise = null;
      }
    }
  }

  /** Reads the goal snapshot for the current source. */
  private async loadFromSource(): Promise<void> {
    const sourceId = this.chatStore.sourceId;

    if (sourceId === null) {
      runInAction(() => {
        this.goal = null;
        this.hasStarted = false;
        this.error = null;
        this.hasLoaded = true;
      });
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      const goal = await this.root.request<OpenCodexThreadGoal | null>({
        type: "threads.goal.read",
        threadId: this.chatStore.thread.id,
        sourceId
      });
      const normalizedGoal = isOpenCodexThreadGoal(goal) ? goal : null;

      runInAction(() => {
        this.goal = normalizedGoal;

        if (normalizedGoal === null) {
          this.hasStarted = false;
          this.clearPersistedGoalState();
        } else {
          const hasPersistedDraft = this.readPersistedDraftState();
          this.hasStarted = this.hasStarted || this.readPersistedStartedState()
            || isStartedGoalStatus(normalizedGoal.status)
            || hasGoalUsage(normalizedGoal)
            || (normalizedGoal.status === "paused" && !hasPersistedDraft);

          if (this.hasStarted) {
            this.persistStartedState();
          } else {
            this.persistDraftState();
          }
        }

        this.hasLoaded = true;
      });

      if (normalizedGoal !== null) {
        this.chatStore.syncProjectGoalFromNative(normalizedGoal);
      }
    } catch (error: unknown) {
      runInAction(() => {
        this.error = readChatErrorMessage(error);
        this.hasLoaded = true;
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  /**
   * Creates or updates the native goal.
   *
   * @param patch Goal fields to send to Codex.
   * @returns Whether the operation succeeded.
   */
  async save(patch: OpenCodexThreadGoalPatch): Promise<boolean> {
    const sourceId = this.chatStore.sourceId;

    if (sourceId === null || this.isSaving) {
      return false;
    }

    this.isSaving = true;
    this.error = null;

    try {
      const goal = await this.root.request<OpenCodexThreadGoal>({
        type: "threads.goal.set",
        threadId: this.chatStore.thread.id,
        sourceId,
        ...patch
      });

      if (!isOpenCodexThreadGoal(goal)) {
        throw new Error("Réponse de goal invalide reçue depuis Codex.");
      }

      runInAction(() => {
        this.goal = goal;
        this.hasStarted = this.hasStarted || isStartedGoalStatus(goal.status) || hasGoalUsage(goal);

        if (this.hasStarted) {
          this.persistStartedState();
        } else if (goal.status === "paused") {
          this.persistDraftState();
        }

        this.hasLoaded = true;
      });
      return true;
    } catch (error: unknown) {
      runInAction(() => {
        this.error = readChatErrorMessage(error);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /** Updates only the native goal status. */
  async updateStatus(status: OpenCodexThreadGoalStatus): Promise<boolean> {
    return await this.save({ status });
  }

  /** Clears the native goal from Codex and the local UI state. */
  async clear(): Promise<boolean> {
    const sourceId = this.chatStore.sourceId;

    if (sourceId === null || this.isSaving) {
      return false;
    }

    this.isSaving = true;
    this.error = null;

    try {
      const result = await this.root.request<{ cleared: boolean }>({
        type: "threads.goal.clear",
        threadId: this.chatStore.thread.id,
        sourceId
      });

      if (result.cleared) {
        runInAction(() => {
          this.goal = null;
          this.hasStarted = false;
          this.clearPersistedGoalState();
          this.hasLoaded = true;
        });
      }

      return result.cleared;
    } catch (error: unknown) {
      runInAction(() => {
        this.error = readChatErrorMessage(error);
      });
      return false;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /** Applies a goal received asynchronously from the app-server. */
  applyGoal(goal: OpenCodexThreadGoal): void {
    if (goal.threadId !== this.chatStore.thread.id) {
      return;
    }

    this.goal = goal;
    this.hasStarted = this.hasStarted || isStartedGoalStatus(goal.status) || hasGoalUsage(goal);

    if (this.hasStarted) {
      this.persistStartedState();
    } else if (goal.status === "paused") {
      this.persistDraftState();
    }

    this.error = null;
    this.hasLoaded = true;
    this.chatStore.syncProjectGoalFromNative(goal);
  }

  /** Applies a native goal-cleared notification. */
  clearFromEvent(threadId: string): void {
    if (threadId !== this.chatStore.thread.id) {
      return;
    }

    this.goal = null;
    this.hasStarted = false;
    this.clearPersistedGoalState();
    this.error = null;
    this.hasLoaded = true;
  }

  /** Reads the persisted started marker for the current source and thread. */
  private readPersistedStartedState(): boolean {
    const sourceId = this.chatStore.sourceId;

    return sourceId !== null && hasPersistedStartedGoal(sourceId, this.chatStore.thread.id);
  }

  /** Persists the started marker without making it part of the native goal payload. */
  private persistStartedState(): void {
    const sourceId = this.chatStore.sourceId;

    if (sourceId !== null) {
      persistStartedGoal(sourceId, this.chatStore.thread.id);
    }
  }

  /** Persists the explicit draft state for a goal that has not started yet. */
  private persistDraftState(): void {
    const sourceId = this.chatStore.sourceId;

    if (sourceId !== null) {
      persistDraftGoal(sourceId, this.chatStore.thread.id);
    }
  }

  /** Reads whether the current goal was explicitly saved as a draft. */
  private readPersistedDraftState(): boolean {
    const sourceId = this.chatStore.sourceId;

    return sourceId !== null && hasPersistedDraftGoal(sourceId, this.chatStore.thread.id);
  }

  /** Removes the local lifecycle marker when the native goal no longer exists. */
  private clearPersistedGoalState(): void {
    const sourceId = this.chatStore.sourceId;

    if (sourceId !== null) {
      clearPersistedGoal(sourceId, this.chatStore.thread.id);
    }
  }
}

/** Identifies statuses that prove the goal has started processing. */
function isStartedGoalStatus(status: OpenCodexThreadGoalStatus): boolean {
  return status !== "paused";
}

/** Uses native counters to recover older paused goals created before local markers existed. */
function hasGoalUsage(goal: OpenCodexThreadGoal): boolean {
  return goal.tokensUsed > 0 || goal.timeUsedSeconds > 0;
}

/** Checks the response shape before it enters observable UI state. */
function isOpenCodexThreadGoal(value: unknown): value is OpenCodexThreadGoal {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const goal = value as Partial<OpenCodexThreadGoal>;

  return (
    typeof goal.threadId === "string" &&
    typeof goal.objective === "string" &&
    typeof goal.status === "string" &&
    GOAL_STATUSES.includes(goal.status as OpenCodexThreadGoalStatus) &&
    (goal.tokenBudget === null || typeof goal.tokenBudget === "number") &&
    typeof goal.tokensUsed === "number" &&
    typeof goal.timeUsedSeconds === "number" &&
    typeof goal.createdAt === "number" &&
    typeof goal.updatedAt === "number"
  );
}
