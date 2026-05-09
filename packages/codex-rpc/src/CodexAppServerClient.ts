/**
 * Implements a lightweight JSON-RPC client for the local `codex app-server` process.
 */
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface, type Interface } from "node:readline";

import { isRecord, parseJsonRpcLine, stringifyJsonLine } from "./events";
import type {
  CodexAppServerClientOptions,
  CodexNotification,
  CodexServerRequest,
  Disposable,
  JsonRpcId,
  JsonRpcMessage,
  JsonRpcRequest,
  ProcessFactory,
  ProcessLike
} from "./types";
import { CodexProcessError, JsonRpcError } from "./types";

import type { ThreadListParams } from "./generated/v2/ThreadListParams";
import type { ThreadListResponse } from "./generated/v2/ThreadListResponse";
import type { ThreadReadResponse } from "./generated/v2/ThreadReadResponse";
import type { ThreadResumeParams } from "./generated/v2/ThreadResumeParams";
import type { ThreadResumeResponse } from "./generated/v2/ThreadResumeResponse";
import type { ThreadSetNameResponse } from "./generated/v2/ThreadSetNameResponse";
import type { ThreadStartParams } from "./generated/v2/ThreadStartParams";
import type { ThreadStartResponse } from "./generated/v2/ThreadStartResponse";
import type { ThreadTurnsListParams } from "./generated/v2/ThreadTurnsListParams";
import type { ThreadTurnsListResponse } from "./generated/v2/ThreadTurnsListResponse";
import type { TurnInterruptResponse } from "./generated/v2/TurnInterruptResponse";
import type { TurnStartParams } from "./generated/v2/TurnStartParams";
import type { TurnStartResponse } from "./generated/v2/TurnStartResponse";

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type ClientEvents = {
  notification: [CodexNotification];
  serverRequest: [CodexServerRequest];
  error: [Error];
  close: [{ code: number | null; signal: NodeJS.Signals | null }];
};

/**
 * Manages the lifecycle of the Codex app-server process and the JSON-RPC messages exchanged with it.
 */
export class CodexAppServerClient {
  private readonly command: string;
  private readonly args: string[];
  private readonly requestTimeoutMs: number;
  private readonly experimentalApi: boolean;
  private readonly processFactory: ProcessFactory;
  private readonly logger: (message: string) => void;
  private readonly stderr: (message: string) => void;
  private readonly events = new EventEmitter<ClientEvents>();
  private readonly pendingRequests = new Map<JsonRpcId, PendingRequest>();

  private process: ProcessLike | null = null;
  private stdoutReader: Interface | null = null;
  private nextId = 1;
  private startPromise: Promise<void> | null = null;
  private isInitialized = false;

  /**
   * Creates a client with optional command, timeout, and process overrides.
   *
   * @param options Runtime options for launching and observing the Codex app-server.
   */
  constructor(options: CodexAppServerClientOptions = {}) {
    this.command = options.command ?? "codex";
    this.args = options.args ?? ["app-server"];
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
    this.experimentalApi = options.experimentalApi ?? true;
    this.processFactory = options.processFactory ?? defaultProcessFactory;
    this.logger = options.logger ?? (() => undefined);
    this.stderr = options.stderr ?? (() => undefined);
  }

  /**
   * Starts the Codex app-server process and runs the JSON-RPC initialization handshake.
   *
   * @returns Promise resolved once the client is ready to send requests.
   */
  async start(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.startPromise !== null) {
      return this.startPromise;
    }

