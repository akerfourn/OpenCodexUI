/**
 * Covers thread turn cache merging, ordering, and title updates.
 */
import { describe, expect, it } from "vitest";

import { ThreadTurnCache } from "../src/ThreadTurnCache";

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
});
