/**
 * Owns the process and JSON-RPC transport used by the Codex app-server client.
 */
import { EventEmitter } from "node:events";
import { createInterface, type Interface } from "node:readline";

import { createDisposable } from "./disposable";
import { isRecord, parseJsonRpcLine, stringifyJsonLine } from "./events";
import { defaultProcessFactory, normalizeProcessError } from "./process";
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

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type TransportEvents = {
  notification: [CodexNotification];
  serverRequest: [CodexServerRequest];
  error: [Error];
  close: [{ code: number | null; signal: NodeJS.Signals | null }];
};

/**
 * Manages the Codex app-server process and its JSON-RPC message transport.
 */
export class CodexAppServerTransport {
  private readonly command: string;
  private readonly args: string[];
  private readonly clientInfo: { name: string; version: string };
  private readonly requestTimeoutMs: number;
  private readonly experimentalApi: boolean;
  private readonly processFactory: ProcessFactory;
  private readonly logger: (message: string) => void;
  private readonly stderr: (message: string) => void;
  private readonly events = new EventEmitter<TransportEvents>();
  private readonly pendingRequests = new Map<JsonRpcId, PendingRequest>();

  private process: ProcessLike | null = null;
  private stdoutReader: Interface | null = null;
  private nextId = 1;
  private startPromise: Promise<void> | null = null;
  private isInitialized = false;
  private isStopping = false;

  /**
   * Creates a transport with the process and protocol options supplied by the client.
   *
   * @param options Runtime options for launching and observing the Codex app-server.
   */
  constructor(options: CodexAppServerClientOptions = {}) {
    this.command = options.command ?? "codex";
    this.args = options.args ?? ["app-server"];
    this.clientInfo = options.clientInfo ?? { name: "OpenCodexUI", version: "unknown" };
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
    this.experimentalApi = options.experimentalApi ?? true;
    this.processFactory = options.processFactory ?? defaultProcessFactory;
    this.logger = options.logger ?? (() => undefined);
    this.stderr = options.stderr ?? (() => undefined);
  }

  /**
   * Starts the Codex app-server process and runs the JSON-RPC initialization handshake.
   *
   * @returns Promise resolved once the transport is ready to send requests.
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
    this.isStopping = true;
    this.rejectPendingRequests(new CodexProcessError("Codex app-server stopped."));
    this.isInitialized = false;
    this.startPromise = null;

    this.stdoutReader?.close();
    this.stdoutReader = null;

    const process = this.process;
    this.process = null;

    if (process === null) {
      this.isStopping = false;
      return;
    }

    if (process.killed) {
      this.isStopping = false;
      return;
    }

    try {
      process.kill();
    } catch (error) {
      this.logger(`Codex app-server shutdown kill failed: ${String(error)}`);
      this.isStopping = false;
    }
  }

  /**
   * Sends a JSON-RPC request and waits for its correlated response.
   *
   * `initialize` is intentionally allowed through without starting the transport;
   * it is sent by `startProcess` after the process and readers have been installed.
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
      if (this.isStopping) {
        this.logger(`Codex app-server process error during shutdown: ${error.message}`);
        return;
      }

      const processError = normalizeProcessError(error, this.command);
      this.events.emit("error", processError);
      this.rejectPendingRequests(processError);
      this.startPromise = null;
    });

    process.once("close", (code: number | null, signal: NodeJS.Signals | null) => {
      const wasStopping = this.isStopping;
      this.isStopping = false;
      this.isInitialized = false;
      this.startPromise = null;
      this.process = null;

      if (!wasStopping) {
        this.events.emit("close", { code, signal });
        this.rejectPendingRequests(new CodexProcessError("Codex app-server process exited."));
      }
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
      clientInfo: this.clientInfo,
      capabilities: {
        experimentalApi: this.experimentalApi,
        requestAttestation: false
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
