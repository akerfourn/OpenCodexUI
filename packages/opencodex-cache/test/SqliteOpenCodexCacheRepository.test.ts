/**
 * Covers SQLite cache persistence for thread lists, turns, pagination, and titles.
 */
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
        codexTitle: "OpenCodexUI",
        customTitle: null,
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
        codexTitle: "OpenCodexUI",
        customTitle: null,
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
        codexTitle: "Thread",
        customTitle: null,
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

  it("should read only the latest cached turns when a limit is provided", async () => {
    await repository.saveThreadSnapshot({
      thread: {
        id: "thread-1",
        codexTitle: "Thread",
        customTitle: null,
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
        { id: "turn-1", startedAt: "2026-01-01T00:00:00.000Z", items: [] },
        { id: "turn-2", startedAt: "2026-01-01T00:00:01.000Z", items: [] },
        { id: "turn-3", startedAt: "2026-01-01T00:00:02.000Z", items: [] }
      ],
      syncState: {
        threadId: "thread-1",
        newestTurnId: "turn-3",
        oldestTurnId: "turn-1",
        olderCursor: null,
        hasLoadedLatest: true,
        hasLoadedAllOlderTurns: true,
        lastSyncedAt: "2026-01-01T00:00:03.000Z"
      }
    });

    const snapshot = await repository.getThread("thread-1", { latestTurnLimit: 2 });

    expect(snapshot?.turns).toMatchObject([
      { id: "turn-2" },
      { id: "turn-3" }
    ]);
    expect(snapshot?.syncState.hasLoadedAllOlderTurns).toBe(false);
    expect(snapshot?.syncState.olderCursor).toBe("cache:turn-2");
  });

  it("should read older cached turns before a known turn", async () => {
    await repository.saveThreadSnapshot({
      thread: {
        id: "thread-1",
        codexTitle: "Thread",
        customTitle: null,
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
        { id: "turn-1", startedAt: "2026-01-01T00:00:00.000Z", items: [] },
        { id: "turn-2", startedAt: "2026-01-01T00:00:01.000Z", items: [] },
        { id: "turn-3", startedAt: "2026-01-01T00:00:02.000Z", items: [] }
      ],
      syncState: {
        threadId: "thread-1",
        newestTurnId: "turn-3",
        oldestTurnId: "turn-1",
        olderCursor: null,
        hasLoadedLatest: true,
        hasLoadedAllOlderTurns: true,
        lastSyncedAt: "2026-01-01T00:00:03.000Z"
      }
    });

    const result = await repository.getOlderTurns({
      threadId: "thread-1",
      beforeTurnId: "turn-3",
      limit: 1
    });

    expect(result.turns).toMatchObject([{ id: "turn-2" }]);
    expect(result.hasMoreOlderTurns).toBe(true);
  });

  it("should update the local thread title when a chat is renamed", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "Old title",
        customTitle: null,
        title: "Old title",
        preview: "preview",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.updateThreadTitle("thread-1", "Renamed chat");

    const threads = await repository.listThreads({
      scope: "all",
      currentProjectPath: null
    });

    expect(threads[0]).toMatchObject({
      id: "thread-1",
      customTitle: "Renamed chat",
      title: "Renamed chat"
    });
  });

  it("should not replace a renamed title with an empty index title", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "Old title",
        customTitle: null,
        title: "Old title",
        preview: "preview",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.updateThreadTitle("thread-1", "Renamed chat");

    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "",
        customTitle: null,
        title: "",
        preview: "preview",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:01.000Z"
      }
    ]);

    const threads = await repository.listThreads({
      scope: "all",
      currentProjectPath: null
    });

    expect(threads[0]).toMatchObject({
      id: "thread-1",
      customTitle: "Renamed chat",
      title: "Renamed chat"
    });
  });

  it("should not replace a renamed title with the preview fallback", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "Old title",
        customTitle: null,
        title: "Old title",
        preview: "First user message",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.updateThreadTitle("thread-1", "Renamed chat");

    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "First user message",
        customTitle: null,
        title: "First user message",
        preview: "First user message",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:01.000Z"
      }
    ]);

    const threads = await repository.listThreads({
      scope: "all",
      currentProjectPath: null
    });

    expect(threads[0]).toMatchObject({
      id: "thread-1",
      codexTitle: "First user message",
      customTitle: "Renamed chat",
      title: "Renamed chat"
    });
  });

  it("should keep the custom title when Codex updates its own title", async () => {
    await repository.upsertThreadIndex([
      {
        id: "thread-1",
        codexTitle: "Old Codex title",
        customTitle: null,
        title: "Old Codex title",
        preview: "First user message",
        model: null,
        reasoningEffort: null,
        projectName: "OpenCodexUI",
        projectPath: "/home/adrien/Projets/Perso/OpenCodexUI",
        branchName: "main",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);

    await repository.updateThreadTitle("thread-1", "OpenCodex title");
    await repository.updateThreadCodexTitle("thread-1", "First user message");

    const threads = await repository.listThreads({
      scope: "all",
      currentProjectPath: null
    });

    expect(threads[0]).toMatchObject({
      id: "thread-1",
      codexTitle: "First user message",
      customTitle: "OpenCodex title",
      title: "OpenCodex title"
    });
  });
});