    this.startPromise = this.startProcess();
    return this.startPromise;
  }

  /**
   * Stops the Codex app-server process and rejects outstanding requests.
   *
   * @returns Promise resolved once local process state has been cleared.
   */
  async stop(): Promise<void> {
    this.rejectPendingRequests(new CodexProcessError("Codex app-server stopped."));
    this.isInitialized = false;
    this.startPromise = null;

    this.stdoutReader?.close();
    this.stdoutReader = null;

    const process = this.process;
    this.process = null;

    if (process !== null && !process.killed) {
      process.kill();
    }
  }

  /**
   * Sends a JSON-RPC request and waits for its correlated response.
   *
   * @param method JSON-RPC method name to invoke.
   * @param params Optional request parameters.
   * @returns Promise resolved with the typed JSON-RPC result.
   */
  async request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.isInitialized && method !== "initialize") {
      await this.start();
    }

    const process = this.requireProcess();
    const id = this.nextId;
    this.nextId += 1;

    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new CodexProcessError(`Timed out waiting for response to ${method}.`));
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve: (result) => resolve(result as T),
        reject,
        timeout
      });

      process.stdin.write(stringifyJsonLine(request));
    });
  }

  /**
   * Sends a fire-and-forget JSON-RPC notification.
   *
   * @param method JSON-RPC method name to invoke.
   * @param params Optional notification parameters.
   * @returns Nothing.
   */
  notify(method: string, params?: unknown): void {
    const process = this.requireProcess();
    process.stdin.write(
      stringifyJsonLine({
        jsonrpc: "2.0",
        method,
        params
      })
    );
  }

  /**
   * Sends a successful response to a server-initiated JSON-RPC request.
   *
   * @param id JSON-RPC identifier from the incoming server request.
   * @param result Result payload returned to the server.
   * @returns Nothing.
   */
  respond(id: JsonRpcId, result: unknown): void {
    const process = this.requireProcess();
    process.stdin.write(
      stringifyJsonLine({
        jsonrpc: "2.0",
        id,
        result
      })
    );
  }

  /**
   * Rejects a server-initiated JSON-RPC request with an error response.
   *
   * @param id JSON-RPC identifier from the incoming server request.
   * @param message Error message returned to the server.
   * @returns Nothing.
   */
  rejectServerRequest(id: JsonRpcId, message: string): void {
    const process = this.requireProcess();
    process.stdin.write(
      stringifyJsonLine({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32000,
          message
        }
      })
    );
  }

  /**
   * Subscribes to JSON-RPC notifications emitted by the app-server.
   *
   * @param callback Listener invoked for each notification.
   * @returns Disposable used to remove the listener.
   */
  onNotification(callback: (notification: CodexNotification) => void): Disposable {
    this.events.on("notification", callback);
    return createDisposable(() => this.events.off("notification", callback));
  }

  /**
   * Subscribes to server-originated JSON-RPC requests.
   *
   * @param callback Listener invoked for each server request.
   * @returns Disposable used to remove the listener.
   */
  onServerRequest(callback: (request: CodexServerRequest) => void): Disposable {
    this.events.on("serverRequest", callback);
    return createDisposable(() => this.events.off("serverRequest", callback));
  }

  /**
   * Subscribes to transport or parsing errors raised by the client.
   *
   * @param callback Listener invoked for each emitted error.
   * @returns Disposable used to remove the listener.
   */
  onError(callback: (error: Error) => void): Disposable {
    this.events.on("error", callback);
    return createDisposable(() => this.events.off("error", callback));
  }

  /**
   * Subscribes to the underlying process close event.
   *
   * @param callback Listener invoked when the app-server process exits.
   * @returns Disposable used to remove the listener.
   */
  onClose(callback: (event: { code: number | null; signal: NodeJS.Signals | null }) => void): Disposable {
    this.events.on("close", callback);
    return createDisposable(() => this.events.off("close", callback));
  }

  /**
   * Lists Codex threads through the generated typed RPC bindings.
   *
   * @param params Optional filters and pagination settings for the thread list.
   * @returns Promise resolved with the typed thread list response.
   */
  async listThreads(params: ThreadListParams = {}): Promise<ThreadListResponse> {
    return this.request<ThreadListResponse>("thread/list", params);
  }

  /**
   * Starts a new Codex thread with default persistence options.
   *
   * @param params Optional thread start parameters.
   * @returns Promise resolved with the thread start response.
   */
  async startThread(params: Partial<ThreadStartParams> = {}): Promise<ThreadStartResponse> {
    return this.request<ThreadStartResponse>("thread/start", {
      experimentalRawEvents: false,
      persistExtendedHistory: true,
      ...params
    });
  }

  /**
   * Resumes an existing Codex thread with default persistence options.
   *
   * @param threadId Identifier of the thread to resume.
   * @param params Optional resume parameters excluding the required thread id.
   * @returns Promise resolved with the thread resume response.
   */
  async resumeThread(
    threadId: string,
    params: Partial<Omit<ThreadResumeParams, "threadId" | "persistExtendedHistory">> = {}
  ): Promise<ThreadResumeResponse> {
    return this.request<ThreadResumeResponse>("thread/resume", {
      threadId,
      persistExtendedHistory: true,
      ...params
    });
  }

  /**
   * Reads a thread snapshot, optionally including its turns.
   *
   * @param threadId Identifier of the thread to read.
   * @param includeTurns Whether the response should include turn data.
   * @returns Promise resolved with the thread snapshot response.
   */
  async readThread(threadId: string, includeTurns = true): Promise<ThreadReadResponse> {
    return this.request<ThreadReadResponse>("thread/read", { threadId, includeTurns });
  }

  /**
   * Lists turns for a thread using the generated typed RPC bindings.
   *
   * @param params Thread turns list parameters.
   * @returns Promise resolved with the turns list response.
   */
  async listThreadTurns(params: ThreadTurnsListParams): Promise<ThreadTurnsListResponse> {
    return this.request<ThreadTurnsListResponse>("thread/turns/list", params);
  }

  /**
   * Starts a turn inside an existing thread.
   *
   * @param params Turn start parameters.
   * @returns Promise resolved with the turn start response.
   */
  async startTurn(params: TurnStartParams): Promise<TurnStartResponse> {
    return this.request<TurnStartResponse>("turn/start", params);
  }

  /**
   * Interrupts an active turn in a thread.
   *
   * @param threadId Identifier of the owning thread.
   * @param turnId Identifier of the turn to interrupt.
   * @returns Promise resolved with the turn interrupt response.
   */
  async interruptTurn(threadId: string, turnId: string): Promise<TurnInterruptResponse> {
    return this.request<TurnInterruptResponse>("turn/interrupt", { threadId, turnId });
  }

  /**
   * Renames a thread through the Codex app-server API.
   *
   * @param threadId Identifier of the thread to rename.
   * @param name New thread name.
   * @returns Promise resolved with the rename response.
   */
  async renameThread(threadId: string, name: string): Promise<ThreadSetNameResponse> {
    return this.request<ThreadSetNameResponse>("thread/name/set", { threadId, name });
  }

  /**
   * Starts the underlying process and installs all transport listeners.
   *
   * @returns Promise resolved once initialization has completed.
   */
  private async startProcess(): Promise<void> {
    this.logger(`Starting ${this.command} ${this.args.join(" ")}`);

    try {
      this.process = this.processFactory(this.command, this.args);
    } catch (error) {
      this.startPromise = null;
      throw normalizeProcessError(error, this.command);
    }

    const process = this.process;
    this.stdoutReader = createInterface({ input: process.stdout });
    this.stdoutReader.on("line", (line) => this.handleLine(line));

    process.stderr.on("data", (chunk: Buffer | string) => {
      const message = String(chunk).trim();
      this.logger(`[codex stderr] ${message}`);
      this.stderr(message);
    });

    process.once("error", (error: Error) => {
      const processError = normalizeProcessError(error, this.command);
      this.events.emit("error", processError);
      this.rejectPendingRequests(processError);
      this.startPromise = null;
    });

    process.once("close", (code: number | null, signal: NodeJS.Signals | null) => {
      this.events.emit("close", { code, signal });
      this.isInitialized = false;
      this.startPromise = null;
      this.process = null;
      this.rejectPendingRequests(new CodexProcessError("Codex app-server process exited."));
    });

    await this.initialize();
    this.isInitialized = true;
  }

  /**
   * Sends the initial JSON-RPC handshake expected by the app-server.
   *
   * @returns Promise resolved once the initialization exchange finishes.
   */
  private async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: {
        name: "OpenCodexUI",
        version: "0.0.1"
      },
      capabilities: {
        experimentalApi: this.experimentalApi
      }
    });

    this.notify("initialized");
  }

  /**
   * Parses an incoming stdout line and dispatches it to the appropriate event channel.
   *
   * @param line Raw JSON-RPC line emitted by the app-server.
   * @returns Nothing.
   */
  private handleLine(line: string): void {
    let message: JsonRpcMessage;

    try {
      message = parseJsonRpcLine(line);
    } catch (error) {
      const parseError = error instanceof Error ? error : new Error(String(error));
      this.events.emit("error", parseError);
      return;
    }

    if ("id" in message && ("result" in message || "error" in message)) {
      this.handleResponse(message);
      return;
    }

    if ("id" in message && "method" in message) {
      this.events.emit("serverRequest", {
        id: message.id,
        method: message.method,
        params: message.params
      });
      return;
    }

    if ("method" in message) {
      this.events.emit("notification", {
        method: message.method,
        params: message.params
      });
    }
  }

  /**
   * Resolves or rejects the pending promise associated with a JSON-RPC response.
   *
   * @param message Parsed JSON-RPC response message.
   * @returns Nothing.
   */
  private handleResponse(message: JsonRpcMessage): void {
    if (!("id" in message)) {
      return;
    }

    const pending = this.pendingRequests.get(message.id);

    if (pending === undefined) {
      return;
    }

    this.pendingRequests.delete(message.id);
    clearTimeout(pending.timeout);

    if ("error" in message) {
      const messageText = isRecord(message.error)
        ? String(message.error.message ?? "Unknown JSON-RPC error")
        : "Unknown JSON-RPC error";
      const code = isRecord(message.error) && typeof message.error.code === "number"
        ? message.error.code
        : undefined;
      const data = isRecord(message.error) ? message.error.data : undefined;
      pending.reject(new JsonRpcError(messageText, code, data));
      return;
    }

    if ("result" in message) {
      pending.resolve(message.result);
    }
  }

  /**
   * Rejects every pending request with the provided process-level error.
   *
   * @param error Error propagated to all pending request promises.
   * @returns Nothing.
   */
  private rejectPendingRequests(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }

    this.pendingRequests.clear();
  }

  /**
   * Returns the active child process or raises a normalized process error.
   *
   * @returns Running child process instance.
   */
  private requireProcess(): ProcessLike {
    if (this.process === null) {
      throw new CodexProcessError("Codex app-server is not running.");
    }

    return this.process;
  }
}

