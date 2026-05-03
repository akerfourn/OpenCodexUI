/**
 * Declares the JSON-RPC types, process abstractions, and error classes used by the Codex client.
 */
import type { ChildProcessWithoutNullStreams } from "node:child_process";

export type JsonRpcId = string | number;

export type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc?: "2.0";
  method: string;
  params?: unknown;
};

export type JsonRpcSuccess = {
  jsonrpc?: "2.0";
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcFailure = {
  jsonrpc?: "2.0";
  id: JsonRpcId;
  error: {
    code?: number;
    message: string;
    data?: unknown;
  };
};

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export type CodexNotification = {
  method: string;
  params?: unknown;
};

export type CodexServerRequest = {
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type Disposable = {
  dispose(): void;
};

export type ProcessLike = Pick<
  ChildProcessWithoutNullStreams,
  "stdin" | "stdout" | "stderr" | "kill" | "killed" | "pid" | "on" | "once"
>;

export type ProcessFactory = (command: string, args: string[]) => ProcessLike;

export type CodexAppServerClientOptions = {
  command?: string;
  args?: string[];
  requestTimeoutMs?: number;
  experimentalApi?: boolean;
  processFactory?: ProcessFactory;
  logger?: (message: string) => void;
  stderr?: (message: string) => void;
};

/**
 * Represents a JSON-RPC error returned by the Codex app-server.
 */
export class JsonRpcError extends Error {
  readonly code: number | undefined;
  readonly data: unknown;

  /**
   * Creates a JSON-RPC error wrapper.
   *
   * @param message Human-readable error message.
   * @param code Optional JSON-RPC error code.
   * @param data Optional raw error payload.
   */
  constructor(message: string, code?: number, data?: unknown) {
    super(message);
    this.name = "JsonRpcError";
    this.code = code;
    this.data = data;
  }
}

/**
 * Represents a process-level failure while communicating with the Codex CLI.
 */
export class CodexProcessError extends Error {
  /**
   * Creates a process error with a normalized message.
   *
   * @param message Human-readable process failure description.
   */
  constructor(message: string) {
    super(message);
    this.name = "CodexProcessError";
  }
}
