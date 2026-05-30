/**
 * Holds project command definitions and live run state.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexProjectCommand,
  OpenCodexProjectCommandOutputStream,
  OpenCodexProjectCommandRun,
  OpenCodexProjectCommandRunStatus
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "./RootStore";

export type ProjectCommandLogLine = {
  id: string;
  stream: OpenCodexProjectCommandOutputStream;
  text: string;
};

export type ProjectCommandRunView = OpenCodexProjectCommandRun & {
  lines: ProjectCommandLogLine[];
};

export type ProjectCommandFormInput = {
  name: string;
  command: string;
  allowParallel: boolean;
  persistLogs: boolean;
};

const maxRunLines = 100;

/**
 * Stores project command configuration and live output for one project.
 */
export class ProjectCommandsStore {
  commands: OpenCodexProjectCommand[] = [];
  runsByCommandId = new Map<string, ProjectCommandRunView[]>();
  isLoading = false;
  isSaving = false;
  isRunningCommand = false;
  private readonly pendingTextByRunAndStream = new Map<string, string>();
  private lineSequence = 0;

  constructor(
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ProjectCommandsStore, "projectStore" | "root" | "pendingTextByRunAndStream">(
      this,
      {
        projectStore: false,
        root: false,
        pendingTextByRunAndStream: false
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
        this.commands = this.commands.filter((command) => command.id !== commandId);
        this.runsByCommandId.delete(commandId);
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
        this.applyRunStarted(run);
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
    const runs = this.runsByCommandId.get(commandId) ?? [];
    this.runsByCommandId.set(commandId, runs.filter((run) => run.id !== runId));
  }

  /**
   * Returns whether one command still has active instances.
   *
   * @param commandId Command identifier.
   * @returns `true` when a run is active.
   */
  hasRunningRuns(commandId: string): boolean {
    return this.getRuns(commandId).some((run) => run.status === "running");
  }

  /**
   * Returns display runs for one command.
   *
   * @param commandId Command identifier.
   * @returns Run list.
   */
  getRuns(commandId: string): ProjectCommandRunView[] {
    return this.runsByCommandId.get(commandId) ?? [];
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

    switch (event.type) {
      case "projectCommand.started":
        this.applyRunStarted(event.run);
        return;
      case "projectCommand.output":
        this.applyRunOutput(event.commandId, event.runId, event.stream, event.delta);
        return;
      case "projectCommand.exited":
        this.applyRunExited(event.commandId, event.runId, event.status, event.exitCode, event.exitedAt);
        return;
      default:
        return;
    }
  }

  private upsertCommand(command: OpenCodexProjectCommand): void {
    const existingIndex = this.commands.findIndex((entry) => entry.id === command.id);

    if (existingIndex === -1) {
      this.commands = [...this.commands, command];
      return;
    }

    this.commands = this.commands.map((entry) => entry.id === command.id ? command : entry);
  }

  private applyRunStarted(run: OpenCodexProjectCommandRun): void {
    const runs = this.getRuns(run.commandId);

    if (runs.some((entry) => entry.id === run.id)) {
      return;
    }

    this.runsByCommandId.set(run.commandId, [
      ...runs,
      {
        ...run,
        lines: []
      }
    ]);
  }

  private applyRunOutput(
    commandId: string,
    runId: string,
    stream: OpenCodexProjectCommandOutputStream,
    delta: string
  ): void {
    const run = this.findRun(commandId, runId);

    if (run === null) {
      return;
    }

    const completedLines = this.consumeOutputLines(runId, stream, delta);

    if (completedLines.length === 0) {
      return;
    }

    run.lines = [...run.lines, ...completedLines].slice(-maxRunLines);
  }

  private applyRunExited(
    commandId: string,
    runId: string,
    status: OpenCodexProjectCommandRunStatus,
    exitCode: number | null,
    exitedAt: string
  ): void {
    const run = this.findRun(commandId, runId);

    if (run === null) {
      return;
    }

    const flushedLines = this.flushPendingLines(runId);
    run.lines = [...run.lines, ...flushedLines].slice(-maxRunLines);
    run.status = status;
    run.exitCode = exitCode;
    run.exitedAt = exitedAt;
  }

  private findRun(commandId: string, runId: string): ProjectCommandRunView | null {
    return this.getRuns(commandId).find((run) => run.id === runId) ?? null;
  }

  private consumeOutputLines(
    runId: string,
    stream: OpenCodexProjectCommandOutputStream,
    delta: string
  ): ProjectCommandLogLine[] {
    const key = createPendingOutputKey(runId, stream);
    const text = `${this.pendingTextByRunAndStream.get(key) ?? ""}${delta.replace(/\r/g, "\n")}`;
    const lines = text.split("\n");
    const completedTexts = lines.slice(0, -1);

    this.pendingTextByRunAndStream.set(key, lines.at(-1) ?? "");

    return completedTexts.map((line) => this.createLogLine(stream, line));
  }

  private flushPendingLines(runId: string): ProjectCommandLogLine[] {
    const lines: ProjectCommandLogLine[] = [];

    for (const stream of ["stdout", "stderr"] as const) {
      const key = createPendingOutputKey(runId, stream);
      const text = this.pendingTextByRunAndStream.get(key);
      this.pendingTextByRunAndStream.delete(key);

      if (text !== undefined && text.length > 0) {
        lines.push(this.createLogLine(stream, text));
      }
    }

    return lines;
  }

  private createLogLine(
    stream: OpenCodexProjectCommandOutputStream,
    text: string
  ): ProjectCommandLogLine {
    this.lineSequence += 1;
    return {
      id: `line:${this.lineSequence}`,
      stream,
      text
    };
  }

  private reportError(error: unknown): void {
    this.root.appStore.errorMessage = readErrorMessage(error);
  }
}

function normalizeCommandFormInput(input: ProjectCommandFormInput): ProjectCommandFormInput {
  return {
    name: input.name.trim(),
    command: input.command.trim(),
    allowParallel: input.allowParallel,
    persistLogs: input.persistLogs
  };
}

function createPendingOutputKey(
  runId: string,
  stream: OpenCodexProjectCommandOutputStream
): string {
  return `${runId}:${stream}`;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
