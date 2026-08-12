/**
 * Provides typed JSON-RPC methods for the local `codex app-server` process.
 */
import { CodexAppServerTransport } from "./CodexAppServerTransport";
import type {
  CodexAppServerClientOptions,
  CodexNotification,
  CodexServerRequest,
  Disposable,
  JsonRpcId
} from "./types";

import type { ThreadListParams } from "./generated/v2/ThreadListParams";
import type { ThreadListResponse } from "./generated/v2/ThreadListResponse";
import type { ThreadArchiveResponse } from "./generated/v2/ThreadArchiveResponse";
import type { ThreadDeleteResponse } from "./generated/v2/ThreadDeleteResponse";
import type { ThreadReadResponse } from "./generated/v2/ThreadReadResponse";
import type { ThreadResumeParams } from "./generated/v2/ThreadResumeParams";
import type { ThreadResumeResponse } from "./generated/v2/ThreadResumeResponse";
import type { ThreadRollbackParams } from "./generated/v2/ThreadRollbackParams";
import type { ThreadRollbackResponse } from "./generated/v2/ThreadRollbackResponse";
import type { ThreadCompactStartResponse } from "./generated/v2/ThreadCompactStartResponse";
import type { ThreadSetNameResponse } from "./generated/v2/ThreadSetNameResponse";
import type { ThreadStartParams } from "./generated/v2/ThreadStartParams";
import type { ThreadStartResponse } from "./generated/v2/ThreadStartResponse";
import type { ThreadUnarchiveResponse } from "./generated/v2/ThreadUnarchiveResponse";
import type { ThreadItemsListParams } from "./generated/v2/ThreadItemsListParams";
import type { ThreadItemsListResponse } from "./generated/v2/ThreadItemsListResponse";
import type { ThreadTurnsListParams } from "./generated/v2/ThreadTurnsListParams";
import type { ThreadTurnsListResponse } from "./generated/v2/ThreadTurnsListResponse";
import type { FsCreateDirectoryResponse } from "./generated/v2/FsCreateDirectoryResponse";
import type { FsGetMetadataResponse } from "./generated/v2/FsGetMetadataResponse";
import type { FsReadFileResponse } from "./generated/v2/FsReadFileResponse";
import type { FsWriteFileResponse } from "./generated/v2/FsWriteFileResponse";
import type { ReviewStartResponse } from "./generated/v2/ReviewStartResponse";
import type { TurnInterruptResponse } from "./generated/v2/TurnInterruptResponse";
import type { TurnStartParams } from "./generated/v2/TurnStartParams";
import type { TurnStartResponse } from "./generated/v2/TurnStartResponse";
import type { TurnSteerParams } from "./generated/v2/TurnSteerParams";
import type { TurnSteerResponse } from "./generated/v2/TurnSteerResponse";

/**
 * Manages the lifecycle of the Codex app-server process and the JSON-RPC messages exchanged with it.
 */
export class CodexAppServerClient {
  private readonly transport: CodexAppServerTransport;

  /**
   * Creates a client with optional command, timeout, and process overrides.
   *
   * @param options Runtime options for launching and observing the Codex app-server.
   */
  constructor(options: CodexAppServerClientOptions = {}) {
    this.transport = new CodexAppServerTransport(options);
  }

  /**
   * Starts the Codex app-server process and runs the JSON-RPC initialization handshake.
   *
   * @returns Promise resolved once the client is ready to send requests.
   */
  async start(): Promise<void> {
    return this.transport.start();
  }

  /**
   * Stops the Codex app-server process and rejects outstanding requests.
   *
   * @returns Promise resolved once local process state has been cleared.
   */
  async stop(): Promise<void> {
    return this.transport.stop();
  }

  /**
   * Sends a JSON-RPC request and waits for its correlated response.
   *
   * @param method JSON-RPC method name to invoke.
   * @param params Optional request parameters.
   * @returns Promise resolved with the typed JSON-RPC result.
   */
  async request<T>(method: string, params?: unknown): Promise<T> {
    return this.transport.request<T>(method, params);
  }

  /**
   * Sends a fire-and-forget JSON-RPC notification.
   *
   * @param method JSON-RPC method name to invoke.
   * @param params Optional notification parameters.
   * @returns Nothing.
   */
  notify(method: string, params?: unknown): void {
    this.transport.notify(method, params);
  }

  /**
   * Sends a successful response to a server-initiated JSON-RPC request.
   *
   * @param id JSON-RPC identifier from the incoming server request.
   * @param result Result payload returned to the server.
   * @returns Nothing.
   */
  respond(id: JsonRpcId, result: unknown): void {
    this.transport.respond(id, result);
  }

  /**
   * Rejects a server-initiated JSON-RPC request with an error response.
   *
   * @param id JSON-RPC identifier from the incoming server request.
   * @param message Error message returned to the server.
   * @returns Nothing.
   */
  rejectServerRequest(id: JsonRpcId, message: string): void {
    this.transport.rejectServerRequest(id, message);
  }

  /**
   * Subscribes to JSON-RPC notifications emitted by the app-server.
   *
   * @param callback Listener invoked for each notification.
   * @returns Disposable used to remove the listener.
   */
  onNotification(callback: (notification: CodexNotification) => void): Disposable {
    return this.transport.onNotification(callback);
  }

