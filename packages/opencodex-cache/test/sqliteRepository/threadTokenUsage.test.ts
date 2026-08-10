/**
 * Covers latest thread token usage and project-level usage aggregation.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../../src/SqliteOpenCodexCacheRepository";
import type {
  CachedThreadTokenUsage,
  OpenCodexCacheRepository
} from "../../src/types";

describe("thread token usage", () => {
  let directory: string;
  let repository: OpenCodexCacheRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-cache-"));
    repository = createOpenCodexSqliteCacheRepository({ directory });
  });

  afterEach(async () => {
    await repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should persist the latest thread token usage", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-usage",
        codexTitle: "Usage",
        customTitle: null,
        title: "Usage",
        preview: "",
        model: "gpt-5.5",
        reasoningEffort: "medium",
        projectName: "OpenCodexUI",
        projectPath: "/tmp/thread-usage-project",
        sourceId: null,
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z",
        isArchived: false
      }
    ]);

    await repository.saveThreadTokenUsage({
      threadId: "thread-usage",
      turnId: "turn-1",
      total: {
        totalTokens: 2_500,
        inputTokens: 2_000,
        cachedInputTokens: 500,
        outputTokens: 400,
        reasoningOutputTokens: 100
      },
      last: {
        totalTokens: 500,
        inputTokens: 300,
        cachedInputTokens: 100,
        outputTokens: 150,
        reasoningOutputTokens: 50
      },
      contextWindowTokens: 500,
      modelContextWindow: 10_000,
      usedPercent: 5
    });

    const snapshot = await repository.getThread("thread-usage");

    expect(snapshot?.tokenUsage).toMatchObject({
      threadId: "thread-usage",
      turnId: "turn-1",
      modelContextWindow: 10_000,
      contextWindowTokens: 500,
      usedPercent: 5,
      total: {
        totalTokens: 2_500
      }
    });
  });

  it("should aggregate known token usage by project and source", async () => {
    const projectPath = "/tmp/statistics-project";

    await repository.upsertThreadIndex([
      createStatisticsThread("known-main", "source-a", projectPath),
      createStatisticsThread("known-archived", "source-a", projectPath, true),
      createStatisticsThread("unknown", "source-a", projectPath),
      createStatisticsThread("sub-agent", "source-a", projectPath, false, "subAgent"),
      createStatisticsThread("other-source", "source-b", projectPath)
    ]);

    await repository.saveThreadTokenUsage(createStatisticsUsage("known-main", 100, 80, 10, 20, 5));
    await repository.saveThreadTokenUsage(createStatisticsUsage("known-archived", 300, 200, 20, 70, 10));
    await repository.saveThreadTokenUsage(createStatisticsUsage("sub-agent", 10_000, 8_000, 1_000, 1_000, 500));
    await repository.saveThreadTokenUsage(createStatisticsUsage("other-source", 20_000, 15_000, 2_000, 3_000, 1_000));

    const statistics = await repository.getProjectTokenUsageStatistics(projectPath, "source-a");

    expect(statistics).toEqual({
      chatCount: 3,
      chatsWithTokenUsage: 2,
      chatsWithoutTokenUsage: 1,
      tokenUsage: {
        totalTokens: 400,
        inputTokens: 280,
        cachedInputTokens: 30,
        outputTokens: 90,
        reasoningOutputTokens: 15
      }
    });
  });
});

/**
 * Creates the minimum thread index data needed by project statistics tests.
 *
 * @param id Thread identifier.
 * @param sourceId Owning source identifier.
 * @param projectPath Project working directory.
 * @param isArchived Whether the thread is archived.
 * @param threadSource Optional Codex thread source.
 * @returns Thread summary input.
 */
function createStatisticsThread(
  id: string,
  sourceId: string,
  projectPath: string,
  isArchived = false,
  threadSource: string | null = null
) {
  return {
    id,
    sessionId: null,
    parentThreadId: null,
    sourceId,
    codexTitle: id,
    customTitle: null,
    title: id,
    preview: "",
    model: null,
    reasoningEffort: null,
    projectName: "Statistics project",
    projectPath,
    projectHidden: false,
    branchName: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    isArchived,
    threadSource,
    agentNickname: null,
    agentRole: null
  };
}

/**
 * Creates a token usage snapshot for project aggregation tests.
 *
 * @param threadId Thread identifier.
 * @param totalTokens Total token count.
 * @param inputTokens Input token count.
 * @param cachedInputTokens Cached input token count.
 * @param outputTokens Output token count.
 * @param reasoningOutputTokens Reasoning output token count.
 * @returns Token usage snapshot.
 */
function createStatisticsUsage(
  threadId: string,
  totalTokens: number,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  reasoningOutputTokens: number
): CachedThreadTokenUsage {
  return {
    threadId,
    turnId: `${threadId}-turn`,
    total: {
      totalTokens,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningOutputTokens
    },
    last: {
      totalTokens,
      inputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningOutputTokens
    },
    contextWindowTokens: totalTokens,
    modelContextWindow: null,
    usedPercent: null
  };
}
