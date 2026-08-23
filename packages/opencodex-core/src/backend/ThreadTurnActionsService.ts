import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";

import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexComposerReference,
  OpenCodexImageAttachment,
  OpenCodexMessage,
  OpenCodexReasoningEffort,
  OpenCodexTurn,
  OpenCodexTurnExecutionMetadata
} from "@open-codex-ui/opencodex-protocol";

import { mapThread, readObject, readString } from "../mapping.js";
import type { ThreadTurnCache, ThreadTurnCacheEntry } from "../ThreadTurnCache.js";
import type { OpenCodexBackendOptions } from "../types.js";
import type { CollaborationService } from "./CollaborationService.js";
import type { ThreadCacheService } from "./ThreadCacheService.js";
import type { ThreadCreationService } from "./ThreadCreationService.js";
import type { ThreadSourceResolver } from "./ThreadSourceResolver.js";
import { withSourceId } from "./threadCacheMapping.js";
import { buildTurnInput, createId } from "./turnInput.js";
import type {
  ClientPort,
  ProjectSourcePort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "./runtime/runtimePorts.js";

/** Dependencies required to execute source-aware thread turn actions. */
export type ThreadTurnActionsServiceOptions = {
  /** Backend options whose project path is used when an action omits its path. */
  backendOptions: Pick<OpenCodexBackendOptions, "projectPath">;
  /** In-memory thread and turn state used by turn actions. */
  threadTurnCache: Pick<
    ThreadTurnCache,
    "get" | "getOrCreate" | "recordLiveItem" | "replaceThreadTurns"
  >;
  /** Cache persistence operations needed by turn actions. */
  threadCacheService: Pick<
    ThreadCacheService,
    | "readTurns"
    | "writeDelta"
    | "writeIndex"
    | "writeSnapshot"
    | "writeTurnExecutionMetadata"
  >;
  /** Reads the current settings snapshot. */
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  /** Emits backend events. */
  events: Pick<RuntimeEventPort, "emit">;
  /** Resolves source-scoped Codex clients. */
  clients: Pick<ClientPort, "ensureClient">;
  /** Resolves sources used by existing and newly created threads. */
  projects: Pick<ProjectSourcePort, "resolveSource">;
  /** Creates the Codex portion of an implicit thread creation. */
  threadCreationService: Pick<ThreadCreationService, "create">;
  /** Resolves the source that owns an existing thread. */
  sourceResolver: Pick<ThreadSourceResolver, "resolveThreadSourceId">;
  /** Reconciles collaboration data after rollback. */
  collaborationService: Pick<CollaborationService, "reconcileTurns">;
};

/** Executes source-aware Codex thread and turn actions. */
export class ThreadTurnActionsService {
  /** Creates a thread turn action service. */
  constructor(private readonly options: ThreadTurnActionsServiceOptions) {}

  /**
   * Starts a user turn, creating a thread first when needed.
   *
   * @param threadId Thread identifier, or `null` to create a thread.
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @param text User text.
   * @param attachments Image attachments.
   * @param references Composer references.
   * @param model Optional model override.
   * @param reasoningEffort Optional reasoning effort override.
   * @param serviceTier Optional service tier override.
   * @param shouldResumeExistingThread Whether an existing thread should resume first.
   *
   * @returns Thread and turn identifiers.
   */
  async startTurn(
    threadId: string | null,
    projectPath: string | null,
    sourceId: string | null,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[],
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    serviceTier: string | null,
    shouldResumeExistingThread = true
  ): Promise<{ threadId: string; turnId: string }> {
    const trimmedText = text.trim();
    const input = buildTurnInput(trimmedText, attachments, references);

    if (input.length === 0) {
      return { threadId: threadId ?? "", turnId: "" };
    }

    const targetSourceId = threadId === null
      ? sourceId
      : await this.options.sourceResolver.resolveThreadSourceId(threadId, sourceId);

    if (targetSourceId === null) {
      throw new Error("Cannot start a turn for a project without a Codex source.");
    }

    const resolvedSource = await this.options.projects.resolveSource(targetSourceId);
    const client = await this.options.clients.ensureClient(resolvedSource.id);
    const targetThreadId = threadId ?? (
      await this.createThreadAndReturnId(client, projectPath, resolvedSource.id)
    );

    if (
      threadId !== null &&
      shouldResumeExistingThread &&
      this.shouldResumeThreadBeforeTurn(targetThreadId)
    ) {
      await this.resumeThreadForTurn(client, targetThreadId, projectPath, model);
    }

    const message: OpenCodexMessage = {
      id: createId("user"),
      threadId: targetThreadId,
      role: "user",
      content: trimmedText,
      status: "completed",
      createdAt: new Date().toISOString(),
      attachments
    };

    const requestedReasoningEffort = reasoningEffort ??
      this.options.settings.getSettings().defaultReasoningEffort;

    this.options.events.emit({
      type: "message.started",
      sourceId: resolvedSource.id,
      threadId: targetThreadId,
      message
    });

    const turnResponse = await client.startTurn({
      threadId: targetThreadId,
      input,
      model,
      serviceTier,
      effort: requestedReasoningEffort
    });
    const turn = readObject(readObject(turnResponse).turn);
    const turnId = readString(turn.id);

    if (turnId.length > 0) {
      const currentThread = this.options.threadTurnCache.get(targetThreadId)?.thread;
      const execution: OpenCodexTurnExecutionMetadata = {
        requestedModel: model,
        effectiveModel: model ?? currentThread?.model ?? null,
        requestedReasoningEffort,
        effectiveReasoningEffort: requestedReasoningEffort,
        serviceTier: serviceTier ?? null
      };

      await this.options.threadCacheService.writeTurnExecutionMetadata(
        resolvedSource.id,
        targetThreadId,
        turnId,
        execution
      );
      this.options.events.emit({
        type: "turn.started",
        sourceId: resolvedSource.id,
        threadId: targetThreadId,
        turnId
      });
    }

    return { threadId: targetThreadId, turnId };
  }

  /**
   * Sends steering input to an active Codex turn.
   *
   * @param threadId Thread identifier.
   * @param turnId Active turn identifier expected by Codex.
   * @param text User text.
   * @param attachments Image attachments.
   * @param references Composer references.
   *
   * @returns Thread and turn identifiers.
   */
  async steerTurn(
    threadId: string,
    turnId: string,
    text: string,
    attachments: OpenCodexImageAttachment[],
    references: OpenCodexComposerReference[]
  ): Promise<{ threadId: string; turnId: string }> {
    const trimmedText = text.trim();
    const input = buildTurnInput(trimmedText, attachments, references);

    if (input.length === 0) {
      return { threadId, turnId };
    }

    const sourceId = await this.options.sourceResolver.resolveThreadSourceId(threadId);

    if (sourceId === null) {
      throw new Error("Cannot steer a turn for a project without a Codex source.");
    }

    const client = await this.options.clients.ensureClient(sourceId);
    const response = await client.steerTurn({
      threadId,
      input,
      expectedTurnId: turnId
    });
    const responseTurnId = readString(readObject(response).turnId);
    const effectiveTurnId = responseTurnId.length > 0 ? responseTurnId : turnId;
    await this.persistSteerUserInput(threadId, effectiveTurnId, input);

    return {
      threadId,
      turnId: effectiveTurnId
    };
  }

  /** Persists the synthetic user item created by a steering action. */
  private async persistSteerUserInput(
    threadId: string,
    turnId: string,
    input: unknown[]
  ): Promise<void> {
    const result = this.options.threadTurnCache.recordLiveItem(threadId, turnId, {
      type: "userMessage",
      id: createId("steer"),
      kind: "steer",
      content: input
    });

    if (result === null) {
      return;
    }

    await this.options.threadCacheService.writeDelta(result.entry, [result.turn]);
  }

  /**
   * Edits the last user turn by rolling it back.
   *
   * @param threadId Thread identifier.
   * @param projectPath Project path.
   * @param sourceId Source identifier, or `null`.
   * @param model Optional model override.
   * @param reasoningEffort Optional reasoning effort override.
   *
   * @returns Thread identifier.
   */
  async editLastTurn(
    threadId: string,
    projectPath: string | null,
    sourceId: string | null,
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null
  ): Promise<{ threadId: string }> {
    const targetSourceId = (
      await this.options.sourceResolver.resolveThreadSourceId(threadId)
    ) ?? sourceId;

    if (targetSourceId === null) {
      throw new Error("Cannot edit a turn for a project without a Codex source.");
    }

    const client = await this.options.clients.ensureClient(targetSourceId);

    if (this.shouldResumeThreadBeforeTurn(threadId)) {
      await this.resumeThreadForTurn(client, threadId, projectPath, model);
    }

    const rollbackResponse = await client.rollbackThread({
      threadId,
      numTurns: 1
    });
    const rollbackThread = readObject(readObject(rollbackResponse).thread);
    const rollbackThreadId = readString(rollbackThread.id) || threadId;
    const thread = withSourceId(mapThread(
      rollbackThread,
      model,
      reasoningEffort
    ), targetSourceId);
    const rawTurns = Array.isArray(rollbackThread.turns) ? rollbackThread.turns : [];
    const cacheEntry = this.options.threadTurnCache.replaceThreadTurns(thread, rawTurns);

    if (cacheEntry.thread.sourceId !== null) {
      await this.options.collaborationService.reconcileTurns(
        cacheEntry.thread.sourceId,
        cacheEntry.thread.id,
        rawTurns
      );
    }

    this.emitThreadOpened(
      cacheEntry,
      this.options.threadCacheService.readTurns(cacheEntry)
    );
    await this.options.threadCacheService.writeSnapshot(cacheEntry);

    return { threadId: rollbackThreadId };
  }

  /**
   * Checks whether Codex should resume a thread before a new turn starts.
   *
   * @param threadId Thread identifier.
   * @returns Whether the thread should be resumed first.
   */
  private shouldResumeThreadBeforeTurn(threadId: string): boolean {
    const cacheEntry = this.options.threadTurnCache.get(threadId);

    if (cacheEntry === null) {
      return true;
    }

    return cacheEntry.turnsById.size > 0;
  }

  /**
   * Ensures a historical thread is active in the app-server before starting a turn.
   *
   * @param client Codex app-server client.
   * @param threadId Existing thread identifier.
   * @param projectPath Project path candidate.
   * @param model Optional model override.
   *
   * @returns Promise resolved once Codex has resumed the thread.
   */
  private async resumeThreadForTurn(
    client: CodexAppServerClient,
    threadId: string,
    projectPath: string | null,
    model: string | null
  ): Promise<void> {
    await client.resumeThread(threadId, {
      cwd: this.resolveCurrentProjectPath(projectPath),
      excludeTurns: true,
      model
    });
  }

  /**
   * Interrupts a running turn.
   *
   * @param threadId Thread identifier.
   * @param turnId Turn identifier.
   *
   * @returns Promise resolved when Codex accepts the interrupt.
   */
  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    const sourceId = await this.options.sourceResolver.resolveThreadSourceId(threadId);

    if (sourceId === null) {
      throw new Error("Cannot interrupt a thread without a Codex source.");
    }

    const client = await this.options.clients.ensureClient(sourceId);
    await client.interruptTurn(threadId, turnId);
  }

  /**
   * Starts an inline review of the thread's uncommitted changes.
   *
   * @param threadId Thread identifier.
   * @param projectPath Project path.
   *
   * @returns Promise resolved when Codex accepts the review request.
   */
  async startReview(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    const sourceId = await this.options.sourceResolver.resolveThreadSourceId(threadId);

    if (sourceId === null) {
      throw new Error("Cannot start a review for a thread without a Codex source.");
    }

    const client = await this.options.clients.ensureClient(sourceId);
    await this.resumeThreadForTurn(client, threadId, projectPath, null);
    const response = await client.startReview(threadId);
    const turn = readObject(readObject(response).turn);
    const turnId = readString(turn.id);

    if (turnId.length > 0) {
      this.options.events.emit({ type: "turn.started", sourceId, threadId, turnId });
    }

    return { ok: true };
  }

  /**
   * Starts context compaction for a thread.
   *
   * @param threadId Thread identifier.
   * @param projectPath Project path.
   *
   * @returns Promise resolved when Codex accepts the compaction request.
   */
  async compactThread(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    const sourceId = await this.options.sourceResolver.resolveThreadSourceId(threadId);

    if (sourceId === null) {
      throw new Error("Cannot compact a thread without a Codex source.");
    }

    const client = await this.options.clients.ensureClient(sourceId);
    await this.resumeThreadForTurn(client, threadId, projectPath, null);
    await client.compactThread(threadId);

    return { ok: true };
  }

  /** Emits the thread-opened event after replacing rollback cache state. */
  private emitThreadOpened(
    cacheEntry: ThreadTurnCacheEntry,
    turns: OpenCodexTurn[]
  ): void {
    this.options.events.emit({
      type: "thread.opened",
      thread: cacheEntry.thread,
      turns,
      hasMoreOlderMessages: !cacheEntry.hasLoadedAllOlderTurns,
      tokenUsage: cacheEntry.tokenUsage
    });
  }

  /**
   * Creates a thread and returns its identifier.
   *
   * @param client Codex client.
   * @param projectPath Project path.
   * @param sourceId Source identifier.
   *
   * @returns Created thread identifier.
   */
  private async createThreadAndReturnId(
    client: CodexAppServerClient,
    projectPath: string | null,
    sourceId: string
  ): Promise<string> {
    const thread = await this.options.threadCreationService.create(
      client,
      projectPath,
      sourceId
    );

    this.options.threadTurnCache.getOrCreate(thread);
    await this.options.threadCacheService.writeIndex([thread]);
    this.options.events.emit({ type: "thread.created", thread, turns: [] });
    return thread.id;
  }

  /**
   * Resolves a project path with backend fallback.
   *
   * @param projectPath Project path candidate.
   *
   * @returns Normalized project path, or `null`.
   */
  private resolveCurrentProjectPath(projectPath: string | null): string | null {
    return normalizeProjectPath(projectPath)
      ?? normalizeProjectPath(this.options.backendOptions.projectPath);
  }
}
