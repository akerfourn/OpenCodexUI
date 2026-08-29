import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexSettings,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThreadTurnCache } from "../src/ThreadTurnCache";
import {
  RuntimeNotificationCoordinator,
  type RuntimeNotificationCoordinatorOptions
} from "../src/backend/runtime/RuntimeNotificationCoordinator";
import type {
  RuntimeEventPort,
  RuntimeSettingsPort
} from "../src/backend/runtime/runtimePorts";

describe("RuntimeNotificationCoordinator", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should preserve the raw-to-processed notification order", () => {
    const context = createContext();

    context.coordinator.handleNotification({
      method: "account/rateLimits/updated",
      params: { threadId: "thread-1" }
    }, "source-1");

    expect(context.timeline).toEqual([
      "received",
      "ignored",
      "raw",
      "live-cache",
      "collaboration",
      "project-command",
      "notification",
      "rate-limits",
      "processed"
    ]);
  });

  it("should record a started thread before the remaining notification handlers", () => {
    const context = createContext();

    context.coordinator.handleNotification({
      method: "thread/started",
      params: { thread: { id: "thread-1" }, threadId: "thread-1" }
    }, "source-1");

    expect(context.timeline).toEqual([
      "received",
      "ignored",
      "raw",
      "live-cache",
      "collaboration",
      "thread-started",
      "project-command",
      "notification",
      "processed"
    ]);
  });

  it("should skip ignored notifications after recording the receipt metric", () => {
    const context = createContext({
      threads: {
        isThreadIgnored: () => {
          context.timeline.push("ignored");
          return true;
        }
      }
    });

    context.coordinator.handleNotification({
      method: "thread/status/changed",
      params: { threadId: "ignored-thread" }
    }, "source-1");

    expect(context.timeline).toEqual(["received", "ignored"]);
  });

  it("should process batched notifications only when flushed", () => {
    vi.useFakeTimers();
    const context = createContext();
    const notification = createAgentDeltaNotification("source-1", "thread-1", "turn-1");

    context.coordinator.handleNotification(notification, "source-1");
    expect(context.timeline).toEqual(["received", "ignored", "raw"]);

    vi.advanceTimersByTime(49);
    expect(context.timeline).toEqual(["received", "ignored", "raw"]);

    vi.advanceTimersByTime(1);
    expect(context.timeline).toEqual([
      "received",
      "ignored",
      "raw",
      "live-cache",
      "collaboration",
      "project-command",
      "notification",
      "processed"
    ]);
  });

  it("should flush pending notifications by source and then flush the remainder", () => {
    vi.useFakeTimers();
    const context = createContext();

    context.coordinator.handleNotification(
      createAgentDeltaNotification("source-a", "thread-a", "turn-a"),
      "source-a"
    );
    context.coordinator.handleNotification(
      createAgentDeltaNotification("source-b", "thread-b", "turn-b"),
      "source-b"
    );

    context.coordinator.flushSource("source-a");
    expect(context.processedMethods).toEqual(["item/commandExecution/outputDelta"]);

    context.coordinator.flushAll();
    expect(context.processedMethods).toEqual([
      "item/commandExecution/outputDelta",
      "item/commandExecution/outputDelta"
    ]);
  });

  it.each([
    { developerMode: true, advancedPerformanceMonitoringEnabled: true, expectedCount: 1 },
    { developerMode: false, advancedPerformanceMonitoringEnabled: true, expectedCount: 0 },
    { developerMode: true, advancedPerformanceMonitoringEnabled: false, expectedCount: 0 }
  ])(
    "should report live-cache timing only when both performance flags are enabled",
    ({ developerMode, advancedPerformanceMonitoringEnabled, expectedCount }) => {
      const liveCacheMethods: string[] = [];
      const context = createContext({
        settings: createSettingsPort(createSettings(
          developerMode,
          advancedPerformanceMonitoringEnabled
        )),
        onLiveCacheProcessed: (method) => {
          liveCacheMethods.push(method);
        }
      });

      context.coordinator.handleNotification({
        method: "thread/status/changed",
        params: { threadId: "thread-1" }
      }, "source-1");

      expect(liveCacheMethods).toHaveLength(expectedCount);
      expect(liveCacheMethods).toEqual(
        expectedCount === 1 ? ["thread/status/changed"] : []
      );
    }
  );

  it("should isolate active turns by source and clear one source", () => {
    const context = createContext();

    context.coordinator.handleNotification(createTurnStartedNotification("thread-a", "turn-a"), "source-a");
    context.coordinator.handleNotification(createTurnStartedNotification("thread-b", "turn-b"), "source-b");

    expect(context.coordinator.hasActiveTurn("source-a")).toBe(true);
    expect(context.coordinator.hasActiveTurn("source-b")).toBe(true);
    expect(context.coordinator.hasActiveTurns()).toBe(true);

    context.coordinator.handleNotification(createTurnCompletedNotification("thread-a", "turn-a"), "source-a");

    expect(context.coordinator.hasActiveTurn("source-a")).toBe(false);
    expect(context.coordinator.hasActiveTurn("source-b")).toBe(true);
    expect(context.coordinator.hasActiveTurns()).toBe(true);

    context.coordinator.clearSourceActiveTurns("source-b");
    expect(context.coordinator.hasActiveTurn("source-b")).toBe(false);
    expect(context.coordinator.hasActiveTurns()).toBe(false);
  });

  it("should attach spawn model settings to a child turn", () => {
    const writeTurnExecutionMetadata = vi.fn().mockResolvedValue(undefined);
    const context = createContext({
      threadCacheService: {
        writeTokenUsage: vi.fn().mockResolvedValue(undefined),
        writeTurnExecutionMetadata
      },
      collaborationService: {
        handleNotification: () => Promise.resolve(),
        getSpawnExecutionMetadata: () => ({
          model: "gpt-5.6-luna",
          reasoningEffort: "high"
        })
      }
    });
    const childThread = createThread("child-1");
    childThread.parentThreadId = "parent-1";
    childThread.subAgentSource = {
      kind: "threadSpawn",
      parentThreadId: "parent-1",
      depth: 1,
      agentPath: "/root/reviewer",
      agentNickname: null,
      agentRole: "reviewer",
      label: null
    };
    context.options.threadTurnCache.getOrCreate(childThread);

    context.coordinator.handleNotification(
      createTurnStartedNotification("child-1", "turn-1"),
      "source-1"
    );

    expect(writeTurnExecutionMetadata).toHaveBeenCalledWith(
      "source-1",
      "child-1",
      "turn-1",
      expect.objectContaining({
        requestedModel: "gpt-5.6-luna",
        effectiveModel: "gpt-5.6-luna",
        requestedReasoningEffort: "high",
        effectiveReasoningEffort: "high"
      })
    );
  });

  it("should complete usage handling after notification handling and active-turn removal", () => {
    const context = createContext({
      usage: {
        handleRateLimitsUpdated: () => {},
        handleTurnCompleted: () => {
          context.timeline.push("turn-completed");
          expect(context.coordinator.hasActiveTurn("source-1")).toBe(false);
        }
      }
    });

    context.coordinator.handleNotification(
      createTurnStartedNotification("thread-1", "turn-1"),
      "source-1"
    );
    context.timeline.splice(0);

    context.coordinator.handleNotification(
      createTurnCompletedNotification("thread-1", "turn-1"),
      "source-1"
    );

    expect(context.timeline).toEqual([
      "received",
      "ignored",
      "raw",
      "live-cache",
      "collaboration",
      "project-command",
      "notification",
      "turn-completed",
      "processed"
    ]);
  });

  it("should persist and emit mapped token usage updates", () => {
    const context = createContext();
    const cacheEntry = context.options.threadTurnCache.getOrCreate(createThread("thread-1"));
    const notification: CodexNotification = {
      method: "thread/tokenUsage/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        tokenUsage: {
          total: {
            totalTokens: 30,
            inputTokens: 20,
            cachedInputTokens: 2,
            outputTokens: 8,
            reasoningOutputTokens: 1
          },
          last: {
            totalTokens: 10,
            inputTokens: 5,
            cachedInputTokens: 1,
            outputTokens: 5,
            reasoningOutputTokens: 0
          },
          modelContextWindow: 100
        }
      }
    };

    context.coordinator.handleNotification(notification, "source-1");

    expect(context.options.threadCacheService.writeTokenUsage).toHaveBeenCalledWith(
      "source-1",
      expect.objectContaining({
        threadId: "thread-1",
        turnId: "turn-1",
        contextWindowTokens: 10,
        usedPercent: 10
      })
    );
    expect(context.emittedTokenUsage).toEqual({
      type: "thread.tokenUsage.updated",
      sourceId: "source-1",
      usage: expect.objectContaining({ threadId: "thread-1", turnId: "turn-1" })
    });
    expect(cacheEntry.tokenUsage).toEqual(expect.objectContaining({
      threadId: "thread-1",
      turnId: "turn-1",
      contextWindowTokens: 10,
      usedPercent: 10
    }));
  });

  it("should report processed timing when synchronous processing fails", () => {
    const context = createContext({
      projectCommandService: {
        handleNotification: () => {
          throw new Error("project command failed");
        }
      }
    });

    expect(() => context.coordinator.handleNotification({
      method: "thread/status/changed",
      params: { threadId: "thread-1" }
    }, "source-1")).toThrow("project command failed");
    expect(context.timeline).toEqual([
      "received",
      "ignored",
      "raw",
      "live-cache",
      "collaboration",
      "processed"
    ]);
  });
});