/**
 * Spawns the Codex app-server process with piped standard streams.
 *
 * @param command Executable command to launch.
 * @param args Arguments passed to the executable.
 * @returns Process-like child process used by the client.
 */
function defaultProcessFactory(command: string, args: string[]): ProcessLike {
  return spawn(resolveCodexCommand(command), args, {
    stdio: ["pipe", "pipe", "pipe"]
  });
}

/**
 * Resolves the actual Codex executable path, including an optional Volta shim.
 *
 * @param command Requested command name.
 * @returns Executable path used to spawn the app-server process.
 */
function resolveCodexCommand(command: string): string {
  if (command !== "codex") {
    return command;
  }

  if (process.env.OPENCODEX_CODEX_COMMAND !== undefined) {
    return process.env.OPENCODEX_CODEX_COMMAND;
  }

  for (const candidate of readCodexCommandCandidates()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return command;
}

/**
 * Returns common Codex executable locations that may be absent from PATH.
 *
 * @returns Candidate executable paths ordered from most specific to generic.
 */
function readCodexCommandCandidates(): string[] {
  const candidates: string[] = [];

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    const userProfile = process.env.USERPROFILE;

    if (localAppData !== undefined && localAppData.length > 0) {
      candidates.push(path.join(localAppData, "OpenAI", "Codex", "bin", "codex.exe"));
      candidates.push(path.join(localAppData, "Volta", "bin", "codex.exe"));
      candidates.push(path.join(localAppData, "Volta", "bin", "codex.cmd"));
    }

    if (userProfile !== undefined && userProfile.length > 0) {
      candidates.push(path.join(userProfile, ".volta", "bin", "codex.exe"));
      candidates.push(path.join(userProfile, ".volta", "bin", "codex.cmd"));
    }

    return candidates;
  }

  const home = process.env.HOME;

  if (home !== undefined && home.length > 0) {
    candidates.push(path.join(home, ".volta", "bin", "codex"));
  }

  return candidates;
}

/**
 * Wraps a cleanup callback in the project's disposable contract.
 *
 * @param dispose Cleanup callback to expose.
 * @returns Disposable wrapper that calls the provided cleanup callback.
 */
function createDisposable(dispose: () => void): Disposable {
  return { dispose };
}

/**
 * Normalizes arbitrary spawn failures into a process error exposed by the client.
 *
 * @param error Raw error raised while spawning or interacting with the process.
 * @param command Command that triggered the failure.
 * @returns Normalized process error instance.
 */
function normalizeProcessError(error: unknown, command: string): CodexProcessError {
  if (isRecord(error) && error.code === "ENOENT") {
    return new CodexProcessError(
      `Codex CLI was not found in PATH: ${command}.`
    );
  }

  if (error instanceof Error) {
    return new CodexProcessError(error.message);
  }

  return new CodexProcessError(String(error));
}
