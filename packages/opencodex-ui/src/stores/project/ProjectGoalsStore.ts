/** Holds the project-level goal catalogue state for the UI. */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexProjectGoal,
  OpenCodexProjectGoalCreateInput,
  OpenCodexProjectGoalExecutionPatch,
  OpenCodexProjectGoalPatch,
  OpenCodexThreadGoal
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "../RootStore";
import type { ChatStore } from "../chat/ChatStore";

/** Goal input used by the catalogue create form. */
export type ProjectGoalFormInput = Omit<OpenCodexProjectGoalCreateInput, "projectId">;

/** Stores project goals independently from the currently selected chat. */
export class ProjectGoalsStore {
  /** Goals loaded for the owning project. */
  goals: OpenCodexProjectGoal[] = [];
  /** Whether archived goals should be included on the next load. */
  includeArchived = false;
  /** Whether the catalogue is currently loading. */
  isLoading = false;
  /** Whether a catalogue mutation is currently in flight. */
  isSaving = false;
  /** Whether at least one catalogue read has completed for this project. */
  hasLoaded = false;
  /** Last catalogue operation error shown by the UI. */
  errorMessage: string | null = null;

  /** Returns whether one unarchived goal needs attention in the project. */
  get hasAttention(): boolean {
    return this.runningGoals.length > 0;
  }

  /**
   * Creates a project goal store.
   *
   * @param projectStore Owning project store.
   * @param root Root store used for backend requests.
   */
  constructor(
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ProjectGoalsStore, "projectStore" | "root">(
      this,
      {
        projectStore: false,
        root: false
      },
      {
        autoBind: true
      }
    );
  }

  /** Returns goals that are not archived. */
  get currentGoals(): OpenCodexProjectGoal[] {
    return this.goals.filter((goal) => !goal.isArchived);
  }

  /** Returns archived goals loaded for the project. */
  get archivedGoals(): OpenCodexProjectGoal[] {
    return this.goals.filter((goal) => goal.isArchived);
  }

  /** Returns goals whose native execution is currently resumable or active. */
  get runningGoals(): OpenCodexProjectGoal[] {
    return this.currentGoals.filter((goal) => (
      goal.status === "active" || goal.status === "paused"
    ));
  }

  /**
   * Loads project goals from the local catalogue.
   *
   * @param includeArchived Whether archived goals should be included.
   * @returns Promise resolved when the catalogue has been loaded.
   */
  async loadGoals(includeArchived = this.includeArchived): Promise<void> {
    this.includeArchived = includeArchived;
    this.isLoading = true;
    this.hasLoaded = false;
    this.errorMessage = null;

    try {
      const goals = await this.root.request<OpenCodexProjectGoal[]>({
        type: "projectGoals.list",
        projectId: this.projectStore.project.id,
        includeArchived
      });

      runInAction(() => {
        this.goals = goals;
      });
    } catch (error) {
      this.reportError(error);
    } finally {
      runInAction(() => {
        this.isLoading = false;
        this.hasLoaded = true;
      });
    }
  }

  /** Synchronizes a loaded native goal when its project catalogue entry exists. */
  async syncNativeGoal(chatStore: ChatStore, nativeGoal: OpenCodexThreadGoal): Promise<void> {
    const catalogueGoal = this.goals.find((goal) => (
      !goal.isArchived && goal.threadId === chatStore.thread.id
    ));

    if (catalogueGoal === undefined || !needsNativeGoalSync(catalogueGoal, nativeGoal)) {
      return;
    }

    await this.updateExecution(catalogueGoal.id, createNativeExecutionPatch(
      nativeGoal,
      chatStore,
      this.projectStore,
      catalogueGoal.launchedAt
    ));
  }

