/**
 * Runs user-configured project commands through Codex app-server process APIs.
 */
import crypto from "node:crypto";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";

import type {
  CodexNotification,
  v2
} from "@open-codex-ui/codex-rpc";
import type {
  CachedProjectCommand,
  CachedProjectCommandCreateInput,
  CachedProjectCommandUpdateInput,
  CachedSource,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexProjectCommand,
  OpenCodexProjectCommandRun
} from "@open-codex-ui/opencodex-protocol";

import { toProtocolRun } from "./projectCommandRunMapping.js";
import { ProjectCommandLog } from "./ProjectCommandLog.js";
import { requireToolWorkspace } from "../workspaces/workspaceToolContext.js";
import { createShellCommand } from "./projectCommandExecution.js";
import {
  decodeBase64Output,
  readExitedStatus,
  readProcessExited,
  readProcessOutputDelta
} from "./projectCommandNotifications.js";
import { sanitizeTerminalOutput } from "../threads/terminalOutput.js";
import type { ClientPort, RuntimeEventPort } from "../runtime/runtimePorts.js";

export type ProjectCommandServiceOptions = {
  cacheRepository: OpenCodexCacheRepository | null;
  userDataPath?: string;
  events: Pick<RuntimeEventPort, "emit">;
  clients: Pick<ClientPort, "ensureClient">;
  resolveSource(sourceId: string | null): Promise<CachedSource>;
};

type ActiveProjectCommandRun = OpenCodexProjectCommandRun & {
  sourceId: string;
  /** Optional writer retained for the lifetime of this run. */
  log: ProjectCommandLog | null;
};

/**
 * Coordinates persisted project command definitions and live process runs.
 */
export class ProjectCommandService {
  /** Serializes non-parallel starts before their process handles are registered. */
  private readonly startingRuns = new Set<string>();
  private readonly runsById = new Map<string, ActiveProjectCommandRun>();
  private readonly runsByProcessHandle = new Map<string, ActiveProjectCommandRun>();
  private readonly stoppingRunIds = new Set<string>();

  /**
   * Creates a project command service.
   *
   * @param options Cache, user-data path, event emitter, and Codex client resolver.
   */
  constructor(private readonly options: ProjectCommandServiceOptions) {}

  /**
   * Lists commands configured for one project.
   *
   * @param projectId Project identifier.
   * @returns Project commands.
   */
  async listCommands(projectId: string): Promise<OpenCodexProjectCommand[]> {
    return await this.requireRepository().listProjectCommands(projectId);
  }

  /**
   * Creates a project command.
   *
   * @param input Command input.
   * @returns Created command.
   */
  async createCommand(
    input: CachedProjectCommandCreateInput
  ): Promise<OpenCodexProjectCommand> {
    return await this.requireRepository().createProjectCommand(input);
  }

  /**
   * Updates a project command.
   *
   * @param commandId Command identifier.
   * @param patch Command patch.
   * @returns Updated command.
   */
  async updateCommand(
    commandId: string,
    patch: CachedProjectCommandUpdateInput
  ): Promise<OpenCodexProjectCommand> {
    return await this.requireRepository().updateProjectCommand(commandId, patch);
  }

  /**
   * Reorders commands configured for one project.
   *
   * @param projectId Project identifier.
   * @param commandIds Command identifiers in display order.
   * @returns Commands in persisted order.
   */
  async reorderCommands(
    projectId: string,
    commandIds: string[]
  ): Promise<OpenCodexProjectCommand[]> {
    return await this.requireRepository().reorderProjectCommands({
      projectId,
      commandIds
    });
  }

  /**
   * Deletes a project command.
   *
   * @param commandId Command identifier.
   * @returns Nothing.
   */
  async deleteCommand(commandId: string): Promise<void> {
    await this.requireRepository().deleteProjectCommand(commandId);
  }

