/**
 * Holds local task state for one project.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexProjectTask,
  OpenCodexProjectTaskStatus
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "../RootStore";

export type ProjectTaskFormInput = {
  title: string;
  description: string;
  status: OpenCodexProjectTaskStatus;
};

/** Task status filter value used by the task panel. */
export type ProjectTaskStatusFilter = OpenCodexProjectTaskStatus | "all";

/**
 * Stores local project tasks and UI filters.
 */
export class ProjectTasksStore {
  /** Tasks loaded for the owning project. */
  tasks: OpenCodexProjectTask[] = [];
  /** Search term applied to task titles and descriptions. */
  searchTerm = "";
  /** Status filter applied to the task list. */
  statusFilter: ProjectTaskStatusFilter = "all";
  /** Whether tasks are currently loading. */
  isLoading = false;
  /** Whether a task mutation is currently in flight. */
  isSaving = false;
  /** Last task operation error shown by the UI. */
  errorMessage: string | null = null;

  /**
   * Creates the project task store.
   *
   * @param projectStore Owning project store.
   * @param root Root store used for backend requests.
   */
  constructor(
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ProjectTasksStore, "projectStore" | "root">(
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

  /**
   * Returns tasks filtered for the current panel inputs.
   *
   * @returns Filtered tasks.
   */
  get filteredTasks(): OpenCodexProjectTask[] {
    const normalizedSearchTerm = this.searchTerm.trim().toLowerCase();

    return this.tasks.filter((task) => {
      const matchesStatus = this.statusFilter === "all" || task.status === this.statusFilter;

      if (!matchesStatus) {
        return false;
      }

      if (normalizedSearchTerm.length === 0) {
        return true;
      }

      return task.title.toLowerCase().includes(normalizedSearchTerm) ||
        task.description.toLowerCase().includes(normalizedSearchTerm);
    });
  }

  /**
   * Updates the task search term.
   *
   * @param value Search text.
   */
  setSearchTerm(value: string): void {
    this.searchTerm = value;
  }

  /**
   * Updates the task status filter.
   *
   * @param value Status filter.
   */
  setStatusFilter(value: ProjectTaskStatusFilter): void {
    this.statusFilter = value;
  }

  /**
   * Loads local tasks for the project.
   *
   * @returns Promise resolved when tasks are loaded.
   */
  async loadTasks(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const tasks = await this.root.request<OpenCodexProjectTask[]>({
        type: "projectTasks.list",
        projectId: this.projectStore.project.id
      });

      runInAction(() => {
        this.tasks = tasks;
      });
    } catch (error) {
      this.reportError(error);
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  /**
   * Creates a local task.
   *
   * @param input Task input.
   * @returns Promise resolved with the created task.
   */
  async createTask(input: ProjectTaskFormInput): Promise<OpenCodexProjectTask> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      const task = await this.root.request<OpenCodexProjectTask>({
        type: "projectTasks.create",
        projectId: this.projectStore.project.id,
        ...normalizeTaskFormInput(input)
      });

      runInAction(() => {
        this.upsertTask(task);
      });
      return task;
    } catch (error) {
      this.reportError(error);
      throw error;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /**
   * Updates a local task.
   *
   * @param taskId Task identifier.
   * @param input Task input.
   * @returns Promise resolved with the updated task.
   */
  async updateTask(taskId: string, input: ProjectTaskFormInput): Promise<OpenCodexProjectTask> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      const task = await this.root.request<OpenCodexProjectTask>({
        type: "projectTasks.update",
        taskId,
        patch: normalizeTaskFormInput(input)
      });

      runInAction(() => {
        this.upsertTask(task);
      });
      return task;
    } catch (error) {
      this.reportError(error);
      throw error;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /**
   * Deletes a local task.
   *
   * @param taskId Task identifier.
   * @returns Promise resolved when deletion completes.
   */
  async deleteTask(taskId: string): Promise<void> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      await this.root.request({
        type: "projectTasks.delete",
        taskId
      });

      runInAction(() => {
        this.tasks = this.tasks.filter((task) => task.id !== taskId);
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

  /**
   * Inserts or replaces a task in the local list.
   *
   * @param task Task returned by the backend.
   */
  private upsertTask(task: OpenCodexProjectTask): void {
    const existingIndex = this.tasks.findIndex((entry) => entry.id === task.id);

    if (existingIndex === -1) {
      this.tasks = [task, ...this.tasks];
      return;
    }

    this.tasks = this.tasks.map((entry) => entry.id === task.id ? task : entry);
  }

  /**
   * Stores and forwards a task operation error.
   *
   * @param error Unknown caught error.
   */
  private reportError(error: unknown): void {
    this.errorMessage = readErrorMessage(error);
    this.root.appStore.errorMessage = this.errorMessage;
  }
}

/**
 * Trims task form input before it crosses the backend boundary.
 *
 * @param input Raw form input.
 * @returns Normalized form input.
 */
function normalizeTaskFormInput(input: ProjectTaskFormInput): ProjectTaskFormInput {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    status: input.status
  };
}

/**
 * Converts unknown errors into displayable task error text.
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