type Context = {
  coordinator: RuntimeNotificationCoordinator;
  options: RuntimeNotificationCoordinatorOptions;
  timeline: string[];
  processedMethods: string[];
  emittedTokenUsage: unknown;
};

/** Creates a coordinator with deterministic adapters that expose call order. */
function createContext(
  overrides: Partial<RuntimeNotificationCoordinatorOptions> = {}
): Context {
  const timeline: string[] = [];
  const processedMethods: string[] = [];
  let emittedTokenUsage: unknown;
  const threadTurnCache = new ThreadTurnCache();
  const options: RuntimeNotificationCoordinatorOptions = {
    settings: createSettingsPort(createSettings()),
    onRawReceived: () => {
      timeline.push("received");
    },
    onProcessed: (method) => {
      processedMethods.push(method);
      timeline.push("processed");
    },
    threads: {
      isThreadIgnored: () => {
        timeline.push("ignored");
        return false;
      }
    },
    events: createEventPort((event) => {
      if (event.type === "thread.tokenUsage.updated") {
        emittedTokenUsage = event;
      }
    }, () => {
      timeline.push("raw");
    }),
    usage: {
      handleRateLimitsUpdated: () => {
        timeline.push("rate-limits");
      },
      handleTurnCompleted: () => {
        timeline.push("turn-completed");
      }
    },
    threadCacheService: {
      writeTokenUsage: vi.fn().mockResolvedValue(undefined),
      writeTurnExecutionMetadata: vi.fn().mockResolvedValue(undefined)
    },
    threadTurnCache,
    collaborationService: {
      handleNotification: () => {
        timeline.push("collaboration");
        return Promise.resolve();
      }
    },
    threadConversationService: {
      recordStartedThread: () => {
        timeline.push("thread-started");
        return Promise.resolve();
      },
      recordNotification: () => {
        timeline.push("live-cache");
      }
    },
    projectCommandService: {
      handleNotification: () => {
        timeline.push("project-command");
      }
    },
    notificationService: {
      handleNotification: () => {
        timeline.push("notification");
      }
    },
    ...overrides
  };

  return {
    coordinator: new RuntimeNotificationCoordinator(options),
    options,
    timeline,
    processedMethods,
    get emittedTokenUsage() {
      return emittedTokenUsage;
    }
  };
}

