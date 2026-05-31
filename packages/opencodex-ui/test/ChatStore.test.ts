/**
 * Covers chat-local composer model settings.
 */
import { describe, expect, it, vi } from "vitest";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import { ChatStore } from "../src/stores/ChatStore";
import type { ProjectStore } from "../src/stores/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

describe("ChatStore composer model settings", () => {
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

function createChatStore(threadPatch: Partial<OpenCodexThread>): ChatStore {
  return new ChatStore(
    createThread(threadPatch),
    createProjectStore(),
    createRootStore()
  );
}

function createThread(patch: Partial<OpenCodexThread>): OpenCodexThread {
  return {
    id: "thread-1",
    codexTitle: "Thread",
    customTitle: null,
    title: "Thread",
    preview: "Preview",
    model: null,
    reasoningEffort: null,
    projectName: "project",
    projectPath: "/tmp/project",
    sourceId: "source-1",
    branchName: "main",
    updatedAt: null,
    ...patch
  };
}

function createProjectStore(): ProjectStore {
  return {
    project: {
      id: "project-1",
      sourceId: "source-1"
    },
    projectPath: "/tmp/project",
    isOrphan: false,
    resolveThreadSourceId: vi.fn((thread: OpenCodexThread) => (
      thread.sourceId ?? "source-1"
    )),
    ensureThreadSource: vi.fn((thread: OpenCodexThread) => {
      const sourceId = thread.sourceId ?? "source-1";

      if (sourceId === thread.sourceId) {
        return thread;
      }

      return {
        ...thread,
        sourceId
      };
    }),
    upsertThread: vi.fn((thread: OpenCodexThread) => thread)
  } as ProjectStore;
}

function createRootStore(): RootStore {
  return {
    appStore: {
      models: [
        {
          id: "gpt-5.5",
          model: "gpt-5.5",
          displayName: "GPT-5.5",
          serviceTiers: []
        },
        {
          id: "gpt-5.4-mini",
          model: "gpt-5.4-mini",
          displayName: "GPT-5.4 Mini",
          serviceTiers: []
        }
      ],
      selectedModel: "gpt-5.4",
      settings: {
        defaultModel: null,
        defaultReasoningEffort: "medium"
      }
    },
    navigationStore: {
      activeProjectStore: null
    },
    request: vi.fn(() => Promise.resolve({ ok: true }))
  } as RootStore;
}
