/**
 * Holds project command definitions and live run state.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexProjectCommand,
  OpenCodexProjectCommandRun
} from "@open-codex-ui/opencodex-protocol";

import {
  ProjectCommandRunsStore,
  type ProjectCommandRunView
} from "./ProjectCommandRunsStore";
import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "../RootStore";

export type { ProjectCommandLogLine, ProjectCommandRunView } from "./ProjectCommandRunsStore";

/** Editable project command form shape. */
export type ProjectCommandFormInput = {
  name: string;
  command: string;
  allowParallel: boolean;
  persistLogs: boolean;
};

/**
 * Stores project command configuration and live output for one project.
 */
export class ProjectCommandsStore {
  /** Commands configured for the owning project. */
  commands: OpenCodexProjectCommand[] = [];
  /** Store responsible for live command-run state and output reduction. */
  private readonly commandRunsStore: ProjectCommandRunsStore;
  /** Whether command definitions are loading. */
  isLoading = false;
  /** Whether command configuration is being persisted. */
  isSaving = false;
  /** Whether a run request is currently in flight. */
  isRunningCommand = false;
  /** Live and completed command runs grouped by command id. */
  get runsByCommandId(): Map<string, ProjectCommandRunView[]> {
    return this.commandRunsStore.runsByCommandId;
  }

  /**
   * Replaces the run map while preserving the historical writable property.
   *
   * @param runsByCommandId Replacement runs grouped by command id.
   */
  set runsByCommandId(runsByCommandId: Map<string, ProjectCommandRunView[]>) {
    this.commandRunsStore.runsByCommandId = runsByCommandId;
  }

  /**
   * Creates the project commands store.
   *
   * @param projectStore Owning project store.
   * @param root Root store used for backend requests.
   */
  constructor(
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    this.commandRunsStore = new ProjectCommandRunsStore();
    makeAutoObservable<ProjectCommandsStore, "projectStore" | "root" | "commandRunsStore">(
      this,
      {
        projectStore: false,
        root: false,
        commandRunsStore: false
      },
      {
        autoBind: true
      }
    );
  }

  /**
   * Returns whether project commands can be executed.
   *
   * @returns `true` when the project has an active Codex source.
   */
  get isAvailable(): boolean {
    return this.projectStore.isCodexSourceReady;
  }

