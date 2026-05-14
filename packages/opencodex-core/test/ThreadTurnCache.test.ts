/**
 * Covers thread turn cache merging, ordering, and title updates.
 */
import { describe, expect, it } from "vitest";

import { ThreadTurnCache } from "../src/ThreadTurnCache";
import { createCacheSignature } from "../src/backend/threadCacheMapping";

describe("ThreadTurnCache", () => {
  it("should merge turns without duplicating existing entries", () => {
    const cache = new ThreadTurnCache();
    const entry = cache.getOrCreate({
      id: "thread-1",
      codexTitle: "Thread",
      customTitle: null,
      title: "Thread",
      preview: "",
      model: null,
      reasoningEffort: null,
      projectName: null,
      projectPath: null,
      branchName: null,
      updatedAt: null
    });

    cache.mergeLatestTurns(
      entry,
      [
        { id: "turn-2", startedAt: 2, items: [{ id: "item-2" }] },
        { id: "turn-1", startedAt: 1, items: [{ id: "item-1" }] }
      ],
      "older"
    );
    cache.mergeOlderTurns(
      entry,
      [
        { id: "turn-2", startedAt: 2, items: [{ id: "item-2" }, { id: "item-3" }] },
        { id: "turn-3", startedAt: 3, items: [{ id: "item-4" }] }
      ],
      null
    );

    expect(entry.orderedTurnIds).toEqual(["turn-1", "turn-2", "turn-3"]);
    expect(entry.oldestTurnId).toBe("turn-1");
    expect(entry.newestTurnId).toBe("turn-3");
    expect(cache.toTurns(entry)).toMatchObject([
      { id: "turn-1" },
      { id: "turn-2", items: [{ id: "item-2" }, { id: "item-3" }] },
      { id: "turn-3" }
    ]);
    expect(entry.hasLoadedAllOlderTurns).toBe(true);
  });

  it("should preserve the older cursor when syncing latest turns", () => {
    const cache = new ThreadTurnCache();
    const entry = cache.getOrCreate({
      id: "thread-1",
      codexTitle: "Thread",
      customTitle: null,
      title: "Thread",
      preview: "",
      model: null,
      reasoningEffort: null,
      projectName: null,
      projectPath: null,
      branchName: null,
      updatedAt: null
    });

    cache.mergeLatestTurns(entry, [{ id: "turn-3", startedAt: 3 }], "cursor-page-2");
    cache.mergeOlderTurns(entry, [{ id: "turn-2", startedAt: 2 }], "cursor-page-3");
    cache.mergeLatestTurns(entry, [{ id: "turn-4", startedAt: 4 }], "cursor-page-2");

    expect(entry.olderCursor).toBe("cursor-page-3");
    expect(entry.orderedTurnIds).toEqual(["turn-2", "turn-3", "turn-4"]);
    expect(entry.oldestTurnId).toBe("turn-2");
    expect(entry.newestTurnId).toBe("turn-4");
  });

  it("should include turn item content in cache signatures", () => {
    const cache = new ThreadTurnCache();
    const entry = cache.getOrCreate({
      id: "thread-1",
      codexTitle: "Thread",
      customTitle: null,
      title: "Thread",
      preview: "",
      model: null,
      reasoningEffort: null,
      projectName: null,
      projectPath: null,
      branchName: null,
      updatedAt: null
    });

    cache.mergeLatestTurns(
      entry,
      [
        {
          id: "turn-1",
          startedAt: 1,
          items: [{ id: "reasoning-1", type: "reasoning", summary: [] }]
        }
      ],
      null
    );
    const emptyReasoningSignature = createCacheSignature(entry);

    cache.mergeLatestTurns(
      entry,
      [
        {
          id: "turn-1",
          startedAt: 1,
          items: [{ id: "reasoning-1", type: "reasoning", summary: ["Analyse"] }]
        }
      ],
      null
    );

    expect(createCacheSignature(entry)).not.toBe(emptyReasoningSignature);
  });

  it("should preserve live command items missing from RPC history", () => {
    const cache = new ThreadTurnCache();
    const entry = cache.getOrCreate({
      id: "thread-1",
      codexTitle: "Thread",
      customTitle: null,
      title: "Thread",
      preview: "",
      model: null,
      reasoningEffort: null,
      projectName: null,
      projectPath: null,
      branchName: null,
      updatedAt: null
    });

    cache.mergeLatestTurns(
      entry,
      [
        {
          id: "turn-1",
          startedAt: 1,
          items: [
            { id: "user-1", type: "userMessage", content: [{ type: "text", text: "Run tests" }] },
            {
              id: "command-1",
              type: "commandExecution",
              command: "npm test",
              aggregatedOutput: "ok"
            },
            { id: "assistant-1", type: "agentMessage", text: "Done", phase: "final_answer" }
          ]
        }
      ],
      null
    );

    cache.mergeLatestTurns(
      entry,
      [
        {
          id: "turn-1",
          startedAt: 1,
          items: [
            { id: "user-1", type: "userMessage", content: [{ type: "text", text: "Run tests" }] },
            { id: "assistant-1", type: "agentMessage", text: "Done", phase: "final_answer" }
          ]
        }
      ],
      null
    );

    expect(cache.toTurns(entry)).toMatchObject([
      {
        id: "turn-1",
        items: [
          { id: "user-1" },
          { id: "command-1", command: "npm test", aggregatedOutput: "ok" },
          { id: "assistant-1" }
        ]
      }
    ]);
  });

  it("should preserve live item fields when RPC sends empty values", () => {
    const cache = new ThreadTurnCache();
    const entry = cache.getOrCreate({
      id: "thread-1",
      codexTitle: "Thread",
      customTitle: null,
      title: "Thread",
      preview: "",
      model: null,
      reasoningEffort: null,
      projectName: null,
      projectPath: null,
      branchName: null,
      updatedAt: null
    });

    cache.mergeLatestTurns(
      entry,
      [
        {
          id: "turn-1",
          startedAt: 1,
          items: [
            {
              id: "command-1",
              type: "commandExecution",
              command: "npm test",
              aggregatedOutput: "ok"
            }
          ]
        }
      ],
      null
    );
    cache.mergeLatestTurns(
      entry,
      [
        {
          id: "turn-1",
          startedAt: 1,
          items: [
            {
              id: "command-1",
              type: "commandExecution",
              command: "npm test",
              aggregatedOutput: null
            }
          ]
        }
      ],
      null
    );

    expect(cache.toTurns(entry)).toMatchObject([
      {
        id: "turn-1",
        items: [
          {
            id: "command-1",
            aggregatedOutput: "ok"
          }
        ]
      }
    ]);
  });

  it("should merge duplicate chat items with different live and history ids", () => {
    const cache = new ThreadTurnCache();
    const entry = cache.getOrCreate({
      id: "thread-1",
      codexTitle: "Thread",
      customTitle: null,
      title: "Thread",
      preview: "",
      model: null,
      reasoningEffort: null,
      projectName: null,
      projectPath: null,
      branchName: null,
      updatedAt: null
    });

    cache.mergeLatestTurns(
      entry,
      [
        {
          id: "turn-1",
          startedAt: 1,
          items: [
            { id: "uuid-user", type: "userMessage", content: [{ type: "text", text: "Hello" }] },
            { id: "msg-final", type: "agentMessage", text: "Done", phase: "final_answer" }
          ]
        }
      ],
      null
    );
    cache.mergeLatestTurns(
      entry,
      [
        {
          id: "turn-1",
          startedAt: 1,
          items: [
            { id: "item-1", type: "userMessage", content: [{ type: "text", text: "Hello" }] },
            { id: "item-2", type: "agentMessage", text: "Done", phase: "final_answer" }
          ]
        }
      ],
      null
    );

    expect(cache.toTurns(entry)).toMatchObject([
      {
        id: "turn-1",
        items: [
          { id: "uuid-user", type: "userMessage" },
          { id: "msg-final", type: "agentMessage" }
        ]
      }
    ]);
  });
});
