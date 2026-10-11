import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexThread,
  OpenCodexTurnExecutionMetadata
} from "@open-codex-ui/opencodex-protocol";

import type { ThreadTurnCache } from "../../ThreadTurnCache.js";
import { readObject, readString } from "../../mapping.js";
import type { CollaborationService } from "../collaboration/CollaborationService.js";
import type { ThreadCacheService } from "../threads/ThreadCacheService.js";

/** Cache and collaboration ports used to enrich source-owned turn metadata. */
export interface TurnExecutionMetadataRecorderOptions {
  threadTurnCache: Pick<ThreadTurnCache, "get" | "getTurnExecutionMetadata">;
  threadCacheService: Pick<ThreadCacheService, "writeTurnExecutionMetadata">;
  collaborationService: Partial<Pick<
    CollaborationService,
    "getSpawnExecutionMetadata" | "resolveSpawnExecutionMetadata"
  >>;
}

/** Records requested and effective execution settings from live notifications. */
export class TurnExecutionMetadataRecorder {
  /** Binds cache reads, persistence and optional spawn-history lookups. */
  constructor(
    /** Explicit source-aware service ports, with no active source selection. */
    private readonly options: TurnExecutionMetadataRecorderOptions
  ) {}

  /**
   * Records execution metadata from turn-start and model-reroute notifications.
   *
   * @param notification Notification ready for cache processing.
   * @param sourceId Source that produced the notification.
   * @returns Nothing.
   */
  recordNotification(
    notification: CodexNotification,
    sourceId: string
  ): void {
    const params = readObject(notification.params);
    const threadId = readString(params.threadId);

    if (threadId.length === 0) {
      return;
    }

    if (notification.method === "turn/started") {
      const turnId = readString(readObject(params.turn).id);

      if (turnId.length === 0) {
        return;
      }

      const thread = this.options.threadTurnCache.get(threadId)?.thread;
      const current = this.options.threadTurnCache.getTurnExecutionMetadata(threadId, turnId);
      const spawnMetadata = this.options.collaborationService.getSpawnExecutionMetadata?.(
        sourceId,
        threadId,
        thread?.parentThreadId ?? null,
        thread?.subAgentSource?.agentPath ?? null
      ) ?? null;
      const metadata: OpenCodexTurnExecutionMetadata = {
        requestedModel: current?.requestedModel ?? spawnMetadata?.model ?? null,
        effectiveModel: current?.effectiveModel ?? spawnMetadata?.model ?? thread?.model ?? null,
        requestedReasoningEffort:
          current?.requestedReasoningEffort ?? spawnMetadata?.reasoningEffort ?? null,
        effectiveReasoningEffort:
          current?.effectiveReasoningEffort ??
          spawnMetadata?.reasoningEffort ??
          thread?.reasoningEffort ??
          null,
        serviceTier: current?.serviceTier ?? null
      };

      if (current === null || !executionMetadataEqual(current, metadata)) {
        void this.options.threadCacheService.writeTurnExecutionMetadata(
          sourceId,
          threadId,
          turnId,
          metadata
        );
      }

      if (spawnMetadata === null && thread !== undefined && thread.parentThreadId !== null) {
        this.resolveSpawnExecutionMetadata(
          sourceId,
          threadId,
          turnId,
          thread,
          current
        );
      }
      return;
    }

    if (notification.method !== "model/rerouted") {
      return;
    }

    const turnId = readString(params.turnId);
    const toModel = readString(params.toModel);

    if (turnId.length === 0 || toModel.length === 0) {
      return;
    }

    const current = this.options.threadTurnCache.getTurnExecutionMetadata(threadId, turnId);
    const metadata: OpenCodexTurnExecutionMetadata = {
      requestedModel: current?.requestedModel ?? null,
      effectiveModel: toModel,
      requestedReasoningEffort: current?.requestedReasoningEffort ?? null,
      effectiveReasoningEffort: current?.effectiveReasoningEffort ?? null,
      serviceTier: current?.serviceTier ?? null
    };
    void this.options.threadCacheService.writeTurnExecutionMetadata(
      sourceId,
      threadId,
      turnId,
      metadata
    );
  }

  /**
   * Enriches a child turn after its spawn event is recovered from persisted history.
   * Failed lookups leave the immediately recorded metadata available.
   *
   * @param sourceId Source that produced the turn.
   * @param threadId Child thread identifier.
   * @param turnId Turn identifier.
   * @param thread Known child thread metadata.
   * @param initialMetadata Metadata written during the immediate turn-start path.
   */
  private resolveSpawnExecutionMetadata(
    sourceId: string,
    threadId: string,
    turnId: string,
    thread: OpenCodexThread,
    initialMetadata: OpenCodexTurnExecutionMetadata | null
  ): void {
    if (this.options.collaborationService.resolveSpawnExecutionMetadata === undefined) {
      return;
    }

    void this.options.collaborationService.resolveSpawnExecutionMetadata(
      sourceId,
      threadId,
      thread.parentThreadId,
      thread.subAgentSource?.agentPath ?? null
    ).then((spawnMetadata) => {
      if (spawnMetadata === null) {
        return;
      }

      const current = this.options.threadTurnCache.getTurnExecutionMetadata(threadId, turnId)
        ?? initialMetadata;
      const metadata: OpenCodexTurnExecutionMetadata = {
        requestedModel: current?.requestedModel ?? spawnMetadata.model,
        effectiveModel: current?.effectiveModel ?? spawnMetadata.model,
        requestedReasoningEffort:
          current?.requestedReasoningEffort ?? spawnMetadata.reasoningEffort,
        effectiveReasoningEffort:
          current?.effectiveReasoningEffort ?? spawnMetadata.reasoningEffort,
        serviceTier: current?.serviceTier ?? null
      };

      if (current === null || !executionMetadataEqual(current, metadata)) {
        void this.options.threadCacheService.writeTurnExecutionMetadata(
          sourceId,
          threadId,
          turnId,
          metadata
        );
      }
    }).catch(() => undefined);
  }
}

/** Compares execution metadata before issuing a redundant cache write. */
function executionMetadataEqual(
  current: OpenCodexTurnExecutionMetadata,
  next: OpenCodexTurnExecutionMetadata
): boolean {
  return current.requestedModel === next.requestedModel &&
    current.effectiveModel === next.effectiveModel &&
    current.requestedReasoningEffort === next.requestedReasoningEffort &&
    current.effectiveReasoningEffort === next.effectiveReasoningEffort &&
    current.serviceTier === next.serviceTier;
}