  /**
   * Starts a command process for one project.
   *
   * @param commandId Command identifier.
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Started run metadata.
   */
  async runCommand(
    commandId: string,
    projectPath: string,
    sourceId: string | null,
    workspaceId?: string
  ): Promise<OpenCodexProjectCommandRun> {
    projectPath = normalizeProjectPath(projectPath) ?? projectPath;
    const command = await this.readCommand(commandId);
    if (workspaceId !== undefined) {
      const workspace = await requireToolWorkspace(this.requireRepository(), workspaceId, command.projectId);
      if (workspace.path !== projectPath || (sourceId !== null && workspace.sourceId !== sourceId)) {
        throw new Error("Command context does not match the workspace.");
      }
      sourceId = workspace.sourceId;
    }
    const source = await this.options.resolveSource(sourceId);
    const executionKey = JSON.stringify([command.id, source.id, projectPath]);
    const runningRuns = this.readRunningRunsForCommand(command.id).filter((run) =>
      run.cwd === projectPath && run.sourceId === source.id);

    if (!command.allowParallel && (runningRuns.length > 0 || this.startingRuns.has(executionKey))) {
      throw new Error("This command is already running.");
    }

    if (!command.allowParallel) {
      this.startingRuns.add(executionKey);
    }
    try {
      const client = await this.options.clients.ensureClient(source.id);
      const run = await this.createRun(command, projectPath, source.id, workspaceId);
      const protocolRun = toProtocolRun(run);

      this.runsById.set(run.id, run);
      this.runsByProcessHandle.set(run.processHandle, run);
      this.options.events.emit({
        type: "projectCommand.started",
        projectId: run.projectId,
        run: protocolRun
      });

      try {
        await client.request<v2.ProcessSpawnResponse>("process/spawn", {
          command: createShellCommand(command.command, projectPath),
          processHandle: run.processHandle,
          cwd: projectPath,
          tty: true,
          streamStdoutStderr: true,
          streamStdin: true,
          outputBytesCap: null,
          timeoutMs: null
        });
      } catch (error) {
        this.failRun(run, error);
        throw error;
      }

      return protocolRun;
    } finally {
      if (!command.allowParallel) {
        this.startingRuns.delete(executionKey);
      }
    }
  }

  /**
   * Stops a running command instance.
   *
   * @param runId Command run identifier.
   * @returns Success result.
   */
  async stopRun(runId: string): Promise<{ ok: true }> {
    const run = this.runsById.get(runId);

    if (run === undefined || run.status !== "running") {
      return { ok: true };
    }

    const client = await this.options.clients.ensureClient(run.sourceId);
    this.stoppingRunIds.add(run.id);
    try {
      await client.request<v2.ProcessKillResponse>("process/kill", {
        processHandle: run.processHandle
      });
    } catch (error) {
      this.stoppingRunIds.delete(run.id);

      if (isMissingProcessHandleError(error, run.processHandle)) {
        this.reportDiagnostic(
          run,
          "Codex app-server no longer manages this process; its exit status is unknown."
        );
        this.finishRun(run, "failed", null);
        return { ok: true };
      }

      throw error;
    }
    return { ok: true };
  }

  /**
   * Finalizes command runs whose owning Codex client has closed.
   *
   * A process handle is scoped to its app-server connection, so it cannot be
   * controlled after that client is gone.
   *
   * @param sourceId Resolved source identifier whose client closed.
   */
  handleClientClosed(sourceId: string): void {
    const runs = Array.from(this.runsById.values()).filter((run) => (
      run.sourceId === sourceId && run.status === "running"
    ));

    for (const run of runs) {
      this.reportDiagnostic(
        run,
        "The Codex app-server connection closed before this process reported its exit status."
      );
      this.finishRun(run, "failed", null);
    }
  }

  /**
   * Applies process output and exit notifications emitted by Codex app-server.
   *
   * @param notification Codex notification.
   * @returns Nothing.
   */
  handleNotification(notification: CodexNotification): void {
    if (notification.method === "process/outputDelta") {
      this.handleOutputDelta(notification.params);
      return;
    }

    if (notification.method === "process/exited") {
      this.handleProcessExited(notification.params);
    }
  }

  /**
   * Returns the cache repository required for command persistence.
   *
   * @returns Cache repository.
   * @throws When SQLite cache is unavailable.
   */
  private requireRepository(): OpenCodexCacheRepository {
    if (this.options.cacheRepository === null) {
      throw new Error("Project command persistence is unavailable.");
    }

    return this.options.cacheRepository;
  }

  /**
   * Reads a configured command by id.
   *
   * @param commandId Command identifier.
   * @returns Cached command definition.
   */
  private async readCommand(commandId: string): Promise<CachedProjectCommand> {
    return await this.requireRepository().getProjectCommand(commandId);
  }

  /**
   * Lists currently running instances for one command.
   *
   * @param commandId Command identifier.
   * @returns Active runs still marked as running.
   */
  private readRunningRunsForCommand(commandId: string): ActiveProjectCommandRun[] {
    return Array.from(this.runsById.values()).filter((run) => (
      run.commandId === commandId && run.status === "running"
    ));
  }

