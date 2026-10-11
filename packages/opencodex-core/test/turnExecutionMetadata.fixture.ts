import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexSettings,
  OpenCodexThread,
  OpenCodexTurnExecutionMetadata
} from "@open-codex-ui/opencodex-protocol";
import { vi, type MockInstance } from "vitest";

import { ThreadTurnCache } from "../src/ThreadTurnCache.js";
import type { SpawnExecutionMetadata } from "../src/backend/collaboration/CollaborationService.js";
import {
  TurnExecutionMetadataRecorder,
  type TurnExecutionMetadataRecorderOptions
} from "../src/backend/runtime/TurnExecutionMetadataRecorder.js";
import { ThreadCacheService } from "../src/backend/threads/ThreadCacheService.js";

/** Real cache services with persistence disabled; the spy retains the real merge behavior. */
export interface MetadataFixture {
  cache: ThreadTurnCache;
  service: ThreadCacheService;
  recorder: TurnExecutionMetadataRecorder;
  write: MockInstance<ThreadCacheService["writeTurnExecutionMetadata"]>;
}

/** Creates the recorder with real in-memory reads, writes and metadata merging. */
export function createMetadataFixture(
  collaborationService: TurnExecutionMetadataRecorderOptions["collaborationService"] = {}
): MetadataFixture {
  const cache = new ThreadTurnCache();
  const service = new ThreadCacheService({
    cacheRepository: null,
    threadTurnCache: cache,
    settings: { getSettings: vi.fn<() => OpenCodexSettings>() },
    events: { emit: vi.fn() }
  });
  const write = vi.spyOn(service, "writeTurnExecutionMetadata");
  const recorder = new TurnExecutionMetadataRecorder({
    threadTurnCache: cache, threadCacheService: service, collaborationService
  });
  return { cache, service, recorder, write };
}

/** Creates a complete source-owned thread with explicit parent and agent-path defaults. */
export function createMetadataThread(patch: Partial<OpenCodexThread> = {}): OpenCodexThread {
  return {
    id: "thread-1", sessionId: null, parentThreadId: null, codexTitle: "Thread",
    customTitle: null, title: "Thread", preview: "", model: null, reasoningEffort: null,
    projectName: null, projectPath: null, sourceId: "source-1", branchName: null, updatedAt: null,
    isArchived: false, threadSource: null, agentNickname: null, agentRole: null,
    subAgentSource: null, canAcceptDirectInput: null, ...patch
  };
}

/** Creates a child whose spawn settings can be recovered by parent and agent path. */
export function createMetadataChild(id = "child-1", sourceId = "source-1"): OpenCodexThread {
  return createMetadataThread({
    id, sourceId, parentThreadId: "parent-1",
    subAgentSource: {
      kind: "threadSpawn", parentThreadId: "parent-1", depth: 1, agentPath: "/root/reviewer",
      agentNickname: null, agentRole: "reviewer", label: null
    }
  });
}

/** Creates a full metadata snapshot without relying on omitted fields. */
export function createExecutionMetadata(
  patch: Partial<OpenCodexTurnExecutionMetadata> = {}
): OpenCodexTurnExecutionMetadata {
  return {
    requestedModel: null, effectiveModel: null, requestedReasoningEffort: null,
    effectiveReasoningEffort: null, serviceTier: null, ...patch
  };
}

/** Creates the source-independent payload of a turn-start notification. */
export function createMetadataTurnStarted(threadId = "thread-1", turnId = "turn-1"): CodexNotification {
  return { method: "turn/started", params: { threadId, turn: { id: turnId } } };
}

/** Controlled history lookup used to exercise late and out-of-order results. */
export interface DeferredSpawnLookup {
  promise: Promise<SpawnExecutionMetadata | null>;
  resolve(value: SpawnExecutionMetadata | null): void;
  reject(error: Error): void;
}

/** Defers an external history result without timers, network access or cache mocks. */
export function createDeferredSpawnLookup(): DeferredSpawnLookup {
  let resolve!: DeferredSpawnLookup["resolve"];
  let reject!: DeferredSpawnLookup["reject"];
  const promise = new Promise<SpawnExecutionMetadata | null>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
