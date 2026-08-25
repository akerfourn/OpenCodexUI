/** Covers thread source resolution when no cached ownership is available. */
import { describe, expect, it, vi } from "vitest";

import { ThreadTurnCache } from "../src/ThreadTurnCache";
import { ThreadSourceResolver } from "../src/backend/threads/ThreadSourceResolver";

describe("ThreadSourceResolver", () => {
  it("should return null without writing when no source or fallback exists", async () => {
    const threadTurnCache = new ThreadTurnCache();
    const readSnapshot = vi.fn(async () => null);
    const writeIndex = vi.fn(async () => undefined);
    const resolver = new ThreadSourceResolver({
      threadTurnCache,
      threadCacheService: { readSnapshot, writeIndex }
    });

    await expect(resolver.resolveThreadSourceId("thread-1")).resolves.toBeNull();

    expect(readSnapshot).toHaveBeenCalledWith("thread-1");
    expect(writeIndex).not.toHaveBeenCalled();
  });

  it("should not write when repairing a thread absent from memory and SQLite", async () => {
    const threadTurnCache = new ThreadTurnCache();
    const readSnapshot = vi.fn(async () => null);
    const writeIndex = vi.fn(async () => undefined);
    const resolver = new ThreadSourceResolver({
      threadTurnCache,
      threadCacheService: { readSnapshot, writeIndex }
    });

    await resolver.repairThreadSourceId("thread-1", "source-1");

    expect(readSnapshot).toHaveBeenCalledWith("thread-1");
    expect(writeIndex).not.toHaveBeenCalled();
  });
});
