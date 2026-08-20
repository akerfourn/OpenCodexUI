/** Covers thread snapshot replacement and timeline positioning. */
import { describe, expect, it } from "vitest";

import { createChatStore, createTurn } from "./chatStoreFixtures";

describe("ChatStore thread snapshots", () => {
  it("should preserve the scroll request state when refreshing an existing thread", () => {
    const chatStore = createChatStore({});
    const existingTurn = createTurn("turn-existing", "completed");

    chatStore.timeline.setTurns([existingTurn]);
    chatStore.applyOpenedSnapshot([existingTurn], "thread.opened", false, true);

    expect(chatStore.timeline.scrollToBottomVersion).toBe(0);
  });

  it("should request the bottom scroll when opening a new thread snapshot", () => {
    const chatStore = createChatStore({});

    chatStore.applyOpenedSnapshot(
      [createTurn("turn-new", "completed")],
      "thread.opened",
      false,
      false
    );

    expect(chatStore.timeline.scrollToBottomVersion).toBe(1);
  });
});