  /** Imports one legacy native goal that predates the project catalogue. */
  async importNativeGoal(chatStore: ChatStore): Promise<void> {
    // The chat header may already have cached an earlier `null` snapshot (or
    // a non-terminal snapshot). Migration must read the authoritative native
    // state so a completed goal is not silently skipped.
    await chatStore.goal.load(true);

    if (chatStore.goal.error !== null || chatStore.goal.goal === null) {
      return;
    }

    const nativeGoal = chatStore.goal.goal;
    const existingGoal = await this.findGoalForThread(chatStore.thread.id);

    if (existingGoal !== undefined) {
      if (!existingGoal.isArchived) {
        await this.syncNativeGoal(chatStore, nativeGoal);
      }
      return;
    }

    const importedGoal = await this.createGoal({
      name: "",
      objective: nativeGoal.objective,
      tokenBudget: nativeGoal.tokenBudget
    });

    await this.updateExecution(importedGoal.id, createNativeExecutionPatch(
      nativeGoal,
      chatStore,
      this.projectStore,
      null
    ));
  }

  /** Creates a draft in the project catalogue. */
  async createGoal(input: ProjectGoalFormInput): Promise<OpenCodexProjectGoal> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      const goal = await this.root.request<OpenCodexProjectGoal>({
        type: "projectGoals.create",
        projectId: this.projectStore.project.id,
        ...normalizeGoalFormInput(input)
      });

      runInAction(() => {
        this.upsertGoal(goal);
      });
      return goal;
    } catch (error) {
      this.reportError(error);
      throw error;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /** Updates editable fields in a project goal. */
  async updateGoal(
    goalId: string,
    patch: OpenCodexProjectGoalPatch
  ): Promise<OpenCodexProjectGoal> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      const goal = await this.root.request<OpenCodexProjectGoal>({
        type: "projectGoals.update",
        goalId,
        patch: normalizeGoalPatch(patch)
      });

      runInAction(() => {
        this.upsertGoal(goal);
      });
      return goal;
    } catch (error) {
      this.reportError(error);
      throw error;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /** Synchronizes native execution metadata without changing the definition. */
  async updateExecution(
    goalId: string,
    patch: OpenCodexProjectGoalExecutionPatch
  ): Promise<OpenCodexProjectGoal> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      const goal = await this.root.request<OpenCodexProjectGoal>({
        type: "projectGoals.execution.update",
        goalId,
        patch: normalizeExecutionPatch(patch)
      });

      runInAction(() => {
        this.upsertGoal(goal);
      });
      return goal;
    } catch (error) {
      this.reportError(error);
      throw error;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /** Archives a completed or otherwise stopped project goal. */
  async archiveGoal(goalId: string): Promise<OpenCodexProjectGoal> {
    return await this.mutateGoal("projectGoals.archive", goalId);
  }

  /** Restores an archived project goal. */
  async unarchiveGoal(goalId: string): Promise<OpenCodexProjectGoal> {
    return await this.mutateGoal("projectGoals.unarchive", goalId);
  }

  /** Deletes a draft project goal. */
  async deleteGoal(goalId: string): Promise<void> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      await this.root.request({
        type: "projectGoals.delete",
        goalId
      });

      runInAction(() => {
        this.goals = this.goals.filter((goal) => goal.id !== goalId);
      });
    } catch (error) {
      this.reportError(error);
      throw error;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /** Applies a goal returned by a mutation while respecting the archive filter. */
  private upsertGoal(goal: OpenCodexProjectGoal): void {
    const shouldDisplay = this.includeArchived || !goal.isArchived;
    const remainingGoals = this.goals.filter((entry) => entry.id !== goal.id);

    this.goals = shouldDisplay ? [goal, ...remainingGoals] : remainingGoals;
  }

  /** Finds a goal for a chat, including archived history when needed for migration. */
  private async findGoalForThread(threadId: string): Promise<OpenCodexProjectGoal | undefined> {
    const loadedGoal = this.goals.find((goal) => goal.threadId === threadId);

    if (loadedGoal !== undefined || this.includeArchived) {
      return loadedGoal;
    }

    const allGoals = await this.root.request<OpenCodexProjectGoal[]>({
      type: "projectGoals.list",
      projectId: this.projectStore.project.id,
      includeArchived: true
    });
    const matchingGoal = allGoals.find((goal) => goal.threadId === threadId);

    if (matchingGoal !== undefined) {
      runInAction(() => {
        this.goals = [matchingGoal, ...this.goals.filter((goal) => goal.id !== matchingGoal.id)];
      });
    }

    return matchingGoal;
  }

  /** Executes one archive-state mutation with shared error and loading handling. */
  private async mutateGoal(
    type: "projectGoals.archive" | "projectGoals.unarchive",
    goalId: string
  ): Promise<OpenCodexProjectGoal> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      const goal = await this.root.request<OpenCodexProjectGoal>({ type, goalId });

      runInAction(() => {
        this.upsertGoal(goal);
      });
      return goal;
    } catch (error) {
      this.reportError(error);
      throw error;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /** Stores and forwards a catalogue operation error. */
  private reportError(error: unknown): void {
    this.errorMessage = readErrorMessage(error);
    this.root.appStore.errorMessage = this.errorMessage;
  }
}

