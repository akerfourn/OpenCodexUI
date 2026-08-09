import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it } from "vitest";

import {
  ThreadRuntimeHandler,
  type ThreadRuntimeHandlerOptions
} from "../src/backend/ThreadRuntimeHandler";

describe("ThreadRuntimeHandler", () => {
  it("should construct without a cache repository and delegate representative reads", async () => {
    const handler = createHandler();

    await expect(handler.listThreads("all", null, null)).resolves.toEqual([]);
    await expect(handler.listSubAgentThreads("root-thread", null)).resolves.toEqual([]);
    await expect(handler.listCollaborationEvents({ sourceId: "source-1" })).resolves.toEqual([]);
    expect(handler.readThreadEventLog("thread-1", null, 50)).toEqual({
      entries: [],
      truncated: false
    });
  });

  it("should journal backend events without recursively journaling event-log updates", () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const handler = createHandler((event) => emittedEvents.push(event));

    handler.emit({
      type: "turn.started",
      sourceId: "source-1",
      threadId: "thread-1",
      turnId: "turn-1"
    });

    expect(emittedEvents.map((event) => event.type)).toEqual([
      "thread.eventLog.updated",
      "turn.started"
    ]);
    expect(handler.readThreadEventLog("thread-1", "source-1", 50).entries).toHaveLength(1);
    expect(handler.readThreadEventLog("thread.eventLog.updated", "source-1", 50).entries)
      .toEqual([]);
  });

  it("should record raw notifications with source-aware thread isolation", () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const handler = createHandler((event) => emittedEvents.push(event));
    const notification = {
      method: "turn/started" as const,
      params: {
        threadId: "thread-1",
        turn: { id: "turn-1" }
      }
    };

    handler.recordRawNotification(notification, "source-1");
    handler.recordRawNotification(notification, "source-2");

    expect(emittedEvents).toHaveLength(2);
    expect(handler.readThreadEventLog("thread-1", "source-1", 50).entries[0]).toEqual(
      expect.objectContaining({
        sourceId: "source-1",
        threadId: "thread-1",
        turnId: "turn-1",
        stage: "received",
        eventName: "turn/started"
      })
    );
    expect(handler.readThreadEventLog("thread-1", "source-2", 50).entries[0]).toEqual(
      expect.objectContaining({ sourceId: "source-2" })
    );
  });

  it("should ignore and release thread notifications", () => {
    const handler = createHandler();

    expect(handler.isThreadIgnored("commit-thread")).toBe(false);
    handler.ignoreThreadNotifications("commit-thread");
    expect(handler.isThreadIgnored("commit-thread")).toBe(true);
    handler.releaseThreadNotifications("commit-thread");
    expect(handler.isThreadIgnored("commit-thread")).toBe(false);
  });

  it("should expose the same service instances to every notification adapter read", () => {
    const handler = createHandler();
    const first = handler.getNotificationAdapters();
    const second = handler.getNotificationAdapters();

    expect(first.threadTurnCache).toBe(second.threadTurnCache);
    expect(first.threadCacheService).toBe(second.threadCacheService);
    expect(first.collaborationService).toBe(second.collaborationService);
    expect(first.threadConversationService).toBe(second.threadConversationService);
    expect(first.notificationService).toBe(second.notificationService);
  });

  it("should apply a Codex title to the shared turn cache and emit metadata", () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const handler = createHandler((event) => emittedEvents.push(event));
    const thread = createThread("thread-1");
    const adapters = handler.getNotificationAdapters();

    adapters.threadTurnCache.getOrCreate(thread);
    handler.applyCodexThreadTitle("thread-1", "Generated title", "source-1");

    expect(adapters.threadTurnCache.get("thread-1")?.thread.codexTitle).toBe("Generated title");
    expect(emittedEvents).toEqual([
      expect.objectContaining({
        type: "thread.eventLog.updated",
        threadId: "thread-1"
      }),
      expect.objectContaining({
        type: "thread.metadata.updated",
        thread: expect.objectContaining({
          id: "thread-1",
          codexTitle: "Generated title"
        })
      })
    ]);
  });

  it("should forward Codex deletion cleanup through the conversation service", async () => {
    const emittedEvents: OpenCodexEvent[] = [];
    const handler = createHandler((event) => emittedEvents.push(event));

    handler.applyCodexThreadDeleted("thread-1", "source-1");
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(emittedEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "thread.deleted",
        sourceId: "source-1",
        threadId: "thread-1"
      })
    ]));
  });
});

/** Creates a handler with deterministic cacheless callbacks. */
function createHandler(emitToHost: (event: OpenCodexEvent) => void = () => undefined): ThreadRuntimeHandler {
  const options: ThreadRuntimeHandlerOptions = {
    backendOptions: {
      settings: createSettings(),
      projectPath: null,
      appVersion: "1.12.0-alpha.2",
      emit: emitToHost
    },
    cacheRepository: null,
    getSettings: () => options.backendOptions.settings,
    emitToHost,
    ensureClient: async () => {
      throw new Error("Codex client unavailable in cacheless test.");
    },
    resolveSource: async () => {
      throw new Error("Source unavailable in cacheless test.");
    },
    cacheProject: async () => null,
    readCachedProjects: async () => [],
    handleClientError: () => undefined
  };

  return new ThreadRuntimeHandler(options);
}

/** Creates the smallest complete settings snapshot accepted by core services. */
function createSettings(): OpenCodexSettings {
  return {
    codexCommand: "codex",
    codexReleaseCheck: {
      latestVersion: "1.12.0",
      checkedAt: "2099-01-01T00:00:00.000Z",
      error: null
    },
    defaultSourceId: null,
    defaultUsageLimitId: null,
    defaultModel: null,
    defaultReasoningEffort: null,
    commitMessageModel: null,
    commitMessageReasoningEffort: null,
    commitMessageLanguage: "en",
    showActivityPanel: true,
    experimentalApi: false,
    allowTurnSteering: true,
    language: "en",
    colorScheme: "system",
    enterKeyBehavior: "smart",
    versioningVocabulary: "technical",
    desktopNotifications: {
      turnCompleted: false,
      approvalRequested: false
    },
    discordRichPresenceEnabled: false,
    onboardingCompleted: true,
    allowOutdatedCodex: false,
    developerMode: false,
    performanceMonitoringEnabled: false,
    advancedPerformanceMonitoringEnabled: false
  };
}

/** Creates a thread fixture suitable for the in-memory cache. */
function createThread(id: string): OpenCodexThread {
  return {
    id,
    sourceId: "source-1",
    projectPath: "/workspace/project",
    title: "Original title",
    customTitle: null,
    codexTitle: null,
    preview: "Preview",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "idle",
    isArchived: false,
    model: null,
    reasoningEffort: null,
    serviceTier: null,
    parentThreadId: null,
    agentRole: null,
    subAgentSource: null
  };
}
