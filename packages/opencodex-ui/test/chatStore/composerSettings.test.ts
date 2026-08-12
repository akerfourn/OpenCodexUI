/** Covers chat-local composer and model settings. */
import { describe, expect, it } from "vitest";

import { ChatStore } from "../../src/stores/ChatStore";
import {
  createChatStore,
  createProjectStore,
  createRootStore,
  createThread
} from "./chatStoreFixtures";

describe("ChatStore composer model settings", () => {
  it("should preserve draft and attachments in the chat store", () => {
    const chatStore = createChatStore({});

    chatStore.setComposerDraft("draft", "**draft**", []);
    chatStore.addComposerAttachments([{
      id: "image-1",
      kind: "image",
      source: "localPath",
      value: "/tmp/image.png",
      name: "image.png"
    }]);

    expect(chatStore.composerDraft).toBe("draft");
    expect(chatStore.composerDraftMarkdown).toBe("**draft**");
    expect(chatStore.composerAttachments).toEqual([expect.objectContaining({
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

    chatStore.setTimelineViewState(state);
    state.scrollTop = 0;

    expect(chatStore.timelineViewState).toEqual({
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

    expect(chatStore.selectedModel).toBe("gpt-5.5");
    expect(chatStore.reasoningEffort).toBe("medium");
  });

  it("should keep explicit user settings when thread metadata refreshes", () => {
    const chatStore = createChatStore({
      model: "gpt-5.5",
      reasoningEffort: "medium"
    });

    chatStore.setSelectedModel("gpt-5.4-mini");
    chatStore.setReasoningEffort("high");
    chatStore.setThread(createThread({
      model: "gpt-5.5",
      reasoningEffort: "low"
    }));

    expect(chatStore.selectedModel).toBe("gpt-5.4-mini");
    expect(chatStore.reasoningEffort).toBe("high");
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

    chatStore.setReasoningEffort("high");

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

  it("should apply metadata refreshes before the user changes settings", () => {
    const chatStore = createChatStore({
      model: "gpt-5.5",
      reasoningEffort: "medium"
    });

    chatStore.setThread(createThread({
      model: "gpt-5.4-mini",
      reasoningEffort: "xhigh"
    }));

    expect(chatStore.selectedModel).toBe("gpt-5.4-mini");
    expect(chatStore.reasoningEffort).toBe("xhigh");
  });

  it("should use the first listed model when the thread has no model", () => {
    const chatStore = createChatStore({
      model: null,
      reasoningEffort: null
    });

    expect(chatStore.selectedModel).toBe("gpt-5.5");
    expect(chatStore.reasoningEffort).toBe("medium");
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

    const wasAccepted = await chatStore.sendMessage("hello");

    expect(wasAccepted).toBe(true);
    expect(rootStore.request).toHaveBeenCalledWith(expect.objectContaining({
      type: "turn.start",
      threadId: "thread-1",
      sourceId: "source-1",
      text: "hello"
    }));
  });
});