/** Trims form values before they cross the UI/backend boundary. */
function normalizeGoalFormInput(input: ProjectGoalFormInput): ProjectGoalFormInput {
  return {
    name: input.name.trim(),
    objective: input.objective.trim(),
    tokenBudget: input.tokenBudget
  };
}

/** Trims explicitly changed text fields without rewriting omitted fields. */
function normalizeGoalPatch(patch: OpenCodexProjectGoalPatch): OpenCodexProjectGoalPatch {
  return {
    ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
    ...(patch.objective === undefined ? {} : { objective: patch.objective.trim() }),
    ...(patch.tokenBudget === undefined ? {} : { tokenBudget: patch.tokenBudget })
  };
}

/** Normalizes execution metadata before it crosses the UI/backend boundary. */
function normalizeExecutionPatch(
  patch: OpenCodexProjectGoalExecutionPatch
): OpenCodexProjectGoalExecutionPatch {
  return {
    status: patch.status,
    ...(patch.sourceId === undefined ? {} : { sourceId: patch.sourceId?.trim() || null }),
    ...(patch.threadId === undefined ? {} : { threadId: patch.threadId?.trim() || null }),
    ...(patch.workspaceId === undefined ? {} : { workspaceId: patch.workspaceId?.trim() || null }),
    ...(patch.cwd === undefined ? {} : { cwd: patch.cwd?.trim() || null }),
    ...(patch.tokensUsed === undefined ? {} : { tokensUsed: patch.tokensUsed }),
    ...(patch.timeUsedSeconds === undefined ? {} : { timeUsedSeconds: patch.timeUsedSeconds }),
    ...(patch.launchedAt === undefined ? {} : { launchedAt: patch.launchedAt }),
    ...(patch.pausedAt === undefined ? {} : { pausedAt: patch.pausedAt }),
    ...(patch.completedAt === undefined ? {} : { completedAt: patch.completedAt }),
    ...(patch.lastSyncedAt === undefined ? {} : { lastSyncedAt: patch.lastSyncedAt })
  };
}

/** Returns whether the catalogue snapshot differs from a native goal snapshot. */
function needsNativeGoalSync(
  catalogueGoal: OpenCodexProjectGoal,
  nativeGoal: OpenCodexThreadGoal
): boolean {
  return catalogueGoal.status !== nativeGoal.status ||
    catalogueGoal.tokensUsed !== nativeGoal.tokensUsed ||
    catalogueGoal.timeUsedSeconds !== nativeGoal.timeUsedSeconds;
}

/** Creates source-aware execution metadata for a native goal snapshot. */
function createNativeExecutionPatch(
  nativeGoal: OpenCodexThreadGoal,
  chatStore: ChatStore,
  projectStore: ProjectStore,
  launchedAt: string | null
): OpenCodexProjectGoalExecutionPatch {
  return {
    status: nativeGoal.status,
    sourceId: chatStore.sourceId,
    threadId: chatStore.thread.id,
    workspaceId: projectStore.workspaceId ?? null,
    cwd: projectStore.workspacePath,
    tokensUsed: nativeGoal.tokensUsed,
    timeUsedSeconds: nativeGoal.timeUsedSeconds,
    launchedAt: launchedAt ?? new Date().toISOString(),
    lastSyncedAt: new Date().toISOString()
  };
}

/** Converts unknown errors into displayable catalogue error text. */
function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
