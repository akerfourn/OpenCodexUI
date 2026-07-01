/**
 * Runs user-configured project commands through Codex app-server process APIs.
 */
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

import type {
  CodexAppServerClient,
  CodexNotification,
  v2
} from "@open-codex-ui/codex-rpc";
import type {
  CachedProjectCommand,
  CachedProjectCommandCreateInput,
  CachedProjectCommandUpdateInput,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexProjectCommand,
  OpenCodexProjectCommandRun
} from "@open-codex-ui/opencodex-protocol";

import { sanitizeTerminalOutput } from "./terminalOutput.js";

export type ProjectCommandServiceOptions = {
  cacheRepository: OpenCodexCacheRepository | null;
  userDataPath?: string;
  emit(event: OpenCodexEvent): void;
  ensureClient(sourceId: string | null): Promise<CodexAppServerClient>;
};

type ActiveProjectCommandRun = OpenCodexProjectCommandRun & {
  sourceId: string | null;
  outputWriteQueue: Promise<void>;
};

/**
 * Coordinates persisted project command definitions and live process runs.
 */
export class ProjectCommandService {
  private readonly runsById = new Map<string, ActiveProjectCommandRun>();
  private readonly runsByProcessHandle = new Map<string, ActiveProjectCommandRun>();
  private readonly stoppingRunIds = new Set<string>();

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
    sourceId: string | null
  ): Promise<OpenCodexProjectCommandRun> {
    const command = await this.readCommand(commandId);
    const runningRuns = this.readRunningRunsForCommand(command.id);

    if (!command.allowParallel && runningRuns.length > 0) {
      throw new Error("This command is already running.");
    }

    const client = await this.options.ensureClient(sourceId);
    const run = await this.createRun(command, projectPath, sourceId);
    const protocolRun = toProtocolRun(run);

    this.runsById.set(run.id, run);
    this.runsByProcessHandle.set(run.processHandle, run);
    this.options.emit({
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

    const client = await this.options.ensureClient(run.sourceId);
    this.stoppingRunIds.add(run.id);
    try {
      await client.request<v2.ProcessKillResponse>("process/kill", {
        processHandle: run.processHandle
      });
    } catch (error) {
      this.stoppingRunIds.delete(run.id);
      throw error;
    }
    return { ok: true };
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

  private requireRepository(): OpenCodexCacheRepository {
    if (this.options.cacheRepository === null) {
      throw new Error("Project command persistence is unavailable.");
    }

    return this.options.cacheRepository;
  }

  private async readCommand(commandId: string): Promise<CachedProjectCommand> {
    return await this.requireRepository().getProjectCommand(commandId);
  }

  private readRunningRunsForCommand(commandId: string): ActiveProjectCommandRun[] {
    return Array.from(this.runsById.values()).filter((run) => (
      run.commandId === commandId && run.status === "running"
    ));
  }

  private async createRun(
    command: CachedProjectCommand,
    projectPath: string,
    sourceId: string | null
  ): Promise<ActiveProjectCommandRun> {
    const id = cryptoRandomId();
    const logPath = command.persistLogs
      ? await this.createLogFilePath(command.projectId, command.id, id)
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
      logPath,
      sourceId,
      outputWriteQueue: Promise.resolve()
    };
  }

  private async createLogFilePath(
    projectId: string,
    commandId: string,
    runId: string
  ): Promise<string> {
    const root = this.options.userDataPath ?? process.cwd();
    const directory = path.join(
      root,
      "opencodexui-logs",
      sanitizePathSegment(projectId),
      sanitizePathSegment(commandId)
    );

    await fs.mkdir(directory, { recursive: true });
    return path.join(directory, `${sanitizePathSegment(runId)}.log`);
  }

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

    this.appendPersistentOutput(run, output.stream, delta);
    this.options.emit({
      type: "projectCommand.output",
      projectId: run.projectId,
      commandId: run.commandId,
      runId: run.id,
      stream: output.stream,
      delta
    });
  }

  private handleProcessExited(params: unknown): void {
    const exit = readProcessExited(params);

    if (exit === null) {
      return;
    }

    const run = this.runsByProcessHandle.get(exit.processHandle);

    if (run === undefined) {
      return;
    }

    run.status = this.stoppingRunIds.has(run.id)
      ? "killed"
      : readExitedStatus(exit.exitCode);
    run.exitCode = exit.exitCode;
    run.exitedAt = new Date().toISOString();
    this.stoppingRunIds.delete(run.id);
    this.runsByProcessHandle.delete(run.processHandle);
    this.runsById.delete(run.id);

    this.options.emit({
      type: "projectCommand.exited",
      projectId: run.projectId,
      commandId: run.commandId,
      runId: run.id,
      status: run.status,
      exitCode: run.exitCode,
      exitedAt: run.exitedAt
    });
  }

  private failRun(run: ActiveProjectCommandRun, error: unknown): void {
    run.status = "failed";
    run.exitCode = null;
    run.exitedAt = new Date().toISOString();
    this.stoppingRunIds.delete(run.id);
    this.runsByProcessHandle.delete(run.processHandle);
    this.runsById.delete(run.id);
    this.appendPersistentOutput(run, "stderr", String(error));
    this.options.emit({
      type: "projectCommand.exited",
      projectId: run.projectId,
      commandId: run.commandId,
      runId: run.id,
      status: run.status,
      exitCode: null,
      exitedAt: run.exitedAt
    });
  }

  private appendPersistentOutput(
    run: ActiveProjectCommandRun,
    stream: "stdout" | "stderr",
    delta: string
  ): void {
    if (run.logPath === null) {
      return;
    }

    const logPath = run.logPath;
    const output = prefixLines(delta, stream === "stderr" ? "[stderr] " : "");
    run.outputWriteQueue = run.outputWriteQueue
      .catch(() => undefined)
      .then(async () => {
        await fs.appendFile(logPath, output, "utf8");
      })
      .catch(() => {
        // Logging is best effort; command execution should not fail because disk logging failed.
      });
  }
}

