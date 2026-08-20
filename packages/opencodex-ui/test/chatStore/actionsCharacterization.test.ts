/** Characterizes user-triggered actions owned by ChatActionsStore. */
import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexComposerReference,
  OpenCodexImageAttachment
} from "@open-codex-ui/opencodex-protocol";

import { ChatStore } from "../../src/stores/ChatStore";
import {
  createProjectStore,
  createRootStore,
  createThread,
  createTurn,
  flushPromises
} from "./chatStoreFixtures";

describe("ChatActionsStore actions characterization", () => {
  it("should refresh an idle chat and refuse refresh while a turn is active", () => {
    const projectStore = createProjectStore();
    const chatStore = new ChatStore(createThread({}), projectStore, createRootStore());

    chatStore.actions.refresh();

    expect(chatStore.runtime.isRefreshing).toBe(true);
    expect(projectStore.openThread).toHaveBeenCalledWith("thread-1");

    const secondProjectStore = createProjectStore();
    const secondChatStore = new ChatStore(
      createThread({}),
      secondProjectStore,
      createRootStore()
    );
    secondChatStore.runtime.isWorking = true;

    secondChatStore.actions.refresh();

    expect(secondProjectStore.openThread).not.toHaveBeenCalled();
    expect(secondChatStore.runtime.isRefreshing).toBe(false);
  });

  it("should refuse refresh for a read-only project", () => {
    const projectStore = createProjectStore();
    defineReadOnly(projectStore);
    const chatStore = new ChatStore(createThread({}), projectStore, createRootStore());

    chatStore.actions.refresh();

    expect(projectStore.openThread).not.toHaveBeenCalled();
    expect(chatStore.runtime.isRefreshing).toBe(false);
  });

  it.each([
    ["review", "thread.review", "review"],
    ["compaction", "thread.compact", "compact"]
  ] as const)("should start a %s action with its project path", async (_name, type, method) => {
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    chatStore.actions[method]();
    await flushPromises();

    expect(rootStore.request).toHaveBeenCalledWith({
      type,
      threadId: "thread-1",
      projectPath: "/tmp/project"
    });
    expect(chatStore.runtime.isStartingTurn).toBe(true);
  });

  it.each([
    ["review", "thread.review", "review"],
    ["compaction", "thread.compact", "compact"]
  ] as const)("should clear the start flag and expose a %s error", async (_name, type, method) => {
    const rootStore = createRootStore();
    vi.mocked(rootStore.request).mockRejectedValueOnce(new Error(`${type} failed`));
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    chatStore.actions[method]();
    await flushPromises();

    expect(chatStore.runtime.isStartingTurn).toBe(false);
    expect(rootStore.appStore.errorMessage).toBe(`${type} failed`);
  });

  it("should interrupt only an active turn with the current turn id", () => {
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    chatStore.actions.interrupt();
    expect(rootStore.request).not.toHaveBeenCalled();

    chatStore.runtime.activeTurnId = "turn-active";
    chatStore.actions.interrupt();

    expect(rootStore.request).toHaveBeenCalledWith({
      type: "turn.interrupt",
      threadId: "thread-1",
      turnId: "turn-active"
    });
  });

  it("should send a source-aware structured-clone-compatible turn request", async () => {
    const rootStore = createRootStore();
    const projectStore = createProjectStore();
    const chatStore = new ChatStore(
      createThread({ sourceId: null }),
      projectStore,
      rootStore
    );
    const attachments = createAttachments();
    const references = createReferences();

    await expect(chatStore.actions.send(
      " hello ",
      attachments,
      references,
      "gpt-5.5",
      "high",
      "priority"
    )).resolves.toBe(true);

    const request = vi.mocked(rootStore.request).mock.calls[0]?.[0];

    if (request === undefined) {
      throw new Error("Expected a turn.start request");
    }

    expect(() => structuredClone(request)).not.toThrow();
    expect(request).toMatchObject({
      type: "turn.start",
      threadId: "thread-1",
      projectPath: "/tmp/project",
      sourceId: "source-1",
      text: "hello",
      attachments,
      references,
      model: "gpt-5.5",
      reasoningEffort: "high",
      serviceTier: "priority"
    });
    expect(chatStore.timeline.turns).toHaveLength(1);
  });

  it("should remove an optimistic turn and reset runtime after start rejection", async () => {
    const rootStore = createRootStore();
    vi.mocked(rootStore.request).mockRejectedValueOnce(new Error("Start failed"));
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    const accepted = chatStore.actions.send("hello");
    expect(chatStore.timeline.turns).toHaveLength(1);
    expect(chatStore.runtime.isStartingTurn).toBe(true);
    await expect(accepted).resolves.toBe(true);

    await flushPromises();

    expect(chatStore.timeline.turns).toHaveLength(0);
    expect(chatStore.runtime.pendingTurnId).toBeNull();
    expect(chatStore.runtime.isStartingTurn).toBe(false);
    expect(chatStore.runtime.isWorking).toBe(false);
    expect(chatStore.runtime.activeTurnId).toBeNull();
    expect(rootStore.appStore.errorMessage).toBe("Start failed");
  });

  it("should append a steering item and send its payload when steering succeeds", async () => {
    const rootStore = createRootStore();
    rootStore.appStore.settingsStore.settings.allowTurnSteering = true;
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    const turn = createTurn("turn-active", "running");
    chatStore.timeline.setTurns([turn]);
    chatStore.runtime.isWorking = true;
    chatStore.runtime.activeTurnId = "turn-active";
    const attachments = createAttachments();
    const references = createReferences();

    await expect(chatStore.actions.send("steer", attachments, references)).resolves.toBe(true);

    expect(rootStore.request).toHaveBeenCalledWith({
      type: "turn.steer",
      threadId: "thread-1",
      turnId: "turn-active",
      text: "steer",
      attachments,
      references
    });
    expect(() => structuredClone(rootStore.request.mock.calls[0]?.[0])).not.toThrow();
    expect(chatStore.timeline.turns[0]?.items).toHaveLength(1);
    expect(chatStore.timeline.turns[0]?.items[0]).toMatchObject({
      kind: "steer",
      content: "steer"
    });
  });

  it("should roll back the optimistic steering item after rejection", async () => {
    const rootStore = createRootStore();
    rootStore.appStore.settingsStore.settings.allowTurnSteering = true;
    vi.mocked(rootStore.request).mockRejectedValueOnce(new Error("Steering failed"));
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    const turn = createTurn("turn-active", "running");
    chatStore.timeline.setTurns([turn]);
    chatStore.runtime.isWorking = true;
    chatStore.runtime.activeTurnId = "turn-active";

    await expect(chatStore.actions.send("steer")).resolves.toBe(false);

    expect(chatStore.timeline.turns[0]?.items).toHaveLength(0);
    expect(chatStore.runtime.isWorking).toBe(true);
    expect(rootStore.appStore.errorMessage).toBeNull();
  });

  it("should restart an edited turn using the thread id returned by Codex", async () => {
    const rootStore = createRootStore();
    vi.mocked(rootStore.request)
      .mockResolvedValueOnce({ threadId: "thread-recreated" })
      .mockResolvedValueOnce({ ok: true });
    const chatStore = createEditableChatStore(rootStore);

    expect(chatStore.actions.editLast("after", [], "gpt-5.5", "high")).toBe(true);
    await flushPromises();

    expect(rootStore.request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: "turn.editLast",
      threadId: "thread-1",
      sourceId: "source-1",
      text: "after"
    }));
    expect(rootStore.request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: "turn.start",
      threadId: "thread-recreated",
      sourceId: "source-1",
      text: "after"
    }));
    expect(chatStore.timeline.turns.at(-1)?.items[0]?.content).toBe("after");
  });

  it("should keep the edited optimistic turn when its restarted start fails", async () => {
    const rootStore = createRootStore();
    vi.mocked(rootStore.request)
      .mockResolvedValueOnce({ threadId: "thread-recreated" })
      .mockRejectedValueOnce(new Error("Restart failed"));
    const chatStore = createEditableChatStore(rootStore);

    expect(chatStore.actions.editLast("after")).toBe(true);
    await flushPromises();

    expect(chatStore.timeline.turns.at(-1)?.items[0]?.content).toBe("after");
    expect(chatStore.runtime.isEditingLastTurn).toBe(false);
    expect(chatStore.runtime.isStartingTurn).toBe(false);
    expect(rootStore.appStore.errorMessage).toBe("Restart failed");
  });

  it("should reject blank and concurrent renames and preserve an existing error", async () => {
    const rootStore = createRootStore();
    vi.mocked(rootStore.request).mockRejectedValueOnce(new Error("Rename failed"));
    rootStore.appStore.errorMessage = "Existing error";
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    chatStore.actions.rename("   ");
    expect(rootStore.request).not.toHaveBeenCalled();

    chatStore.actions.rename("Renamed");
    chatStore.actions.rename("Ignored");
    await flushPromises();

    expect(rootStore.request).toHaveBeenCalledTimes(1);
    expect(chatStore.thread.title).toBe("Thread");
    expect(chatStore.actions.isRenaming).toBe(false);
    expect(rootStore.appStore.errorMessage).toBe("Existing error");
  });
});

/** Creates one image attachment for action payload tests. */
function createAttachments(): OpenCodexImageAttachment[] {
  return [{
    id: "image-1",
    kind: "image",
    source: "dataUrl",
    value: "data:image/png;base64,ZmFrZQ==",
    name: "image.png",
    previewUrl: "data:image/png;base64,ZmFrZQ=="
  }];
}

/** Creates one composer reference for action payload tests. */
function createReferences(): OpenCodexComposerReference[] {
  return [{
    type: "skill",
    name: "review",
    path: "/skills/review"
  }];
}

/** Creates a chat with one terminal user turn suitable for editing. */
function createEditableChatStore(rootStore: ReturnType<typeof createRootStore>): ChatStore {
  const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
  const turn = createTurn("turn-old", "completed");
  turn.items.push({
    id: "user-old",
    role: "user",
    content: "before",
    status: "completed",
    createdAt: null,
    attachments: []
  });
  chatStore.timeline.setTurns([turn]);
  return chatStore;
}

/** Overrides the fixture's project getter for read-only guard coverage. */
function defineReadOnly(projectStore: ReturnType<typeof createProjectStore>): void {
  Object.defineProperty(projectStore, "isReadOnlyFromCache", {
    configurable: true,
    value: true
  });
}
