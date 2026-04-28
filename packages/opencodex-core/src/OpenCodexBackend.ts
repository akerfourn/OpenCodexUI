import {
  CodexAppServerClient,
  CodexProcessError,
  JsonRpcError,
  type CodexNotification,
  type CodexServerRequest
} from "@open-codex-ui/codex-rpc";
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
  mapThreadMessages,
  readMessagePhase,
  readObject,
  readString
} from "./mapping.js";
import type { OpenCodexBackendOptions } from "./types.js";

const THREAD_LIST_PAGE_SIZE = 100;
const THREAD_LIST_MAX_PAGES = 20;

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
  private activeTurnId: string | null = null;

  constructor(private readonly options: OpenCodexBackendOptions) {
    this.settings = options.settings;
  }

  async dispose(): Promise<void> {
    await this.client?.stop();
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
        await this.ensureClient();
        await Promise.all([
          this.handleValidRequest({ type: "models.list" }),
          this.handleValidRequest({ type: "threads.list", scope: "currentProject" })
        ]);
        return { ok: true };
      case "threads.list":
        return this.listThreads(request.scope, request.searchTerm);
      case "threads.open":
        return this.openThread(request.threadId);
      case "threads.create":
        return this.createThread();
      case "threads.rename":
        return this.renameThread(request.threadId, request.name);
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

    this.emit({
      type: "threads.updated",
      threads,
      currentProjectFilterAvailable: this.options.projectPath !== null
    });

    return threads;
  }

  private async openThread(threadId: string): Promise<{ thread: OpenCodexThread; messages: OpenCodexMessage[] }> {
    const client = await this.ensureClient();
    const response = await client.resumeThread(threadId);
    const responseObject = readObject(response);
    const threadValue = responseObject.thread;
    const thread = mapThread(
      threadValue,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    );
    const messages = mapThreadMessages(threadValue);

    this.emit({ type: "thread.opened", thread, messages });
    return { thread, messages };
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

      if (threadId.length > 0 && turnId !== null && turnId.length > 0) {
        this.emit({ type: "turn.completed", threadId, turnId });
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

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
