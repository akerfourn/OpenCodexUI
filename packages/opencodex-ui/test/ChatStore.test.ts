/**
 * Covers chat-local composer model settings.
 */
import { describe, expect, it } from "vitest";

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
    isOrphan: false
  } as ProjectStore;
}

function createRootStore(): RootStore {
  return {
    appStore: {
      models: ["gpt-5.5", "gpt-5.4-mini"],
      selectedModel: "gpt-5.4",
      settings: {
        defaultModel: null,
        defaultReasoningEffort: "medium"
      }
    },
    navigationStore: {
      activeProjectStore: null
    }
  } as RootStore;
}
