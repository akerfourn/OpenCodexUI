/**
 * Holds live output and lifecycle state for project command runs.
 */
import { makeAutoObservable } from "mobx";

import type {
  OpenCodexEvent,
  OpenCodexProjectCommandOutputStream,
  OpenCodexProjectCommandRun,
  OpenCodexProjectCommandRunStatus
} from "@open-codex-ui/opencodex-protocol";

import { consumeProjectCommandOutput } from "./projectCommandOutputBuffer";

export type ProjectCommandLogLine = {
  id: string;
  stream: OpenCodexProjectCommandOutputStream;
  text: string;
};

/** UI run representation enriched with retained log lines. */
export type ProjectCommandRunView = OpenCodexProjectCommandRun & {
  lines: ProjectCommandLogLine[];
};

const maxRunLines = 100;

/**
 * Stores live and completed command runs for one project.
 *
 * The owning project store is responsible for routing project-scoped events;
 * this store only reduces the routed command-run lifecycle.
 */
export class ProjectCommandRunsStore {
  /** Live and completed command runs grouped by command id. */
  runsByCommandId = new Map<string, ProjectCommandRunView[]>();
  /** Partial output lines waiting for a newline by run and stream. */
  private readonly pendingTextByRunAndStream = new Map<string, string>();
  /** Local sequence used to create stable log-line ids. */
  private lineSequence = 0;

  /** Creates an isolated live command-run store. */
  constructor() {
    makeAutoObservable<ProjectCommandRunsStore, "pendingTextByRunAndStream">(
      this,
      {
        pendingTextByRunAndStream: false
      },
      {
        autoBind: true
      }
    );
  }

  /**
   * Applies a routed project command backend event.
   *
   * @param event Event payload already scoped to the owning project.
   */
  handleEvent(event: OpenCodexEvent): void {
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

  /**
   * Adds a newly started command run to local state.
   *
   * @param run Command run metadata.
   */
  applyRunStarted(run: OpenCodexProjectCommandRun): void {
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

  /**
   * Appends streamed output to a running command instance.
   *
   * @param commandId Command identifier.
   * @param runId Run identifier.
   * @param stream Output stream.
   * @param delta Output delta.
   */
  applyRunOutput(
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

  /**
   * Marks a command run as exited and flushes partial output.
   *
   * @param commandId Command identifier.
   * @param runId Run identifier.
   * @param status Final run status.
   * @param exitCode Process exit code.
   * @param exitedAt Exit timestamp.
   */
  applyRunExited(
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

  /**
   * Removes a completed run from local display.
   *
   * @param commandId Command identifier.
   * @param runId Run identifier.
   */
  closeRun(commandId: string, runId: string): void {
    const runs = this.runsByCommandId.get(commandId) ?? [];
    this.clearPendingLines(runId);
    this.runsByCommandId.set(commandId, runs.filter((run) => run.id !== runId));
  }

  /**
   * Clears all runs and pending output retained for one command.
   *
   * @param commandId Command identifier.
   */
  clearCommand(commandId: string): void {
    for (const run of this.getRuns(commandId)) {
      this.clearPendingLines(run.id);
    }

    this.runsByCommandId.delete(commandId);
  }

  /** Clears transient output retained by this store. */
  dispose(): void {
    this.pendingTextByRunAndStream.clear();
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
   * Finds a command run by command and run id.
   *
   * @param commandId Command identifier.
   * @param runId Run identifier.
   * @returns Run view, or `null`.
   */
  private findRun(commandId: string, runId: string): ProjectCommandRunView | null {
    return this.getRuns(commandId).find((run) => run.id === runId) ?? null;
  }

  /**
   * Converts an output delta into completed display lines.
   *
   * @param runId Run identifier.
   * @param stream Output stream.
   * @param delta Output delta.
   * @returns Completed log lines.
   */
  private consumeOutputLines(
    runId: string,
    stream: OpenCodexProjectCommandOutputStream,
    delta: string
  ): ProjectCommandLogLine[] {
    const key = createPendingOutputKey(runId, stream);
    const result = consumeProjectCommandOutput(
      this.pendingTextByRunAndStream.get(key) ?? "",
      delta
    );

    this.pendingTextByRunAndStream.set(key, result.pendingText);

    return result.completedTexts
      .slice(-maxRunLines)
      .map((line) => this.createLogLine(stream, line));
  }

  /**
   * Flushes partial stdout/stderr lines when a run exits.
   *
   * @param runId Run identifier.
   * @returns Flushed log lines.
   */
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

  /**
   * Discards partial stdout and stderr fragments for one removed run.
   *
   * @param runId Removed command run identifier.
   */
  private clearPendingLines(runId: string): void {
    for (const stream of ["stdout", "stderr"] as const) {
      this.pendingTextByRunAndStream.delete(createPendingOutputKey(runId, stream));
    }
  }

  /**
   * Creates a display log line with a stable local id.
   *
   * @param stream Output stream.
   * @param text Log text.
   * @returns Log line.
   */
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
}

/**
 * Builds the key used to buffer partial command output per stream.
 *
 * @param runId Run identifier.
 * @param stream Output stream.
 * @returns Pending-output map key.
 */
function createPendingOutputKey(
  runId: string,
  stream: OpenCodexProjectCommandOutputStream
): string {
  return `${runId}:${stream}`;
}
