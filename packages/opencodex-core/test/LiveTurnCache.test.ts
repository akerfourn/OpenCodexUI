/**
 * Covers indexed live-turn mutations used by high-frequency notifications.
 */
import { describe, expect, it } from "vitest";

import { ThreadTurnCache, type ThreadTurnCacheEntry } from "../src/ThreadTurnCache";

describe("live turn cache", () => {
  it("should append repeated deltas without rebuilding the owning turn", () => {
    const { cache, entry } = createCacheEntry();
    cache.mergeLatestTurns(entry, [{
      id: "turn-1",
      startedAt: 1,
      items: [{
        id: "assistant-1",
        type: "agentMessage",
        text: "Hello",
        phase: "final_answer"
      }]
    }], null);
    const originalTurn = readRecord(entry.turnsById.get("turn-1"));
    const originalItems = readItems(originalTurn);

    cache.appendAgentMessageDelta(
      "thread-1",
      "turn-1",
      "assistant-1",
      " world",
      "final_answer"
    );
    cache.appendAgentMessageDelta(
      "thread-1",
      "turn-1",
      "assistant-1",
      "!",
      "final_answer"
    );

    const updatedTurn = readRecord(entry.turnsById.get("turn-1"));
    expect(updatedTurn).toBe(originalTurn);
    expect(readItems(updatedTurn)).toBe(originalItems);
    expect(readItems(updatedTurn)).toMatchObject([{
      id: "assistant-1",
      text: "Hello"
    }]);
    expect(
      entry.liveTextBuffers.get("turn-1")?.get("assistant-1")?.get("text")?.chunks
    ).toEqual([" world", "!"]);

    cache.toTurns(entry);
    expect(readItems(updatedTurn)).toMatchObject([{
      id: "assistant-1",
      text: "Hello world!"
    }]);
    expect(entry.liveTextBuffers.size).toBe(0);
  });

  it("should keep the direct item index current after lifecycle updates", () => {
    const { cache, entry } = createCacheEntry();
    cache.recordLiveItem("thread-1", "turn-1", {
      id: "command-1",
      type: "commandExecution",
      aggregatedOutput: "first"
    });
    cache.appendActivityDelta(
      "thread-1",
      "turn-1",
      "command-1",
      "commandExecution",
      "aggregatedOutput",
      " second"
    );
    expect(readTurnItems(entry, "turn-1")).toMatchObject([{
      id: "command-1",
      aggregatedOutput: "first"
    }]);
    cache.recordLiveItem("thread-1", "turn-1", {
      id: "command-1",
      type: "commandExecution",
      status: "completed",
      aggregatedOutput: ""
    });

    expect(readTurnItems(entry, "turn-1")).toMatchObject([{
      id: "command-1",
      status: "completed",
      aggregatedOutput: "first second"
    }]);
  });

  it("should rebuild direct item lookups after a full turn merge", () => {
    const { cache, entry } = createCacheEntry();
    const items = Array.from({ length: 100 }, (_, index) => ({
      id: `item-${index}`,
      type: "commandExecution",
      aggregatedOutput: `${index}`
    }));
    cache.mergeLatestTurns(entry, [{ id: "turn-1", startedAt: 1, items }], null);

    cache.appendActivityDelta(
      "thread-1",
      "turn-1",
      "item-99",
      "commandExecution",
      "aggregatedOutput",
      "-updated"
    );
    cache.mergeLatestTurns(entry, [{
      id: "turn-1",
      startedAt: 1,
      items: [{
        id: "item-99",
        type: "commandExecution",
        aggregatedOutput: ""
      }]
    }], null);

    const updatedItems = readTurnItems(entry, "turn-1");
    expect(updatedItems).toHaveLength(100);
    expect(updatedItems[99]).toMatchObject({
      id: "item-99",
      aggregatedOutput: "99-updated"
    });
  });

  it("should preserve turn ordering when a live placeholder is completed", () => {
    const { cache, entry } = createCacheEntry();
    cache.mergeLatestTurns(entry, [
      { id: "turn-1", startedAt: 1, items: [] },
      { id: "turn-3", startedAt: 3, items: [] }
    ], null);
    cache.appendReasoningDelta(
      "thread-1",
      "turn-2",
      "reasoning-1",
      "summary",
      "Working"
    );
    cache.recordLiveTurn("thread-1", {
      id: "turn-2",
      startedAt: 2,
      status: "completed",
      items: []
    });

    expect(entry.orderedTurnIds).toEqual(["turn-1", "turn-2", "turn-3"]);
    expect(entry.liveTextBuffers.size).toBe(0);
    expect(readTurnItems(entry, "turn-2")).toMatchObject([{
      id: "reasoning-1",
      summary: ["Working"]
    }]);
  });

  it("should materialize only turns crossing an incremental boundary", () => {
    const { cache, entry } = createCacheEntry();
    cache.appendAgentMessageDelta(
      "thread-1",
      "turn-1",
      "assistant-1",
      "first",
      "final_answer"
    );
    cache.appendAgentMessageDelta(
      "thread-1",
      "turn-2",
      "assistant-2",
      "second",
      "final_answer"
    );

    cache.materializeTurnText(entry, [entry.turnsById.get("turn-1")]);

    expect(readTurnItems(entry, "turn-1")).toMatchObject([{ text: "first" }]);
    expect(readTurnItems(entry, "turn-2")).toMatchObject([{ text: "" }]);
    expect(entry.liveTextBuffers.has("turn-1")).toBe(false);
    expect(entry.liveTextBuffers.has("turn-2")).toBe(true);
  });
});

/**
 * Creates an initialized in-memory thread cache fixture.
 *
 * @returns Cache and its thread entry.
 */
function createCacheEntry(): { cache: ThreadTurnCache; entry: ThreadTurnCacheEntry } {
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
  return { cache, entry };
}

/**
 * Reads one raw record fixture safely.
 *
 * @param value Unknown raw value.
 * @returns Raw record, or an empty record.
 */
function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

/**
 * Reads the actual item array owned by a raw turn.
 *
 * @param turn Raw turn record.
 * @returns Stored item array, or an empty array.
 */
function readItems(turn: Record<string, unknown>): unknown[] {
  return Array.isArray(turn.items) ? turn.items : [];
}

/**
 * Reads items for one cached turn.
 *
 * @param entry Thread cache entry.
 * @param turnId Turn identifier.
 * @returns Stored turn items.
 */
function readTurnItems(entry: ThreadTurnCacheEntry, turnId: string): unknown[] {
  return readItems(readRecord(entry.turnsById.get(turnId)));
}
