/** Characterizes runtime-status polling and its lifecycle boundaries. */
import type { OpenCodexThreadRuntimeStatus } from "@open-codex-ui/opencodex-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProjectStore } from "../../src/stores/project/ProjectStore";
import { ChatStore } from "../../src/stores/chat/ChatStore";
import {
  createProjectStore,
  createRootStore,
  createThread,
  flushPromises
} from "./chatStoreFixtures";

const RUNTIME_STATUS_POLL_INTERVAL_MS = 30_000;

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatStore runtime-status polling", () => {
  it("should keep one runtime request in flight across repeated timer ticks", async () => {
    vi.useFakeTimers();
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);
    const pendingStatus = createDeferred<OpenCodexThreadRuntimeStatus>();

    vi.mocked(rootStore.request).mockReturnValue(pendingStatus.promise);
    chatStore.applyTurnStarted("turn-active");

    await vi.advanceTimersByTimeAsync(RUNTIME_STATUS_POLL_INTERVAL_MS * 3);

    expect(rootStore.request).toHaveBeenCalledTimes(1);
    expect(rootStore.request).toHaveBeenCalledWith({
      type: "threads.runtimeStatus.read",
      threadId: "thread-1"
    });

    pendingStatus.resolve(createRuntimeStatus("thread-1", true));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(RUNTIME_STATUS_POLL_INTERVAL_MS);

    expect(rootStore.request).toHaveBeenCalledTimes(2);
  });

  it("should not read runtime status for a read-only cached project", async () => {
    vi.useFakeTimers();
    const rootStore = createRootStore();
    const projectStore = {
      ...createProjectStore(),
      isReadOnlyFromCache: true
    } as ProjectStore;
    const chatStore = new ChatStore(createThread({}), projectStore, rootStore);

    chatStore.applyTurnStarted("turn-active");
    await vi.advanceTimersByTimeAsync(RUNTIME_STATUS_POLL_INTERVAL_MS * 2);

    expect(rootStore.request).not.toHaveBeenCalled();
  });

  it("should ignore a runtime response belonging to another thread", async () => {
    vi.useFakeTimers();
    const rootStore = createRootStore();
    const projectStore = createProjectStore();
    const chatStore = new ChatStore(createThread({}), projectStore, rootStore);

    vi.mocked(rootStore.request)
      .mockResolvedValueOnce(createRuntimeStatus("thread-other", false))
      .mockResolvedValueOnce(createRuntimeStatus("thread-1", true));
    chatStore.applyTurnStarted("turn-active");

    await vi.advanceTimersByTimeAsync(RUNTIME_STATUS_POLL_INTERVAL_MS);

    expect(chatStore.runtime.isWorking).toBe(true);
    expect(chatStore.runtime.activeTurnId).toBe("turn-active");
    expect(projectStore.openThread).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RUNTIME_STATUS_POLL_INTERVAL_MS);

    expect(rootStore.request).toHaveBeenCalledTimes(2);
  });

  it("should release the in-flight state after an error and poll again", async () => {
    vi.useFakeTimers();
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    vi.mocked(rootStore.request)
      .mockRejectedValueOnce(new Error("runtime unavailable"))
      .mockResolvedValueOnce(createRuntimeStatus("thread-1", true));
    chatStore.applyTurnStarted("turn-active");

    await vi.advanceTimersByTimeAsync(RUNTIME_STATUS_POLL_INTERVAL_MS);
    expect(rootStore.request).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RUNTIME_STATUS_POLL_INTERVAL_MS);

    expect(rootStore.request).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: "completion",
      stop: (chatStore: ChatStore): void => {
        chatStore.applyTurnCompleted("turn-active", 123);
      }
    },
    {
      name: "clearLoadedState",
      stop: (chatStore: ChatStore): void => {
        chatStore.clearLoadedState();
      }
    },
    {
      name: "dispose",
      stop: (chatStore: ChatStore): void => {
        chatStore.dispose();
      }
    }
  ])("should stop polling after $name", async ({ stop }) => {
    vi.useFakeTimers();
    const rootStore = createRootStore();
    const chatStore = new ChatStore(createThread({}), createProjectStore(), rootStore);

    chatStore.applyTurnStarted("turn-active");
    stop(chatStore);
    await vi.advanceTimersByTimeAsync(RUNTIME_STATUS_POLL_INTERVAL_MS);

    expect(rootStore.request).not.toHaveBeenCalled();
  });
});

/** Creates a deferred promise for controlling a polling response. */
function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value: T) => {
      resolvePromise?.(value);
    }
  };
}

/** Creates a complete runtime status response for one thread. */
function createRuntimeStatus(
  threadId: string,
  isActive: boolean
): OpenCodexThreadRuntimeStatus {
  return {
    threadId,
    status: isActive ? "active" : "idle",
    isActive,
    activeFlags: []
  };
}
