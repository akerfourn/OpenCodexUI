import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../src/SqliteOpenCodexCacheRepository";
import type { OpenCodexCacheRepository } from "../src/types";

describe("SqliteOpenCodexCacheRepository", () => {
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

  it("should persist and list thread summaries grouped by project path", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        title: "OpenCodexUI",
        preview: "preview",
        model: "gpt-5.5",
        reasoningEffort: "high",
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    const threads = await repository.listThreads({
      scope: "currentProject",
      currentProjectPath: "/home/adrien/Projets/Perso/OpenCodexUI"
    });

    expect(threads).toEqual([
      {
        id: "thread-1",
        title: "OpenCodexUI",
        preview: "preview",
        model: "gpt-5.5",
        reasoningEffort: "high",
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
  });

  it("should persist turns without storing the UI message projection", async () => {
    await repository.saveThreadSnapshot({
      thread: {
        id: "thread-1",
        title: "Thread",
        preview: "",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      turns: [
        {
          id: "turn-1",
          startedAt: "2026-01-01T00:00:00.000Z",
          items: [
            {
              type: "userMessage",
              id: "user-1",
              content: [{ type: "text", text: "Bonjour" }]
            }
          ]
        }
      ],
      syncState: {
        threadId: "thread-1",
        newestTurnId: "turn-1",
        oldestTurnId: "turn-1",
        olderCursor: null,
        hasLoadedLatest: true,
        hasLoadedAllOlderTurns: true,
        lastSyncedAt: "2026-01-01T00:00:01.000Z"
      }
    });

    const snapshot = await repository.getThread("thread-1");

    expect(snapshot).toMatchObject({
      thread: {
        id: "thread-1",
        projectName: "OpenCodexUI"
      },
      turns: [
        {
          id: "turn-1",
          items: [
            {
              type: "userMessage",
              id: "user-1"
            }
          ]
        }
      ],
      syncState: {
        hasLoadedLatest: true,
        hasLoadedAllOlderTurns: true
      }
    });
  });
});
