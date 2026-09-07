import type { OpenCodexReasoningEffort } from "@open-codex-ui/opencodex-protocol";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { mapThread, readObject, readString } from "../../mapping.js";
import { withSourceId } from "./threadCacheMapping.js";
import { resumeThreadForTurn, shouldResumeThreadBeforeTurn } from "./threadTurnPreparation.js";
import type { ThreadTurnActionsServiceOptions } from "./ThreadTurnActionsService.js";

/** Maintenance shares turn-start/selection guards while retaining legacy cacheless behavior. */
export class ThreadMaintenanceService {
  /** Uses the conversation service's existing source, cache and lifecycle collaborators. */
  constructor(private readonly options: ThreadTurnActionsServiceOptions) {}

  /** Rolls back once; cache synchronization remains inside the operation's thread gate. */
  async editLastTurn(
    threadId: string, projectPath: string | null, sourceId: string | null,
    model: string | null, reasoningEffort: OpenCodexReasoningEffort | null
  ): Promise<{ threadId: string }> {
    return await this.run(threadId, projectPath, sourceId, "rollback", async (source, cwd) => {
      const client = await this.options.clients.ensureClient(source);
      if (this.options.workspaceExecution !== undefined
        || shouldResumeThreadBeforeTurn(this.options.threadTurnCache, threadId)) {
        await this.resume(client, threadId, cwd, model);
      }
      const response = await client.rollbackThread({ threadId, numTurns: 1 });
      const rawThread = readObject(readObject(response).thread);
      const responseId = readString(rawThread.id) || threadId;
      if (responseId !== threadId) {
        throw new Error("Rollback response belongs to another thread; reconcile before retrying.");
      }
      const thread = withSourceId(mapThread(rawThread, model, reasoningEffort), source);
      const rawTurns = Array.isArray(rawThread.turns) ? rawThread.turns : [];
      const entry = this.options.threadTurnCache.replaceThreadTurns(thread, rawTurns);
      if (entry.thread.sourceId !== null) {
        await this.options.collaborationService.reconcileTurns(entry.thread.sourceId, entry.thread.id, rawTurns);
      }
      this.options.events.emit({
        type: "thread.opened", thread: entry.thread,
        turns: this.options.threadCacheService.readTurns(entry),
        hasMoreOlderMessages: !entry.hasLoadedAllOlderTurns, tokenUsage: entry.tokenUsage
      });
      await this.options.threadCacheService.writeSnapshot(entry);
      return { value: { threadId: responseId } };
    });
  }

  /** Keeps an inline review reserved until its matching completion, including early notifications. */
  async startReview(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    return await this.run(threadId, projectPath, null, "review", async (sourceId, cwd) => {
      const client = await this.options.clients.ensureClient(sourceId);
      await this.resume(client, threadId, cwd, null);
      const response = await client.startReview(threadId);
      if (this.options.workspaceExecution !== undefined && response.reviewThreadId !== threadId) {
        throw new Error("Inline review response has an unexpected thread; reconcile before retrying.");
      }
      const turnId = readString(readObject(response.turn).id);
      if (turnId.length > 0) {
        this.options.events.emit({ type: "turn.started", sourceId, threadId, turnId });
      }
      return { value: { ok: true }, turnId };
    });
  }

  /** Reserves compaction through lifecycle completion; an accepted RPC alone does not imply idle. */
  async compactThread(threadId: string, projectPath: string | null): Promise<{ ok: true }> {
    return await this.run(threadId, projectPath, null, "compact", async (sourceId, cwd) => {
      const client = await this.options.clients.ensureClient(sourceId);
      await this.resume(client, threadId, cwd, null);
      await client.compactThread(threadId);
      return { value: { ok: true } };
    });
  }

  /** Rejects ignored cwd overrides before maintenance; these RPCs cannot override cwd themselves. */
  private async resume(
    client: CodexAppServerClient, threadId: string, cwd: string | null, model: string | null
  ): Promise<void> {
    if (this.options.workspaceExecution === undefined) {
      await resumeThreadForTurn(client, threadId, cwd, this.options.backendOptions.projectPath, model);
      return;
    }
    const response = await client.resumeThread(threadId, { cwd, excludeTurns: true, model });
    if (response.thread?.id !== threadId || response.cwd !== cwd
      || response.thread.canAcceptDirectInput !== true || response.thread.status?.type !== "idle") {
      throw new Error("Codex did not resume an idle thread in its reserved workspace; reconcile before retrying.");
    }
  }

  /** Uses persisted context with a cache; legacy callers retain source resolution and path fallback. */
  private async run<T>(
    threadId: string, projectPath: string | null, sourceId: string | null,
    operation: "review" | "compact" | "rollback",
    action: (sourceId: string, cwd: string | null) => Promise<{ value: T; turnId?: string }>
  ): Promise<T> {
    if (this.options.workspaceExecution !== undefined) {
      return await this.options.workspaceExecution.runMaintenance(
        { threadId, projectPath, sourceId }, operation,
        async (context) => await action(context.sourceId, context.cwd)
      );
    }
    const resolvedSource = await this.options.sourceResolver.resolveThreadSourceId(threadId) ?? sourceId;
    if (resolvedSource === null) {
      throw new Error("Cannot maintain a thread without a Codex source.");
    }
    return (await action(resolvedSource, projectPath)).value;
  }
}
