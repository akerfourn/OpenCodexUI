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

  constructor(options: CodexAppServerClientOptions = {}) {
    this.command = options.command ?? "codex";
    this.args = options.args ?? ["app-server"];
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
    this.experimentalApi = options.experimentalApi ?? true;
    this.processFactory = options.processFactory ?? defaultProcessFactory;
    this.logger = options.logger ?? (() => undefined);
    this.stderr = options.stderr ?? (() => undefined);
  }

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

  onNotification(callback: (notification: CodexNotification) => void): Disposable {
    this.events.on("notification", callback);
    return createDisposable(() => this.events.off("notification", callback));
  }

  onServerRequest(callback: (request: CodexServerRequest) => void): Disposable {
    this.events.on("serverRequest", callback);
    return createDisposable(() => this.events.off("serverRequest", callback));
  }

  onError(callback: (error: Error) => void): Disposable {
    this.events.on("error", callback);
    return createDisposable(() => this.events.off("error", callback));
  }

  async listThreads(params: ThreadListParams = {}): Promise<ThreadListResponse> {
    return this.request<ThreadListResponse>("thread/list", params);
  }

  async startThread(params: Partial<ThreadStartParams> = {}): Promise<ThreadStartResponse> {
    return this.request<ThreadStartResponse>("thread/start", {
      experimentalRawEvents: false,
      persistExtendedHistory: true,
      ...params
    });
  }

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

  async readThread(threadId: string, includeTurns = true): Promise<ThreadReadResponse> {
    return this.request<ThreadReadResponse>("thread/read", { threadId, includeTurns });
  }

  async listThreadTurns(params: ThreadTurnsListParams): Promise<ThreadTurnsListResponse> {
    return this.request<ThreadTurnsListResponse>("thread/turns/list", params);
  }

  async startTurn(params: TurnStartParams): Promise<TurnStartResponse> {
    return this.request<TurnStartResponse>("turn/start", params);
  }

  async interruptTurn(threadId: string, turnId: string): Promise<TurnInterruptResponse> {
    return this.request<TurnInterruptResponse>("turn/interrupt", { threadId, turnId });
  }

  async renameThread(threadId: string, name: string): Promise<ThreadSetNameResponse> {
    return this.request<ThreadSetNameResponse>("thread/name/set", { threadId, name });
  }

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

  private rejectPendingRequests(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }

    this.pendingRequests.clear();
  }

  private requireProcess(): ProcessLike {
    if (this.process === null) {
      throw new CodexProcessError("Codex app-server is not running.");
    }

    return this.process;
  }
}

function defaultProcessFactory(command: string, args: string[]): ProcessLike {
  return spawn(resolveCodexCommand(command), args, {
    stdio: ["pipe", "pipe", "pipe"]
  });
}

function resolveCodexCommand(command: string): string {
  if (command !== "codex") {
    return command;
  }

  if (process.env.OPENCODEX_CODEX_COMMAND !== undefined) {
    return process.env.OPENCODEX_CODEX_COMMAND;
  }

  const home = process.env.HOME;

  if (home === undefined || home.length === 0) {
    return command;
  }

  const voltaShim = path.join(home, ".volta", "bin", "codex");

  return existsSync(voltaShim) ? voltaShim : command;
}

function createDisposable(dispose: () => void): Disposable {
  return { dispose };
}

function normalizeProcessError(error: unknown, command: string): CodexProcessError {
  if (isRecord(error) && error.code === "ENOENT") {
    return new CodexProcessError(
      `Codex CLI n'a pas été trouvé dans le PATH: ${command}.`
    );
  }

  if (error instanceof Error) {
    return new CodexProcessError(error.message);
  }

  return new CodexProcessError(String(error));
}
