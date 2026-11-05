/** Covers chat-local composer and model settings. */
import { describe, expect, it, vi } from "vitest";

import { ChatStore } from "../../src/stores/chat/ChatStore";
import {
  createChatStore,
  createProjectStore,
  createRootStore,
  createThread
} from "./chatStoreFixtures";

describe("ChatStore composer model settings", () => {
  it("should preserve draft and attachments in the chat store", () => {
    const chatStore = createChatStore({});

    chatStore.composer.setDraft("draft", "**draft**", []);
    chatStore.composer.addAttachments([{
      id: "image-1",
      kind: "image",
      source: "localPath",
      value: "/tmp/image.png",
      name: "image.png"
    }]);

    expect(chatStore.composer.draft).toBe("draft");
    expect(chatStore.composer.draftMarkdown).toBe("**draft**");
    expect(chatStore.composer.attachments).toEqual([expect.objectContaining({
      id: "image-1",
      value: "/tmp/image.png"
    })]);
  });

  it("should preserve an isolated timeline reading state", () => {
    const chatStore = createChatStore({});
    const state = {
      visibleTurnCount: 20,
      turnCount: 25,
      scrollTop: 480,
      isPinnedToBottom: false
    };

    chatStore.timeline.setTimelineViewState(state);
    state.scrollTop = 0;

    expect(chatStore.timeline.timelineViewState).toEqual({
      visibleTurnCount: 20,
      turnCount: 25,
      scrollTop: 480,
      isPinnedToBottom: false
    });
  });

  it("should initialize model settings from the thread", () => {
    const chatStore = createChatStore({
      model: "gpt-5.5",
      reasoningEffort: "medium"
    });

    expect(chatStore.composer.selectedModel).toBe("gpt-5.5");
    expect(chatStore.composer.reasoningEffort).toBe("medium");
  });

  it("should keep explicit user settings when thread metadata refreshes", () => {
    const chatStore = createChatStore({
      model: "gpt-5.5",
      reasoningEffort: "medium"
    });

    chatStore.composer.setModel("gpt-5.4-mini");
    chatStore.composer.setReasoningEffort("high");
    chatStore.setThread(createThread({
      model: "gpt-5.5",
      reasoningEffort: "low"
    }));

    expect(chatStore.composer.selectedModel).toBe("gpt-5.4-mini");
    expect(chatStore.composer.reasoningEffort).toBe("high");
  });

  it("should update visible thread metadata when the user changes settings", () => {
    const rootStore = createRootStore();
    const projectStore = createProjectStore();
    const chatStore = new ChatStore(
      createThread({
        model: "gpt-5.5",
        reasoningEffort: "medium"
      }),
      projectStore,
      rootStore
    );

    chatStore.composer.setReasoningEffort("high");

    expect(chatStore.thread.reasoningEffort).toBe("high");
    expect(projectStore.upsertThread).toHaveBeenCalledWith(expect.objectContaining({
      id: "thread-1",
      reasoningEffort: "high"
    }));
    expect(rootStore.request).toHaveBeenCalledWith({
      type: "threads.updateComposerSettings",
      threadId: "thread-1",
      model: "gpt-5.5",
      reasoningEffort: "high"
    });
  });

  it("should keep initialized settings when a stale metadata refresh arrives", () => {
    const chatStore = createChatStore({
      model: "gpt-5.5",
      reasoningEffort: "medium"
    });

    chatStore.setThread(createThread({
      model: "gpt-5.4-mini",
      reasoningEffort: "xhigh"
    }));

    expect(chatStore.composer.selectedModel).toBe("gpt-5.5");
    expect(chatStore.composer.reasoningEffort).toBe("medium");
  });

  it("should initialize missing settings from the first metadata refresh", () => {
    const chatStore = createChatStore({ model: null, reasoningEffort: null });
    chatStore.setThread(createThread({ model: "gpt-5.4-mini", reasoningEffort: "high" }));

    expect(chatStore.composer.selectedModel).toBe("gpt-5.4-mini");
    expect(chatStore.composer.reasoningEffort).toBe("high");
  });

  it("should retain the visible model when metadata arrives after typing starts", () => {
    const chatStore = createChatStore({ model: null });
    const visibleModel = chatStore.composer.selectedModel;
    chatStore.composer.setDraft("hello", "hello", []);
    chatStore.setThread(createThread({ model: "gpt-5.4-mini" }));

    expect(chatStore.composer.selectedModel).toBe(visibleModel);
  });

  it("should prefer the configured default over catalog order for a new chat", () => {
    const rootStore = createRootStore();
    rootStore.appStore.settingsStore.settings.defaultModel = "configured-model";
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    expect(chatStore.composer.selectedModel).toBe("configured-model");
  });

  it("should use the app selection before catalog order when no default is configured", () => {
    const chatStore = createChatStore({ model: null, reasoningEffort: null });

    expect(chatStore.composer.selectedModel).toBe("gpt-5.4");
  });

  it("should use the first catalog model when no selection or default exists", () => {
    const rootStore = createRootStore();
    rootStore.appStore.selectedModel = null;
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    expect(chatStore.composer.selectedModel).toBe("gpt-5.5");
    expect(chatStore.composer.reasoningEffort).toBe("medium");
  });

  it("should repair a thread source from the project source", () => {
    const chatStore = createChatStore({
      sourceId: null
    });

    expect(chatStore.thread.sourceId).toBe("source-1");
    expect(chatStore.sourceId).toBe("source-1");
  });

  it("should start turns with the resolved chat source", async () => {
    const rootStore = createRootStore();
    const projectStore = createProjectStore();
    const chatStore = new ChatStore(
      createThread({
        sourceId: null
      }),
      projectStore,
      rootStore
    );

    vi.mocked(rootStore.request).mockResolvedValueOnce({ turnId: "turn-sent" });
    const wasAccepted = await chatStore.actions.send("hello");

    expect(wasAccepted).toBe(true);
    expect(rootStore.request).toHaveBeenCalledWith(expect.objectContaining({
      type: "turn.start",
      threadId: "thread-1",
      sourceId: "source-1",
      text: "hello"
    }));
  });
});
