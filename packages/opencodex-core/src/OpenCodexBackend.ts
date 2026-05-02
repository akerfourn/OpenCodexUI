import {
  CodexAppServerClient,
  CodexProcessError,
  JsonRpcError,
  type CodexNotification,
  type CodexServerRequest
} from "@open-codex-ui/codex-rpc";
import type {
  CachedThreadDelta,
  CachedThreadSnapshot,
  CachedThreadSummary,
  CachedThreadSyncState,
  OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexApprovalDecision,
  OpenCodexEvent,
  OpenCodexMessage,
  OpenCodexMessagePhase,
  OpenCodexRequest,
  OpenCodexSettings,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import {
  buildApprovalResponse,
  createActivityFromNotification,
  createApprovalRequest,
  mapThread,
  mapTurnsToMessages,
  readMessagePhase,
  readObject,
  readNullableNumber,
  readString
} from "./mapping.js";
import { ThreadTurnCache, type ThreadTurnCacheEntry } from "./ThreadTurnCache.js";
import type { OpenCodexBackendOptions } from "./types.js";

const THREAD_LIST_PAGE_SIZE = 100;
const THREAD_LIST_MAX_PAGES = 20;
const THREAD_TURNS_PAGE_SIZE = 20;

type ThreadSourceKind =
  | "cli"
  | "vscode"
  | "exec"
  | "appServer"
  | "subAgent"
  | "subAgentReview"
  | "subAgentCompact"
  | "subAgentThreadSpawn"
  | "subAgentOther"
  | "unknown";

type ThreadListParams = {
  cursor?: string | null;
  limit?: number | null;
  sortKey?: "created_at" | "updated_at" | null;
  sortDirection?: "asc" | "desc" | null;
  sourceKinds?: ThreadSourceKind[] | null;
  cwd?: string | string[] | null;
  searchTerm?: string | null;
};

const THREAD_SOURCE_KINDS: ThreadSourceKind[] = [
  "cli",
  "vscode",
  "exec",
  "appServer",
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther",
  "unknown"
];

export class OpenCodexBackend {
  private client: CodexAppServerClient | null = null;
  private settings: OpenCodexSettings;
  private readonly pendingApprovals = new Map<string, CodexServerRequest>();
  private readonly assistantMessagePhases = new Map<string, OpenCodexMessagePhase | null>();
  private readonly threadTurnCache = new ThreadTurnCache();
  private readonly cacheRepository: OpenCodexCacheRepository | null;
  private activeTurnId: string | null = null;

  constructor(private readonly options: OpenCodexBackendOptions) {
    this.settings = options.settings;
    this.cacheRepository = options.cacheRepository ?? null;
  }

  async dispose(): Promise<void> {
    await this.client?.stop();
    await this.cacheRepository?.close();
    this.client = null;
  }

  async handleRequest(request: OpenCodexRequest): Promise<unknown> {
    try {
      return await this.handleValidRequest(request);
    } catch (error) {
      const normalized = normalizeError(error);
      this.emit({ type: "error", message: normalized.message, details: normalized.details });
      throw normalized;
    }
  }

  private async handleValidRequest(request: OpenCodexRequest): Promise<unknown> {
    switch (request.type) {
      case "app.bootstrap":
        this.emit({
          type: "app.bootstrap",
          settings: this.settings,
          projectPath: this.options.projectPath
        });
        await this.handleValidRequest({ type: "threads.list", scope: "currentProject" });
        await this.handleValidRequest({ type: "models.list" });
        return { ok: true };
      case "threads.list":
        return this.listThreads(request.scope, request.searchTerm);
      case "threads.open":
        return this.openThread(request.threadId);
      case "threads.loadOlder":
        return this.loadOlderThreadMessages(request.threadId);
      case "threads.create":
        return this.createThread();
      case "threads.rename":
        return this.renameThread(request.threadId, request.name);
      case "system.openLink":
        return this.openLink(request.href);
      case "turn.start":
        return this.startTurn(request.threadId, request.text, request.model ?? null, request.reasoningEffort ?? null);
      case "turn.interrupt":
        return this.interruptTurn(request.threadId, request.turnId);
      case "approval.respond":
        return this.resolveApproval(request.approvalId, request.decision);
      case "models.list":
        return this.listModels();
      case "settings.get":
        return this.settings;
      case "settings.update":
        this.settings = { ...this.settings, ...request.patch };
        await this.options.saveSettings?.(this.settings);
        return this.settings;
    }
  }

  private async ensureClient(): Promise<CodexAppServerClient> {
    if (this.client !== null) {
      return this.client;
    }

    this.emit({ type: "connection.status", status: "starting" });

    const client = new CodexAppServerClient({
      command: this.settings.codexCommand,
      experimentalApi: this.settings.experimentalApi,
      logger: (message) => this.options.logger?.(message)
    });

    this.client = client;
    client.onNotification((notification) => this.handleNotification(notification));
    client.onServerRequest((request) => this.handleServerRequest(request));
    client.onError((error) => this.handleClientError(error));

    await client.start();
    this.emit({ type: "connection.status", status: "ready" });
    return client;
  }

  private async listThreads(scope: "currentProject" | "all", searchTerm?: string): Promise<OpenCodexThread[]> {
    const cachedThreads = await this.readCachedThreads(scope, searchTerm);

    if (cachedThreads.length > 0) {
      this.emitThreadsUpdated(cachedThreads);
    }

    const client = await this.ensureClient();
    const params: ThreadListParams = {
      limit: THREAD_LIST_PAGE_SIZE,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: THREAD_SOURCE_KINDS
    };
    const trimmedSearchTerm = searchTerm?.trim() ?? "";

    if (trimmedSearchTerm.length > 0) {
      params.searchTerm = trimmedSearchTerm;
    }

    if (scope === "currentProject" && this.options.projectPath !== null) {
      params.cwd = this.options.projectPath;
    }

    const threads = await readThreadPages(client, params);
    await this.writeThreadIndex(threads);

    this.emitThreadsUpdated(threads);

    return threads;
  }

  private async openThread(threadId: string): Promise<{ thread: OpenCodexThread; messages: OpenCodexMessage[] }> {
    const cachedSnapshot = await this.readCachedThreadSnapshot(threadId);

    if (cachedSnapshot !== null && cachedSnapshot.syncState.hasLoadedLatest) {
      const cacheEntry = this.threadTurnCache.replaceFromSnapshot(cachedSnapshot);
      const messages = this.readCachedMessages(cacheEntry);

      this.emitThreadOpened(cacheEntry, messages);
      void this.resumeAndSyncCachedThread(threadId).catch((error: unknown) => {
        this.handleClientError(toError(error));
      });

      return { thread: cacheEntry.thread, messages };
    }

    const client = await this.ensureClient();
    const response = await client.resumeThread(threadId, { excludeTurns: true });
    const responseObject = readObject(response);
    const threadValue = responseObject.thread;
    const thread = mapThread(
      threadValue,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    );
    const cacheEntry = this.threadTurnCache.getOrCreate(thread);

    if (cacheEntry.hasLoadedLatest) {
      const messages = this.readCachedMessages(cacheEntry);
      this.emitThreadOpened(cacheEntry, messages);
      void this.syncLatestTurns(client, cacheEntry).catch((error: unknown) => {
        this.handleClientError(toError(error));
      });
      return { thread, messages };
    }

    await this.loadLatestTurns(client, cacheEntry);
    await this.writeThreadSnapshot(cacheEntry);
    const messages = this.readCachedMessages(cacheEntry);
    this.emitThreadOpened(cacheEntry, messages);
    return { thread, messages };
  }

  private async loadLatestTurns(
    client: CodexAppServerClient,
    cacheEntry: ThreadTurnCacheEntry
  ): Promise<void> {
    const response = await client.listThreadTurns({
      threadId: cacheEntry.thread.id,
      limit: THREAD_TURNS_PAGE_SIZE,
      sortDirection: "desc"
    });
    const responseObject = readObject(response);
    const turns = Array.isArray(responseObject.data) ? responseObject.data : [];
    const olderCursor = readString(responseObject.nextCursor) || null;

    this.threadTurnCache.mergeLatestTurns(cacheEntry, turns, olderCursor);
  }

  private async loadOlderThreadMessages(
    threadId: string
  ): Promise<{ messages: OpenCodexMessage[]; hasMoreOlderMessages: boolean }> {
    const client = await this.ensureClient();
    const cacheEntry = this.threadTurnCache.get(threadId);

    if (cacheEntry === null || cacheEntry.hasLoadedAllOlderTurns || cacheEntry.olderCursor === null) {
      return { messages: [], hasMoreOlderMessages: false };
    }

    const response = await client.listThreadTurns({
      threadId,
      cursor: cacheEntry.olderCursor,
      limit: THREAD_TURNS_PAGE_SIZE,
      sortDirection: "desc"
    });
    const responseObject = readObject(response);
    const turns = Array.isArray(responseObject.data) ? responseObject.data : [];
    const olderCursor = readString(responseObject.nextCursor) || null;
    const previousTurnIds = new Set(cacheEntry.orderedTurnIds);

    this.threadTurnCache.mergeOlderTurns(cacheEntry, turns, olderCursor);
    await this.writeThreadDelta(cacheEntry, turns);

    const addedTurns = this.threadTurnCache
      .toTurns(cacheEntry)
      .filter((turn) => !previousTurnIds.has(readString(readObject(turn).id)));
    const messages = mapTurnsToMessages(threadId, addedTurns);
    const hasMoreOlderMessages = !cacheEntry.hasLoadedAllOlderTurns;

    if (messages.length > 0) {
      this.emit({
        type: "thread.messages.prepended",
        threadId,
        messages,
        hasMoreOlderMessages
      });
    }

    return { messages, hasMoreOlderMessages };
  }

  private async syncLatestTurns(
    client: CodexAppServerClient,
    cacheEntry: ThreadTurnCacheEntry
  ): Promise<void> {
    this.emit({ type: "thread.sync.started", threadId: cacheEntry.thread.id });

    try {
      const previousSignature = createCacheSignature(cacheEntry);
      await this.loadLatestTurns(client, cacheEntry);
      await this.writeThreadSnapshot(cacheEntry);
      const nextSignature = createCacheSignature(cacheEntry);

      if (previousSignature !== nextSignature) {
        this.emit({
          type: "thread.messages.synced",
          threadId: cacheEntry.thread.id,
          messages: this.readCachedMessages(cacheEntry),
          hasMoreOlderMessages: !cacheEntry.hasLoadedAllOlderTurns
        });
      }
    } finally {
      this.emit({ type: "thread.sync.completed", threadId: cacheEntry.thread.id });
    }
  }

  private readCachedMessages(cacheEntry: ThreadTurnCacheEntry): OpenCodexMessage[] {
    return mapTurnsToMessages(cacheEntry.thread.id, this.threadTurnCache.toTurns(cacheEntry));
  }

  private async resumeAndSyncCachedThread(threadId: string): Promise<void> {
    const client = await this.ensureClient();
    const response = await client.resumeThread(threadId, { excludeTurns: true });
    const responseObject = readObject(response);
    const thread = mapThread(
      responseObject.thread,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    );
    const cacheEntry = this.threadTurnCache.getOrCreate(thread);

    await this.writeThreadIndex([thread]);
    await this.syncLatestTurns(client, cacheEntry);
  }

  private emitThreadOpened(cacheEntry: ThreadTurnCacheEntry, messages: OpenCodexMessage[]): void {
    this.emit({
      type: "thread.opened",
      thread: cacheEntry.thread,
      messages,
      hasMoreOlderMessages: !cacheEntry.hasLoadedAllOlderTurns
    });
  }

  private async createThread(): Promise<{ thread: OpenCodexThread; messages: OpenCodexMessage[] }> {
    const client = await this.ensureClient();
    const response = await client.startThread({
      cwd: this.options.projectPath,
      model: this.settings.defaultModel
    });
    const responseObject = readObject(response);
    const thread = mapThread(
      responseObject.thread,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    );
    const messages: OpenCodexMessage[] = [];

    this.emit({ type: "thread.created", thread, messages });
    await this.writeThreadIndex([thread]);
    return { thread, messages };
  }

  private async startTurn(
    threadId: string | null,
    text: string,
    model: string | null,
    reasoningEffort: "low" | "medium" | "high" | "xhigh" | null
  ): Promise<{ threadId: string; turnId: string }> {
    const trimmedText = text.trim();

    if (trimmedText.length === 0) {
      return { threadId: threadId ?? "", turnId: "" };
    }

    const client = await this.ensureClient();
    const targetThreadId = threadId ?? (await this.createThreadAndReturnId(client));
    const message: OpenCodexMessage = {
      id: createId("user"),
      threadId: targetThreadId,
      role: "user",
      content: trimmedText,
      status: "completed",
      createdAt: new Date().toISOString()
    };

    this.emit({ type: "message.started", threadId: targetThreadId, message });

    const turnResponse = await client.startTurn({
      threadId: targetThreadId,
      input: [{ type: "text", text: trimmedText, text_elements: [] }],
      model,
      effort: reasoningEffort ?? this.settings.defaultReasoningEffort
    });
    const turn = readObject(readObject(turnResponse).turn);
    const turnId = readString(turn.id);
    this.activeTurnId = turnId;

    if (turnId.length > 0) {
      this.emit({ type: "turn.started", threadId: targetThreadId, turnId });
    }

    return { threadId: targetThreadId, turnId };
  }

  private async createThreadAndReturnId(client: CodexAppServerClient): Promise<string> {
    const response = await client.startThread({
      cwd: this.options.projectPath,
      model: this.settings.defaultModel
    });
    const responseObject = readObject(response);
    const thread = mapThread(
      responseObject.thread,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    );
    await this.writeThreadIndex([thread]);
    this.emit({ type: "thread.created", thread, messages: [] });
    return thread.id;
  }

  private async interruptTurn(threadId: string, turnId: string): Promise<void> {
    const client = await this.ensureClient();
    await client.interruptTurn(threadId, turnId);
  }

  private async renameThread(threadId: string, name: string): Promise<void> {
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      return;
    }

    const client = await this.ensureClient();
    await client.renameThread(threadId, trimmedName);
    this.emit({ type: "thread.renamed", threadId, name: trimmedName });
  }

  private async openLink(href: string): Promise<{ ok: true }> {
    const target = href.trim();

    if (target.length === 0) {
      return { ok: true };
    }

    if (this.options.openExternalLink === undefined) {
      throw new Error("Aucun gestionnaire d'ouverture de lien externe n'est configuré.");
    }

    await this.options.openExternalLink(target);
    return { ok: true };
  }

  private async listModels(): Promise<string[]> {
    const client = await this.ensureClient();

    try {
      const response = await client.request("model/list", { limit: 100 });
      const models = readModels(response);
      const resolvedModels = models.length > 0 ? models : fallbackModels();
      this.emit({ type: "models.updated", models: resolvedModels });
      return resolvedModels;
    } catch (error) {
      this.options.logger?.(`model/list unavailable: ${String(error)}`);
      const models = fallbackModels();
      this.emit({ type: "models.updated", models });
      return models;
    }
  }

  private handleNotification(notification: CodexNotification): void {
    const activity = createActivityFromNotification(notification);

    if (activity !== null && this.settings.showActivityPanel) {
      this.emit({ type: "activity.updated", threadId: activity.threadId, activity });
    }

    const params = readObject(notification.params);

    if (notification.method === "item/agentMessage/delta") {
      const threadId = readString(params.threadId);
      const turnId = readString(params.turnId);
      const messageId = readString(params.itemId);
      const delta = readString(params.delta);
      const phase = this.assistantMessagePhases.get(messageId) ?? null;

      if (threadId.length > 0 && turnId.length > 0 && messageId.length > 0 && delta.length > 0) {
        this.emit({ type: "message.delta", threadId, turnId, messageId, delta, phase });
      }
    }

    if (notification.method === "item/started") {
      const item = readObject(params.item);

      if (readString(item.type) === "agentMessage") {
        const messageId = readString(item.id);
        const phase = readMessagePhase(item.phase);

        if (messageId.length > 0) {
          this.assistantMessagePhases.set(messageId, phase);
        }
      }
    }

    if (notification.method === "item/completed") {
      const item = readObject(params.item);

      if (readString(item.type) === "agentMessage") {
        const messageId = readString(item.id);

        if (messageId.length > 0) {
          this.assistantMessagePhases.delete(messageId);
        }
      }
    }

    if (notification.method === "turn/started") {
      const threadId = readString(params.threadId);
      const turnId = readString(readObject(params.turn).id);

      if (threadId.length > 0 && turnId.length > 0) {
        this.activeTurnId = turnId;
        this.emit({ type: "turn.started", threadId, turnId });
      }
    }

    if (notification.method === "turn/completed") {
      const threadId = readString(params.threadId);
      const turnId = readString(readObject(params.turn).id) || this.activeTurnId;
      const durationMs = readNullableNumber(readObject(params.turn).durationMs);

      if (threadId.length > 0 && turnId !== null && turnId.length > 0) {
        this.emit({ type: "turn.completed", threadId, turnId, durationMs });
      }
    }

    if (notification.method === "thread/name/updated") {
      const threadId = readString(params.threadId);
      const name = readString(params.name);

      if (threadId.length > 0) {
        this.emit({ type: "thread.renamed", threadId, name });
      }
    }
  }

  private handleServerRequest(request: CodexServerRequest): void {
    const approval = createApprovalRequest(request);
    this.pendingApprovals.set(approval.id, request);
    this.emit({ type: "approval.requested", approval });
  }

  private resolveApproval(approvalId: string, decision: OpenCodexApprovalDecision): void {
    const request = this.pendingApprovals.get(approvalId);

    if (request === undefined || this.client === null) {
      this.emit({ type: "error", message: "La demande d'approbation n'est plus disponible." });
      return;
    }

    this.pendingApprovals.delete(approvalId);

    if (request.method === "item/permissions/requestApproval" && decision !== "accept") {
      this.client.rejectServerRequest(request.id, "Permission request declined by the user.");
    } else {
      this.client.respond(request.id, buildApprovalResponse(request.method, decision));
    }

    this.emit({ type: "approval.resolved", approvalId });
  }

  private handleClientError(error: Error): void {
    const normalized = normalizeError(error);
    this.emit({ type: "error", message: normalized.message, details: normalized.details });
  }

  private emit(event: OpenCodexEvent): void {
    this.options.emit(event);
  }

  private emitThreadsUpdated(threads: OpenCodexThread[]): void {
    this.emit({
      type: "threads.updated",
      threads,
      currentProjectFilterAvailable: this.options.projectPath !== null
    });
  }

  private async readCachedThreads(
    scope: "currentProject" | "all",
    searchTerm?: string
  ): Promise<OpenCodexThread[]> {
    if (this.cacheRepository === null) {
      return [];
    }

    try {
      const threads = await this.cacheRepository.listThreads({
        scope,
        currentProjectPath: this.options.projectPath,
        searchTerm
      });
      return threads.map((thread) => toOpenCodexThread(thread));
    } catch (error) {
      this.options.logger?.(`thread cache read failed: ${String(error)}`);
      return [];
    }
  }

  private async readCachedThreadSnapshot(threadId: string): Promise<CachedThreadSnapshot | null> {
    if (this.cacheRepository === null) {
      return null;
    }

    try {
      return await this.cacheRepository.getThread(threadId);
    } catch (error) {
      this.options.logger?.(`thread cache snapshot read failed: ${String(error)}`);
      return null;
    }
  }

  private async writeThreadIndex(threads: OpenCodexThread[]): Promise<void> {
    if (this.cacheRepository === null || threads.length === 0) {
      return;
    }

    try {
      await this.cacheRepository.upsertThreadIndex(threads.map((thread) => toCachedThreadSummary(thread)));
    } catch (error) {
      this.options.logger?.(`thread cache index write failed: ${String(error)}`);
    }
  }

  private async writeThreadSnapshot(cacheEntry: ThreadTurnCacheEntry): Promise<void> {
    if (this.cacheRepository === null) {
      return;
    }

    try {
      await this.cacheRepository.saveThreadSnapshot(toCachedThreadSnapshot(cacheEntry));
    } catch (error) {
      this.options.logger?.(`thread cache snapshot write failed: ${String(error)}`);
    }
  }

  private async writeThreadDelta(cacheEntry: ThreadTurnCacheEntry, turns: unknown[]): Promise<void> {
    if (this.cacheRepository === null || turns.length === 0) {
      return;
    }

    try {
      await this.cacheRepository.saveThreadDelta(toCachedThreadDelta(cacheEntry, turns));
    } catch (error) {
      this.options.logger?.(`thread cache delta write failed: ${String(error)}`);
    }
  }
}

