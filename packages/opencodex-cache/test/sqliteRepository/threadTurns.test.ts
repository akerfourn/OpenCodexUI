/**
 * Covers SQLite persistence and pagination for cached thread turns.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../../src/SqliteOpenCodexCacheRepository";
import { parseTurnRows, stringifyTurn } from "../../src/sqlite/threads/turnSerialization";
import type { OpenCodexCacheRepository } from "../../src/types";

describe("SQLite thread turns", () => {
  let directory: string;
  let repository: OpenCodexCacheRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-cache-thread-turns-"));
    repository = createOpenCodexSqliteCacheRepository({ directory });
  });

  afterEach(async () => {
    await repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
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
      },
      tokenUsage: null
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
      },
      tokenUsage: null
    });

    const snapshot = await repository.getThread("thread-1", { latestTurnLimit: 2 });

    expect(snapshot?.turns).toMatchObject([
      { id: "turn-2" },
      { id: "turn-3" }
    ]);
    expect(snapshot?.syncState.hasLoadedAllOlderTurns).toBe(false);
    expect(snapshot?.syncState.olderCursor).toBe("cache:turn-2");
  });

  it("should sort numeric Codex turn timestamps when reading latest turns", async () => {
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
        { id: "turn-1", startedAt: 1, items: [] },
        { id: "turn-2", startedAt: 2, items: [] },
        { id: "turn-3", startedAt: 3, items: [] }
      ],
      syncState: {
        threadId: "thread-1",
        newestTurnId: "turn-3",
        oldestTurnId: "turn-1",
        olderCursor: null,
        hasLoadedLatest: true,
        hasLoadedAllOlderTurns: true,
        lastSyncedAt: "2026-01-01T00:00:03.000Z"
      },
      tokenUsage: null
    });

    const snapshot = await repository.getThread("thread-1", { latestTurnLimit: 2 });

    expect(snapshot?.turns).toMatchObject([
      { id: "turn-2" },
      { id: "turn-3" }
    ]);
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
      },
      tokenUsage: null
    });

    const result = await repository.getOlderTurns({
      threadId: "thread-1",
      beforeTurnId: "turn-3",
      limit: 1
    });

    expect(result.turns).toMatchObject([{ id: "turn-2" }]);
    expect(result.hasMoreOlderTurns).toBe(true);
  });
});

describe("turn serialization", () => {
  it("should preserve structured plans and their legacy text projection", () => {
    const rawJson = stringifyTurn({
      id: "turn-plan",
      items: [
        {
          id: "plan-turn-plan",
          type: "plan",
          text: "completed: Analyser\npending: Implémenter",
          plan: {
            explanation: null,
            steps: [
              { step: "Analyser", status: "completed" },
              { step: "Implémenter", status: "pending" }
            ]
          }
        }
      ]
    });
    const turns = parseTurnRows([{ id: "turn-plan", raw_json: rawJson }]);

    expect(turns).toMatchObject([
      {
        id: "turn-plan",
        items: [
          {
            text: "completed: Analyser\npending: Implémenter",
            plan: {
              steps: [
                { step: "Analyser", status: "completed" },
                { step: "Implémenter", status: "pending" }
              ]
            }
          }
        ]
      }
    ]);
  });

  it("should drop duplicate chat items with different live and history ids", () => {
    const turns = parseTurnRows([
      {
        id: "turn-1",
        raw_json: JSON.stringify({
          id: "turn-1",
          items: [
            { id: "uuid-user", type: "userMessage", content: [{ type: "text", text: "Hello" }] },
            { id: "item-1", type: "userMessage", content: [{ type: "text", text: "Hello" }] },
            { id: "msg-final", type: "agentMessage", text: "Done", phase: "final_answer" },
            { id: "item-2", type: "agentMessage", text: "Done", phase: "final_answer" }
          ]
        })
      }
    ]);

    expect(turns).toMatchObject([
      {
        id: "turn-1",
        items: [
          { id: "uuid-user" },
          { id: "msg-final" }
        ]
      }
    ]);
  });
});
