/** Covers rollback of an optimistic rename while composer settings change. */
import { describe, expect, it, vi } from "vitest";

import { ChatStore } from "../../src/stores/ChatStore";
import {
  createProjectStore,
  createRootStore,
  createThread,
  flushPromises
} from "./chatStoreFixtures";

describe("ChatStore rename and composer concurrency", () => {
  it("should restore the confirmed title while keeping composer settings after rename rejection", async () => {
    const rootStore = createRootStore();
    const projectStore = createProjectStore();
    let rejectRename: ((error: Error) => void) | null = null;
    const renameRequest = new Promise<unknown>((_resolve, reject) => {
      rejectRename = reject;
    });

    vi.mocked(rootStore.request).mockImplementation((request) => {
      if (request.type === "threads.rename") {
        return renameRequest;
      }

      return Promise.resolve({ ok: true });
    });

    const chatStore = new ChatStore(createThread({}), projectStore, rootStore);

    chatStore.actions.rename("Optimistic title");
    chatStore.composer.setModel("gpt-5.5");
    chatStore.composer.setReasoningEffort("high");

    rejectRename?.(new Error("Rename failed"));
    await flushPromises();

    expect(chatStore.thread.title).toBe("Thread");
    expect(chatStore.thread.model).toBe("gpt-5.5");
    expect(chatStore.thread.reasoningEffort).toBe("high");
    expect(projectStore.threadListStore.threads[0]).toMatchObject({
      title: "Thread",
      model: null,
      reasoningEffort: null
    });
  });
});