async function readThreadPages(
  client: CodexAppServerClient,
  baseParams: ThreadListParams
): Promise<OpenCodexThread[]> {
  const threads: OpenCodexThread[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < THREAD_LIST_MAX_PAGES; page += 1) {
    const params = cursor === null ? baseParams : { ...baseParams, cursor };
    const response = await client.listThreads(params);
    threads.push(...readThreads(response));
    cursor = readString(readObject(response).nextCursor) || null;

    if (cursor === null) {
      break;
    }
  }

  return threads;
}

function readThreads(response: unknown): OpenCodexThread[] {
  const data = readObject(response).data;

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((thread) => mapThread(thread));
}

function readModels(response: unknown): string[] {
  const data = readObject(response).data;

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((model) => readObject(model))
    .map((model) => readString(model.model) || readString(model.id))
    .filter((model) => model.length > 0);
}

function readReasoningEffort(value: unknown): "low" | "medium" | "high" | "xhigh" | null {
  if (value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }

  return null;
}

function fallbackModels(): string[] {
  return ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"];
}

function normalizeError(error: unknown): { message: string; details?: unknown } {
  if (error instanceof CodexProcessError) {
    return {
      message: error.message,
      details: "Vérifiez que Codex CLI est installé et que codexCommand pointe vers le bon exécutable."
    };
  }

  if (error instanceof JsonRpcError) {
    return {
      message: `Codex app-server a refusé la requête: ${error.message}`,
      details: error.data
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack
    };
  }

  return { message: String(error) };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function createCacheSignature(cacheEntry: ThreadTurnCacheEntry): string {
  return cacheEntry.orderedTurnIds
    .map((turnId) => {
      const turn = readObject(cacheEntry.turnsById.get(turnId));
      const status = readString(turn.status);
      const durationMs = readNullableNumber(turn.durationMs);
      const items = Array.isArray(turn.items) ? turn.items : [];

      return `${turnId}:${status}:${durationMs ?? "none"}:${items.length}`;
    })
    .join("|");
}

function toOpenCodexThread(thread: CachedThreadSummary): OpenCodexThread {
  const mappedThread: OpenCodexThread = {
    id: thread.id,
    title: thread.title,
    preview: thread.preview,
    model: thread.model,
    reasoningEffort: thread.reasoningEffort,
    projectName: thread.projectName,
    projectPath: thread.projectPath,
    branchName: thread.branchName,
    updatedAt: thread.updatedAt
  };

  if (thread.status !== undefined) {
    mappedThread.status = thread.status;
  }

  return mappedThread;
}

function toCachedThreadSummary(thread: OpenCodexThread): CachedThreadSummary {
  const cachedThread: CachedThreadSummary = {
    id: thread.id,
    title: thread.title,
    preview: thread.preview,
    model: thread.model,
    reasoningEffort: thread.reasoningEffort,
    projectName: thread.projectName,
    projectPath: thread.projectPath,
    branchName: thread.branchName,
    updatedAt: thread.updatedAt
  };

  if (thread.status !== undefined) {
    cachedThread.status = thread.status;
  }

  return cachedThread;
}

function toCachedThreadSnapshot(cacheEntry: ThreadTurnCacheEntry): CachedThreadSnapshot {
  return {
    thread: toCachedThreadSummary(cacheEntry.thread),
    turns: Array.from(cacheEntry.turnsById.values()),
    syncState: toCachedSyncState(cacheEntry)
  };
}

function toCachedThreadDelta(cacheEntry: ThreadTurnCacheEntry, turns: unknown[]): CachedThreadDelta {
  return {
    threadId: cacheEntry.thread.id,
    turns,
    syncState: toCachedSyncState(cacheEntry)
  };
}

function toCachedSyncState(cacheEntry: ThreadTurnCacheEntry): CachedThreadSyncState {
  return {
    threadId: cacheEntry.thread.id,
    newestTurnId: cacheEntry.newestTurnId,
    oldestTurnId: cacheEntry.oldestTurnId,
    olderCursor: cacheEntry.olderCursor,
    hasLoadedLatest: cacheEntry.hasLoadedLatest,
    hasLoadedAllOlderTurns: cacheEntry.hasLoadedAllOlderTurns,
    lastSyncedAt: cacheEntry.lastSyncedAt
  };
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
