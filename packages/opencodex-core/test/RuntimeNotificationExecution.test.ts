import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollaborationService } from "../src/backend/collaboration/CollaborationService.js";
import { RuntimeNotificationCoordinator } from "../src/backend/runtime/RuntimeNotificationCoordinator.js";
import {
  createExecutionMetadata,
  createMetadataChild,
  createMetadataFixture,
  createMetadataThread,
  createMetadataTurnStarted
} from "./turnExecutionMetadata.fixture.js";

/** Keeps the coordinator, collaboration registry and metadata cache real; disables external effects. */
function createContext() {
  const fixture = createMetadataFixture();
  const emit = vi.fn();
  const collaboration = new CollaborationService({ cacheRepository: null, events: { emit } });
  const handleCollaboration = vi.spyOn(collaboration, "handleNotification");
  const recordLiveCache = vi.fn();
  const handleProjectCommand = vi.fn();
  const handleUiNotification = vi.fn();
  const isThreadIgnored = vi.fn(() => false);
  const coordinator = new RuntimeNotificationCoordinator({
    settings: {
      getSettings: () => ({ developerMode: false, advancedPerformanceMonitoringEnabled: false } as OpenCodexSettings)
    },
    threads: { isThreadIgnored },
    events: { emit, recordRawNotification: vi.fn() },
    usage: { handleRateLimitsUpdated: vi.fn(), handleTurnCompleted: vi.fn() },
    threadCacheService: fixture.service,
    threadTurnCache: fixture.cache,
    collaborationService: collaboration,
    threadConversationService: {
      recordStartedThread: vi.fn().mockResolvedValue(undefined), recordNotification: recordLiveCache
    },
    projectCommandService: { handleNotification: handleProjectCommand },
    notificationService: { handleNotification: handleUiNotification }
  });
  return {
    ...fixture, coordinator, handleCollaboration, recordLiveCache,
    handleProjectCommand, handleUiNotification, isThreadIgnored
  };
}

/** Supplies a live spawn call with a stable parent/path shared by separate sources. */
function createSpawnNotification(model: string, reasoningEffort: string): CodexNotification {
  return {
    method: "rawResponseItem/completed",
    params: {
      threadId: "parent-1", turnId: "parent-turn",
      item: {
        type: "function_call", namespace: "collaboration", name: "spawn_agent", call_id: "spawn-call",
        arguments: JSON.stringify({ target: "/root/reviewer", model, reasoning_effort: reasoningEffort })
      }
    }
  };
}

describe("runtime execution metadata pipeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should record execution metadata after collaboration and before downstream notification handling", () => {
    const context = createContext();
    context.cache.getOrCreate(createMetadataThread({ model: "thread-model", reasoningEffort: "medium" }));

    context.coordinator.handleNotification(createMetadataTurnStarted(), "source-1");

    expect(context.write).toHaveBeenCalledWith("source-1", "thread-1", "turn-1", createExecutionMetadata({
      effectiveModel: "thread-model", effectiveReasoningEffort: "medium"
    }));
    expect(context.recordLiveCache.mock.invocationCallOrder[0])
      .toBeLessThan(context.handleCollaboration.mock.invocationCallOrder[0]!);
    expect(context.handleCollaboration.mock.invocationCallOrder[0])
      .toBeLessThan(context.write.mock.invocationCallOrder[0]!);
    expect(context.write.mock.invocationCallOrder[0])
      .toBeLessThan(context.handleProjectCommand.mock.invocationCallOrder[0]!);
    expect(context.write.mock.invocationCallOrder[0])
      .toBeLessThan(context.handleUiNotification.mock.invocationCallOrder[0]!);
    expect(context.coordinator.hasActiveTurn("source-1")).toBe(true);
  });

  it("should keep ignored thread notifications from recording metadata or starting turns", () => {
    const context = createContext();
    context.isThreadIgnored.mockReturnValue(true);

    context.coordinator.handleNotification(createMetadataTurnStarted(), "source-1");

    expect(context.write).not.toHaveBeenCalled();
    expect(context.handleCollaboration).not.toHaveBeenCalled();
    expect(context.cache.getTurnExecutionMetadata("thread-1", "turn-1")).toBeNull();
    expect(context.coordinator.hasActiveTurn("source-1")).toBe(false);
  });

  it("should inherit live spawn settings from each source's real collaboration registry", () => {
    const context = createContext();
    context.cache.getOrCreate(createMetadataChild("child-a", "source-a"));
    context.cache.getOrCreate(createMetadataChild("child-b", "source-b"));
    context.coordinator.handleNotification(createSpawnNotification("model-a", "high"), "source-a");
    context.coordinator.handleNotification(createSpawnNotification("model-b", "low"), "source-b");

    context.coordinator.handleNotification(createMetadataTurnStarted("child-a"), "source-a");
    context.coordinator.handleNotification(createMetadataTurnStarted("child-b"), "source-b");

    const metadataA = createExecutionMetadata({
      requestedModel: "model-a", effectiveModel: "model-a",
      requestedReasoningEffort: "high", effectiveReasoningEffort: "high"
    });
    const metadataB = createExecutionMetadata({
      requestedModel: "model-b", effectiveModel: "model-b",
      requestedReasoningEffort: "low", effectiveReasoningEffort: "low"
    });
    expect(context.cache.getTurnExecutionMetadata("child-a", "turn-1")).toEqual(metadataA);
    expect(context.cache.getTurnExecutionMetadata("child-b", "turn-1")).toEqual(metadataB);
    expect(context.write).toHaveBeenCalledWith("source-a", "child-a", "turn-1", metadataA);
    expect(context.write).toHaveBeenCalledWith("source-b", "child-b", "turn-1", metadataB);
    expect(context.write).toHaveBeenCalledTimes(2);
  });
});