function readProcessOutputDelta(value: unknown): v2.ProcessOutputDeltaNotification | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const params = value as Partial<v2.ProcessOutputDeltaNotification>;

  if (
    typeof params.processHandle !== "string" ||
    typeof params.deltaBase64 !== "string" ||
    (params.stream !== "stdout" && params.stream !== "stderr")
  ) {
    return null;
  }

  return {
    processHandle: params.processHandle,
    stream: params.stream,
    deltaBase64: params.deltaBase64,
    capReached: params.capReached === true
  };
}

function readProcessExited(value: unknown): v2.ProcessExitedNotification | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const params = value as Partial<v2.ProcessExitedNotification>;

  if (typeof params.processHandle !== "string" || typeof params.exitCode !== "number") {
    return null;
  }

  return {
    processHandle: params.processHandle,
    exitCode: params.exitCode,
    stdout: typeof params.stdout === "string" ? params.stdout : "",
    stdoutCapReached: params.stdoutCapReached === true,
    stderr: typeof params.stderr === "string" ? params.stderr : "",
    stderrCapReached: params.stderrCapReached === true
  };
}

function decodeBase64Output(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

function readExitedStatus(exitCode: number): "exited" | "failed" {
  return exitCode === 0 ? "exited" : "failed";
}

function toProtocolRun(run: ActiveProjectCommandRun): OpenCodexProjectCommandRun {
  return {
    id: run.id,
    projectId: run.projectId,
    commandId: run.commandId,
    processHandle: run.processHandle,
    command: run.command,
    status: run.status,
    startedAt: run.startedAt,
    exitedAt: run.exitedAt,
    exitCode: run.exitCode,
    logPath: run.logPath
  };
}

function createShellCommand(command: string, projectPath: string): string[] {
  const trimmedCommand = command.trim();

  if (trimmedCommand.length === 0) {
    throw new Error("Command is required.");
  }

  if (isWindowsPath(projectPath)) {
    return ["cmd.exe", "/d", "/s", "/c", trimmedCommand];
  }

  return ["sh", "-lc", trimmedCommand];
}

function isWindowsPath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function cryptoRandomId(): string {
  return crypto.randomUUID();
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function prefixLines(value: string, prefix: string): string {
  if (prefix.length === 0) {
    return value;
  }

  return value
    .split(/(\r?\n)/)
    .map((part) => (part === "\n" || part === "\r\n" || part.length === 0 ? part : `${prefix}${part}`))
    .join("");
}
