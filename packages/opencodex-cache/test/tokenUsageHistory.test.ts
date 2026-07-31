/**
 * Covers immutable token usage history and turn execution metadata persistence.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../src/SqliteOpenCodexCacheRepository";
import type { OpenCodexCacheRepository } from "../src/types";

describe("token usage history", () => {
  let directory: string;
  let repository: OpenCodexCacheRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-token-history-"));
    repository = createOpenCodexSqliteCacheRepository({ directory });
  });

  afterEach(async () => {
    await repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should append distinct snapshots and keep source-scoped history", async () => {
    await repository.saveThreadTokenUsageSnapshot(
      createSnapshot("source-a", "turn-1", 100, 10, "2026-07-31T10:00:00.000Z")
    );
    await repository.saveThreadTokenUsageSnapshot(
      createSnapshot("source-a", "turn-1", 130, 30, "2026-07-31T10:01:00.000Z")
    );
    await repository.saveThreadTokenUsageSnapshot(
      createSnapshot("source-b", "turn-1", 900, 90, "2026-07-31T10:02:00.000Z")
    );
    await repository.saveThreadTokenUsageSnapshot(
      createSnapshot("source-a", "turn-1", 130, 30, "2026-07-31T10:03:00.000Z")
    );

    const snapshots = await repository.listThreadTokenUsageSnapshots({
      sourceId: "source-a",
      threadId: "thread-1"
    });
    const turnSnapshots = await repository.listThreadTokenUsageSnapshots({
      sourceId: "source-a",
      threadId: "thread-1",
      turnId: "turn-1"
    });

    expect(snapshots).toHaveLength(2);
    expect(snapshots.map((snapshot) => snapshot.total.totalTokens)).toEqual([100, 130]);
    expect(turnSnapshots).toHaveLength(2);
    expect(turnSnapshots[1]?.last.totalTokens).toBe(30);
  });

  it("should save latest usage and skip duplicate history values atomically", async () => {
    await repository.saveThreadSnapshot({
      thread: createThread(),
      turns: [],
      syncState: createSyncState(),
      tokenUsage: null
    });

    const usage = createUsage(130, 30);
    await repository.saveThreadTokenUsageAndSnapshot(
      usage,
      createSnapshot("source-a", "turn-1", 130, 30, "2026-07-31T10:00:00.000Z")
    );
    await repository.saveThreadTokenUsageAndSnapshot(
      usage,
      createSnapshot("source-a", "turn-1", 130, 30, "2026-07-31T10:01:00.000Z")
    );

    const cachedThread = await repository.getThread("thread-1");
    const snapshots = await repository.listThreadTokenUsageSnapshots({
      sourceId: "source-a",
      threadId: "thread-1"
    });

    expect(cachedThread?.tokenUsage).toEqual(usage);
    expect(snapshots).toHaveLength(1);
  });

  it("should include one source-wide baseline per thread before a period", async () => {
    await repository.saveThreadTokenUsageSnapshot(
      createSnapshot("source-a", "turn-1", 100, 100, "2026-07-31T09:00:00.000Z")
    );
    await repository.saveThreadTokenUsageSnapshot(
      createSnapshot("source-a", "turn-1", 130, 30, "2026-07-31T10:00:00.000Z")
    );
    await repository.saveThreadTokenUsageSnapshot(
      createSnapshot("source-a", "turn-2", 160, 30, "2026-07-31T11:00:00.000Z")
    );
    await repository.saveThreadTokenUsageSnapshot(
      createSnapshot("source-a", "turn-3", 50, 50, "2026-07-31T09:30:00.000Z", "thread-2")
    );
    await repository.saveThreadTokenUsageSnapshot(
      createSnapshot("source-a", "turn-3", 70, 20, "2026-07-31T10:30:00.000Z", "thread-2")
    );
    await repository.saveThreadTokenUsageSnapshot(
      createSnapshot("source-b", "turn-1", 900, 900, "2026-07-31T09:30:00.000Z")
    );

    const snapshots = await repository.listSourceTokenUsageSnapshots({
      sourceId: "source-a",
      fromObservedAt: "2026-07-31T10:00:00.000Z",
      toObservedAt: "2026-07-31T12:00:00.000Z"
    });

    expect(snapshots.map((snapshot) => [snapshot.threadId, snapshot.total.totalTokens])).toEqual([
      ["thread-1", 100],
      ["thread-2", 50],
      ["thread-1", 130],
      ["thread-2", 70],
      ["thread-1", 160]
    ]);
  });

  it("should expose persisted execution metadata on cached turns", async () => {
    await repository.saveTurnExecutionMetadata({
      sourceId: "source-a",
      threadId: "thread-1",
      turnId: "turn-1",
      requestedModel: "gpt-5.5",
      effectiveModel: "gpt-5.4",
      requestedReasoningEffort: "high",
      effectiveReasoningEffort: "high",
      serviceTier: "fast",
      firstObservedAt: "2026-07-31T10:00:00.000Z",
      updatedAt: "2026-07-31T10:01:00.000Z"
    });

    await repository.saveThreadSnapshot({
      thread: createThread(),
      turns: [
        {
          id: "turn-1",
          status: "completed",
          items: []
        }
      ],
      syncState: createSyncState(),
      tokenUsage: null
    });

    const snapshot = await repository.getThread("thread-1");

    expect(snapshot?.turns[0]).toMatchObject({
      openCodexUiExecution: {
        requestedModel: "gpt-5.5",
        effectiveModel: "gpt-5.4",
        requestedReasoningEffort: "high",
        effectiveReasoningEffort: "high",
        serviceTier: "fast"
      }
    });
  });
});

function createSnapshot(
  sourceId: string,
  turnId: string,
  totalTokens: number,
  lastTokens: number,
  observedAt: string,
  threadId = "thread-1"
) {
  return {
    sourceId,
    threadId,
    turnId,
    observedAt,
    total: createBreakdown(totalTokens),
    last: createBreakdown(lastTokens),
    modelContextWindow: 1000,
    model: "gpt-5.5",
    reasoningEffort: "high",
    serviceTier: "fast"
  };
}

function createBreakdown(totalTokens: number) {
  return {
    totalTokens,
    inputTokens: totalTokens,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0
  };
}

function createUsage(totalTokens: number, lastTokens: number) {
  return {
    threadId: "thread-1",
    turnId: "turn-1",
    total: createBreakdown(totalTokens),
    last: createBreakdown(lastTokens),
    contextWindowTokens: lastTokens,
    modelContextWindow: 1000,
    usedPercent: lastTokens / 10
  };
}

function createThread() {
  return {
    id: "thread-1",
    sessionId: null,
    parentThreadId: null,
    sourceId: "source-a",
    codexTitle: "Thread",
    customTitle: null,
    title: "Thread",
    preview: "",
    model: "gpt-5.5",
    reasoningEffort: "high",
    projectName: "Project",
    projectPath: "/tmp/project",
    projectHidden: false,
    branchName: null,
    updatedAt: "2026-07-31T10:00:00.000Z",
    isArchived: false,
    threadSource: null,
    agentNickname: null,
    agentRole: null
  };
}

function createSyncState() {
  return {
    threadId: "thread-1",
    newestTurnId: "turn-1",
    oldestTurnId: "turn-1",
    olderCursor: null,
    hasLoadedLatest: true,
    hasLoadedAllOlderTurns: true,
    lastSyncedAt: "2026-07-31T10:00:00.000Z"
  };
}