/** Creates settings with the flags consulted by the live-cache metrics path. */
function createSettings(
  developerMode = false,
  advancedPerformanceMonitoringEnabled = false
): OpenCodexSettings {
  return {
    developerMode,
    advancedPerformanceMonitoringEnabled
  } as OpenCodexSettings;
}

/** Wraps a settings snapshot in the runtime settings port used by tests. */
function createSettingsPort(settings: OpenCodexSettings): RuntimeSettingsPort {
  return {
    getSettings: () => settings,
    setSettings: () => undefined
  };
}

/** Creates the event port used by notification coordinator tests. */
function createEventPort(
  emit: (event: Parameters<RuntimeEventPort["emit"]>[0]) => void,
  recordRawNotification: () => void
): RuntimeEventPort {
  return {
    emit,
    recordRawNotification,
    recordClientRequest: () => undefined,
    readThreadEventLog: () => ({ entries: [], truncated: false })
  };
}

/** Creates the minimal thread metadata required by the in-memory cache. */
function createThread(threadId: string): OpenCodexThread {
  return {
    id: threadId,
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
  };
}

/** Creates one high-frequency assistant message delta. */
function createAgentDeltaNotification(
  sourceId: string,
  threadId: string,
  turnId: string
): CodexNotification {
  return {
    method: "item/commandExecution/outputDelta",
    params: {
      threadId,
      turnId,
      itemId: `${sourceId}-item`,
      delta: "fragment"
    }
  };
}

/** Creates one turn-start notification with a source-independent payload. */
function createTurnStartedNotification(threadId: string, turnId: string): CodexNotification {
  return {
    method: "turn/started",
    params: {
      threadId,
      turn: { id: turnId }
    }
  };
}

/** Creates one turn-completed notification with a source-independent payload. */
function createTurnCompletedNotification(threadId: string, turnId: string): CodexNotification {
  return {
    method: "turn/completed",
    params: {
      threadId,
      turn: { id: turnId, status: "completed" }
    }
  };
}