  /**
   * Loads persisted commands for the project.
   *
   * @returns Promise resolved when commands are loaded.
   */
  async loadCommands(): Promise<void> {
    this.isLoading = true;

    try {
      const commands = await this.root.request<OpenCodexProjectCommand[]>({
        type: "projectCommands.list",
        projectId: this.projectStore.project.id
      });

      runInAction(() => {
        this.commands = commands;
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
   * Creates a command.
   *
   * @param input Command input.
   * @returns Promise resolved when creation completes.
   */
  async createCommand(input: ProjectCommandFormInput): Promise<void> {
    this.isSaving = true;

    try {
      const command = await this.root.request<OpenCodexProjectCommand>({
        type: "projectCommands.create",
        projectId: this.projectStore.project.id,
        ...normalizeCommandFormInput(input)
      });

      runInAction(() => {
        this.upsertCommand(command);
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
   * Updates a command.
   *
   * @param commandId Command identifier.
   * @param input Command input.
   * @returns Promise resolved when update completes.
   */
  async updateCommand(commandId: string, input: ProjectCommandFormInput): Promise<void> {
    this.isSaving = true;

    try {
      const command = await this.root.request<OpenCodexProjectCommand>({
        type: "projectCommands.update",
        commandId,
        patch: normalizeCommandFormInput(input)
      });

      runInAction(() => {
        this.upsertCommand(command);
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
   * Deletes a command and clears its local runs.
   *
   * @param commandId Command identifier.
   * @returns Promise resolved when deletion completes.
   */
  async deleteCommand(commandId: string): Promise<void> {
    this.isSaving = true;

    try {
      await this.root.request({
        type: "projectCommands.delete",
        commandId
      });

      runInAction(() => {
        this.commandRunsStore.clearCommand(commandId);
        this.commands = this.commands.filter((command) => command.id !== commandId);
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
   * Persists the full command order.
   *
   * @param commandIds Command identifiers in the desired order.
   * @returns Promise resolved when the order is persisted.
   */
  async reorderCommands(commandIds: string[]): Promise<void> {
    const nextCommands = orderCommandsByIds(this.commands, commandIds);

    if (haveSameCommandOrder(this.commands, nextCommands)) {
      return;
    }

    this.isSaving = true;
    this.commands = nextCommands;

    try {
      const commands = await this.root.request<OpenCodexProjectCommand[]>({
        type: "projectCommands.reorder",
        projectId: this.projectStore.project.id,
        commandIds
      });

      runInAction(() => {
        this.commands = commands;
      });
    } catch (error) {
      this.reportError(error);
      void this.loadCommands();
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /**
   * Moves a command one slot up or down in the configured order.
   *
   * @param commandId Command identifier.
   * @param direction Move direction.
   * @returns Promise resolved when the order is persisted.
   */
  async moveCommand(commandId: string, direction: "up" | "down"): Promise<void> {
    const commandIds = this.commands.map((command) => command.id);
    const currentIndex = commandIds.indexOf(commandId);

    if (currentIndex === -1) {
      return;
    }

    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (nextIndex < 0 || nextIndex >= commandIds.length) {
      return;
    }

    const nextCommandIds = [...commandIds];
    nextCommandIds[currentIndex] = commandIds[nextIndex] ?? commandId;
    nextCommandIds[nextIndex] = commandId;

    await this.reorderCommands(nextCommandIds);
  }

  /**
   * Starts a command when local concurrency rules allow it.
   *
   * @param command Command to run.
   * @returns Promise resolved when the backend accepted the run.
   */
  async runCommand(command: OpenCodexProjectCommand): Promise<void> {
    if (!this.canRunCommand(command)) {
      return;
    }

    this.isRunningCommand = true;

    try {
      const run = await this.root.request<OpenCodexProjectCommandRun>({
        type: "projectCommands.run",
        commandId: command.id,
        projectPath: this.projectStore.projectPath,
        sourceId: this.projectStore.project.sourceId
      });

      runInAction(() => {
        this.commandRunsStore.applyRunStarted(run);
      });
    } catch (error) {
      this.reportError(error);
    } finally {
      runInAction(() => {
        this.isRunningCommand = false;
      });
    }
  }

  /**
   * Stops a running command instance.
   *
   * @param runId Run identifier.
   * @returns Nothing.
   */
  stopRun(runId: string): void {
    void this.root.request({
      type: "projectCommands.stop",
      runId
    });
  }

  /**
   * Removes a completed run from local display.
   *
   * @param commandId Command identifier.
   * @param runId Run identifier.
   * @returns Nothing.
   */
  closeRun(commandId: string, runId: string): void {
    this.commandRunsStore.closeRun(commandId, runId);
  }

  /** Clears transient output retained by this project store. */
  dispose(): void {
    this.commandRunsStore.dispose();
  }

  /**
   * Returns whether one command still has active instances.
   *
   * @param commandId Command identifier.
   * @returns `true` when a run is active.
   */
  hasRunningRuns(commandId: string): boolean {
    return this.commandRunsStore.hasRunningRuns(commandId);
  }

  /**
   * Returns display runs for one command.
   *
   * @param commandId Command identifier.
   * @returns Run list.
   */
  getRuns(commandId: string): ProjectCommandRunView[] {
    return this.commandRunsStore.getRuns(commandId);
  }

  /**
   * Checks whether a command can currently be started.
   *
   * @param command Command to inspect.
   * @returns `true` when start is allowed.
   */
  canRunCommand(command: OpenCodexProjectCommand): boolean {
    if (!this.isAvailable) {
      return false;
    }

    if (command.allowParallel) {
      return true;
    }

    return !this.getRuns(command.id).some((run) => run.status === "running");
  }

  /**
   * Applies project command backend events.
   *
   * @param event Event payload.
   * @returns Nothing.
   */
  handleEvent(event: OpenCodexEvent): void {
    if (!("projectId" in event) || event.projectId !== this.projectStore.project.id) {
      return;
    }

    this.commandRunsStore.handleEvent(event);
  }

  /**
   * Inserts or replaces a command definition.
   *
   * @param command Command returned by the backend.
   */
  private upsertCommand(command: OpenCodexProjectCommand): void {
    const existingIndex = this.commands.findIndex((entry) => entry.id === command.id);

    if (existingIndex === -1) {
      this.commands = [...this.commands, command];
      return;
    }

    this.commands = this.commands.map((entry) => entry.id === command.id ? command : entry);
  }

  /**
   * Forwards command errors to the global app error surface.
   *
   * @param error Unknown caught error.
   */
  private reportError(error: unknown): void {
    this.root.appStore.errorMessage = readErrorMessage(error);
  }
}

/**
 * Orders commands by a requested id list while preserving unknown leftovers.
 *
 * @param commands Current commands.
 * @param commandIds Desired command id order.
 * @returns Reordered commands.
 */
function orderCommandsByIds(
  commands: OpenCodexProjectCommand[],
  commandIds: string[]
): OpenCodexProjectCommand[] {
  const commandsById = new Map(commands.map((command) => [command.id, command]));
  const orderedCommands: OpenCodexProjectCommand[] = [];

  for (const commandId of commandIds) {
    const command = commandsById.get(commandId);

    if (command !== undefined) {
      orderedCommands.push(command);
      commandsById.delete(commandId);
    }
  }

  return [...orderedCommands, ...commandsById.values()];
}

/**
 * Checks whether two command arrays have the same id order.
 *
 * @param currentCommands Current commands.
 * @param nextCommands Next commands.
 * @returns Whether the order is unchanged.
 */
function haveSameCommandOrder(
  currentCommands: OpenCodexProjectCommand[],
  nextCommands: OpenCodexProjectCommand[]
): boolean {
  if (currentCommands.length !== nextCommands.length) {
    return false;
  }

  return currentCommands.every((command, index) => command.id === nextCommands[index]?.id);
}

/**
 * Trims command form input before persistence.
 *
 * @param input Raw form input.
 * @returns Normalized command input.
 */
function normalizeCommandFormInput(input: ProjectCommandFormInput): ProjectCommandFormInput {
  return {
    name: input.name.trim(),
    command: input.command.trim(),
    allowParallel: input.allowParallel,
    persistLogs: input.persistLogs
  };
}

/**
 * Converts unknown errors into displayable command error text.
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