  /**
   * Creates in-memory metadata for a new command run.
   *
   * @param command Cached command definition.
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Active run metadata.
   */
  private async createRun(
    command: CachedProjectCommand,
    projectPath: string,
    sourceId: string,
    workspaceId?: string
  ): Promise<ActiveProjectCommandRun> {
    const id = cryptoRandomId();
    const log = command.persistLogs
      ? await ProjectCommandLog.create(this.options.userDataPath, command.projectId, command.id, id)
      : null;

    return {
      id,
      projectId: command.projectId,
      commandId: command.id,
      processHandle: `opencodex-command-${id}`,
      command: command.command,
      status: "running",
      startedAt: new Date().toISOString(),
      exitedAt: null,
      exitCode: null,
      logPath: log?.path ?? null,
      sourceId,
      cwd: projectPath,
      workspaceId,
      log
    };
  }

  /**
   * Applies a process output delta to the matching active run.
   *
   * @param params Raw process output notification params.
   */
  private handleOutputDelta(params: unknown): void {
    const output = readProcessOutputDelta(params);

    if (output === null) {
      return;
    }

    const run = this.runsByProcessHandle.get(output.processHandle);

    if (run === undefined || run.status !== "running") {
      return;
    }

    const delta = sanitizeTerminalOutput(decodeBase64Output(output.deltaBase64));

    if (delta.length === 0) {
      return;
    }

    run.log?.append(output.stream, delta);
    this.options.events.emit({
      type: "projectCommand.output",
      projectId: run.projectId,
      commandId: run.commandId,
      runId: run.id,
      stream: output.stream,
      delta
    });
  }

  /**
   * Marks a command run as completed from a process exit notification.
   *
   * @param params Raw process exit notification params.
   */
  private handleProcessExited(params: unknown): void {
    const exit = readProcessExited(params);

    if (exit === null) {
      return;
    }

    const run = this.runsByProcessHandle.get(exit.processHandle);

    if (run === undefined) {
      return;
    }

    const status = this.stoppingRunIds.has(run.id)
      ? "killed"
      : readExitedStatus(exit.exitCode);
    this.finishRun(run, status, exit.exitCode);
  }

  /**
   * Marks a command run as failed when spawning or bookkeeping fails.
   *
   * @param run Active run to fail.
   * @param error Error that caused the failure.
   */
  private failRun(run: ActiveProjectCommandRun, error: unknown): void {
    this.reportDiagnostic(run, String(error));
    this.finishRun(run, "failed", null);
  }

  /**
   * Emits one diagnostic line and writes it to the optional command log.
   *
   * @param run Active command run.
   * @param message Diagnostic message.
   */
  private reportDiagnostic(run: ActiveProjectCommandRun, message: string): void {
    const delta = `${message}\n`;
    run.log?.append("stderr", delta);
    this.options.events.emit({
      type: "projectCommand.output",
      projectId: run.projectId,
      commandId: run.commandId,
      runId: run.id,
      stream: "stderr",
      delta
    });
  }

  /**
   * Removes a completed run from local process tracking and emits its result.
   *
   * @param run Active command run.
   * @param status Final run status.
   * @param exitCode Process exit code, when known.
   */
  private finishRun(
    run: ActiveProjectCommandRun,
    status: Exclude<OpenCodexProjectCommandRun["status"], "running">,
    exitCode: number | null
  ): void {
    run.status = status;
    run.exitCode = exitCode;
    run.exitedAt = new Date().toISOString();
    this.stoppingRunIds.delete(run.id);
    this.runsByProcessHandle.delete(run.processHandle);
    this.runsById.delete(run.id);

    this.options.events.emit({
      type: "projectCommand.exited",
      projectId: run.projectId,
      commandId: run.commandId,
      runId: run.id,
      status: run.status,
      exitCode: run.exitCode,
      exitedAt: run.exitedAt
    });
  }

}

/**
 * Returns whether an app-server rejection means the process has already gone.
 *
 * @param error Request error returned by Codex app-server.
 * @param processHandle Process handle passed to the failed request.
 * @returns `true` when Codex no longer owns that exact process.
 */
function isMissingProcessHandleError(error: unknown, processHandle: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes(`no active process for process handle "${processHandle}"`);
}

/**
 * Creates a random run identifier.
 *
 * @returns UUID string.
 */
function cryptoRandomId(): string {
  return crypto.randomUUID();
}