  /**
   * Subscribes to server-originated JSON-RPC requests.
   *
   * @param callback Listener invoked for each server request.
   * @returns Disposable used to remove the listener.
   */
  onServerRequest(callback: (request: CodexServerRequest) => void): Disposable {
    return this.transport.onServerRequest(callback);
  }

  /**
   * Subscribes to transport or parsing errors raised by the client.
   *
   * @param callback Listener invoked for each emitted error.
   * @returns Disposable used to remove the listener.
   */
  onError(callback: (error: Error) => void): Disposable {
    return this.transport.onError(callback);
  }

  /**
   * Subscribes to the underlying process close event.
   *
   * @param callback Listener invoked when the app-server process exits.
   * @returns Disposable used to remove the listener.
   */
  onClose(callback: (event: { code: number | null; signal: NodeJS.Signals | null }) => void): Disposable {
    return this.transport.onClose(callback);
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
   * Archives a Codex thread.
   *
   * @param threadId Identifier of the thread to archive.
   * @returns Empty success response.
   */
  async archiveThread(threadId: string): Promise<ThreadArchiveResponse> {
    return this.request<ThreadArchiveResponse>("thread/archive", { threadId });
  }

  /**
   * Permanently deletes a Codex thread.
   *
   * @param threadId Identifier of the thread to delete.
   * @returns Empty success response.
   */
  async deleteThread(threadId: string): Promise<ThreadDeleteResponse> {
    return this.request<ThreadDeleteResponse>("thread/delete", { threadId });
  }

  /**
   * Restores an archived Codex thread.
   *
   * @param threadId Identifier of the thread to restore.
   * @returns Promise resolved with the restored thread.
   */
  async unarchiveThread(threadId: string): Promise<ThreadUnarchiveResponse> {
    return this.request<ThreadUnarchiveResponse>("thread/unarchive", { threadId });
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
    params: Partial<Omit<ThreadResumeParams, "threadId">> = {}
  ): Promise<ThreadResumeResponse> {
    return this.request<ThreadResumeResponse>("thread/resume", {
      threadId,
      ...params
    });
  }

  /**
   * Reads a file through Codex app-server filesystem access.
   *
   * @param path Absolute source-local file path.
   * @returns Base64 encoded file contents.
   */
  async readFile(path: string): Promise<FsReadFileResponse> {
    return this.request<FsReadFileResponse>("fs/readFile", { path });
  }

  /**
   * Writes a file through Codex app-server filesystem access.
   *
   * @param path Absolute source-local file path.
   * @param dataBase64 Base64 encoded file contents.
   * @returns Empty success response.
   */
  async writeFile(path: string, dataBase64: string): Promise<FsWriteFileResponse> {
    return this.request<FsWriteFileResponse>("fs/writeFile", { path, dataBase64 });
  }

  /**
   * Creates a directory through Codex app-server filesystem access.
   *
   * @param path Absolute source-local directory path.
   * @returns Empty success response.
   */
  async createDirectory(path: string): Promise<FsCreateDirectoryResponse> {
    return this.request<FsCreateDirectoryResponse>("fs/createDirectory", {
      path,
      recursive: true
    });
  }

  /**
   * Reads filesystem metadata through Codex app-server filesystem access.
   *
   * @param path Absolute source-local path.
   * @returns Path metadata.
   */
  async getMetadata(path: string): Promise<FsGetMetadataResponse> {
    return this.request<FsGetMetadataResponse>("fs/getMetadata", { path });
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
   * Drops turns from the end of a thread.
   *
   * @param params Rollback parameters.
   * @returns Promise resolved with the updated thread.
   */
  async rollbackThread(params: ThreadRollbackParams): Promise<ThreadRollbackResponse> {
    return this.request<ThreadRollbackResponse>("thread/rollback", params);
  }

  /**
   * Starts a context compaction for a thread.
   *
   * @param threadId Identifier of the thread to compact.
   * @returns Promise resolved once the request is accepted.
   */
  async compactThread(threadId: string): Promise<ThreadCompactStartResponse> {
    return this.request<ThreadCompactStartResponse>("thread/compact/start", { threadId });
  }

  /**
   * Starts an inline review of the thread's uncommitted changes.
   *
   * @param threadId Identifier of the thread to review.
   * @returns Promise resolved with the review turn metadata.
   */
  async startReview(threadId: string): Promise<ReviewStartResponse> {
    return this.request<ReviewStartResponse>("review/start", {
      threadId,
      target: { type: "uncommittedChanges" },
      delivery: "inline"
    });
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
   * Lists full items for a specific turn using the generated typed RPC bindings.
   *
   * @param params Thread turn items list parameters.
   * @returns Promise resolved with the turn items list response.
   */
  async listThreadTurnItems(
    params: ThreadItemsListParams
  ): Promise<ThreadItemsListResponse> {
    return this.request<ThreadItemsListResponse>("thread/items/list", params);
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
   * Steers an active turn inside an existing thread.
   *
   * @param params Turn steer parameters.
   * @returns Promise resolved with the turn steer response.
   */
  async steerTurn(params: TurnSteerParams): Promise<TurnSteerResponse> {
    return this.request<TurnSteerResponse>("turn/steer", params);
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
}

export {
  readCodexCommandCandidates,
  resolveCodexCommand,
  resolveCodexCommandPath
} from "./process";
export type { ResolvedCodexCommand } from "./process";
