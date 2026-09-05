import type {
  OpenCodexComposerReference,
  OpenCodexImageAttachment,
  OpenCodexReasoningEffort,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import { ThreadTurnStartService } from "./ThreadTurnStartService.js";
import { createTurnDiagnosticRequest, createTurnRequestDetails } from "./turnRequestDiagnostics.js";
import { resumeThreadForTurn, shouldResumeThreadBeforeTurn } from "./threadTurnPreparation.js";

import type { WorkspaceExecutionService } from "../workspaces/WorkspaceExecutionService.js";
import { mapThread, readObject, readString } from "../../mapping.js";
import { toError } from "../shared/errors.js";
import type { ThreadTurnCache, ThreadTurnCacheEntry } from "../../ThreadTurnCache.js";
import type { OpenCodexBackendOptions } from "../../types.js";
import type { CollaborationService } from "../collaboration/CollaborationService.js";
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
} from "../runtime/runtimePorts.js";

/** Dependencies required to execute source-aware thread turn actions. */
export type ThreadTurnActionsServiceOptions = {
  /** Persisted execution guards when the runtime has a cache repository. */
  workspaceExecution?: WorkspaceExecutionService;
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
  events: Pick<
    RuntimeEventPort,
    | "emit"
    | "recordClientRequest"
    | "recordTurnDiagnosticRequest"
    | "recordTurnDiagnosticResponse"
  >;
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
  /** Coordinates new submissions with the same runtime dependencies. */
  private readonly turnStartService: ThreadTurnStartService;

  /** Creates a thread turn action service. */
  constructor(private readonly options: ThreadTurnActionsServiceOptions) {
    this.turnStartService = new ThreadTurnStartService(options);
  }

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
    shouldResumeExistingThread = true,
    workspaceId: string | null = null
  ): Promise<{ threadId: string; turnId: string }> {
    return await this.turnStartService.startTurn(
      threadId, projectPath, sourceId, text, attachments, references, model,
      reasoningEffort, serviceTier, shouldResumeExistingThread, workspaceId
    );
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
    const diagnosticId = this.options.events.recordTurnDiagnosticRequest?.(
      sourceId,
      threadId,
      createTurnDiagnosticRequest(
        threadId,
        turnId,
        trimmedText,
        input,
        null,
        null,
        null,
        false,
        "turn.steer"
      )
    ) ?? null;
    this.options.events.recordClientRequest(
      sourceId,
      threadId,
      "turn.steer",
      turnId,
      createTurnRequestDetails(trimmedText, attachments, references)
    );
    let response: unknown;

    try {
      response = await client.steerTurn({
        threadId,
        input,
        expectedTurnId: turnId
      });
    } catch (error) {
      if (diagnosticId !== null) {
        this.options.events.recordTurnDiagnosticResponse?.(
          diagnosticId,
          null,
          toError(error).message
        );
      }

      throw error;
    }
    const responseTurnId = readString(readObject(response).turnId);
    const effectiveTurnId = responseTurnId.length > 0 ? responseTurnId : turnId;

    if (diagnosticId !== null) {
      this.options.events.recordTurnDiagnosticResponse?.(
        diagnosticId,
        effectiveTurnId.length > 0 ? effectiveTurnId : null,
        effectiveTurnId.length > 0 ? null : "Codex returned no turn id."
      );
    }
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

    if (shouldResumeThreadBeforeTurn(this.options.threadTurnCache, threadId)) {
      await resumeThreadForTurn(client, threadId, projectPath, this.options.backendOptions.projectPath, model);
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
    await resumeThreadForTurn(client, threadId, projectPath, this.options.backendOptions.projectPath, null);
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
    await resumeThreadForTurn(client, threadId, projectPath, this.options.backendOptions.projectPath, null);
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

}
