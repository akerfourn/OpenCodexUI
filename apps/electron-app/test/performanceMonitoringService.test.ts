import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexRendererPerformanceSample,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import { defaultSettings } from "../src/main/settingsStore";
import { PerformanceMonitoringService } from "../src/main/performanceMonitoringService";

describe("PerformanceMonitoringService", () => {
  it("should_collect_bounded_standard_metrics_without_event_breakdowns", () => {
    let now = 1_800_000_000_000;
    const createLog = vi.fn();
    const service = createService(defaultSettings, () => now, createLog);

    service.recordCodexNotification("item/reasoning/textDelta", 42);
    service.recordCodexNotificationProcessing(3);
    service.recordLiveCacheNotification("item/reasoning/textDelta", 2);
    service.recordBackendEvent({
      type: "message.delta",
      threadId: "thread-1",
      turnId: "turn-1",
      messageId: "message-1",
      delta: "hello"
    });
    service.recordRendererSample(createRendererSample(now, {
      plainRenderCount: 1,
      plainRenderDurationMs: 4,
      maxPlainRenderDurationMs: 4,
      highlightedRenderCount: 1,
      highlightedRenderDurationMs: 12,
      maxHighlightedRenderDurationMs: 12,
      maxMarkdownLength: 1_024
    }));
    now += 1_000;

    const snapshot = service.collectSnapshot();

    expect(snapshot).toMatchObject({
      mode: "standard",
      notificationCount: 1,
      notificationBytes: 42,
      maxNotificationDurationMs: 3,
      notificationCategories: { reasoningDelta: 1 },
      eventCount: 1,
      eventBytes: 5
    });
    expect(snapshot?.notificationCounts).toBeUndefined();
    expect(snapshot?.eventCounts).toBeUndefined();
    expect(snapshot?.liveCacheNotificationCount).toBeUndefined();
    expect(snapshot?.renderer?.markdown).toBeUndefined();
    expect(createLog).not.toHaveBeenCalled();
    service.dispose();
  });

  it("should_include_per_type_breakdowns_only_in_advanced_developer_mode", () => {
    let now = 1_800_000_000_000;
    const settings = {
      ...defaultSettings,
      developerMode: true,
      advancedPerformanceMonitoringEnabled: true
    };
    const service = createService(settings, () => now, vi.fn());

    service.recordCodexNotification("turn/diff/updated", 128);
    service.recordCodexNotificationProcessing(4);
    service.recordLiveCacheNotification("turn/diff/updated", 1.5);
    service.recordBackendEvent({ type: "turn.started", threadId: "thread-1", turnId: "turn-1" });
    service.recordRendererSample(createRendererSample(now, {
      plainRenderCount: 2,
      plainRenderDurationMs: 8,
      maxPlainRenderDurationMs: 5,
      highlightedRenderCount: 1,
      highlightedRenderDurationMs: 20,
      maxHighlightedRenderDurationMs: 20,
      maxMarkdownLength: 2_048
    }));
    now += 1_000;

    const snapshot = service.collectSnapshot();

    expect(snapshot?.mode).toBe("advanced");
    expect(snapshot?.notificationCounts).toEqual({ "turn/diff/updated": 1 });
    expect(snapshot?.eventCounts).toEqual({ "turn.started": 1 });
    expect(snapshot?.liveCacheNotificationCount).toBe(1);
    expect(snapshot?.liveCacheDurationMs).toBe(1.5);
    expect(snapshot?.averageLiveCacheDurationMs).toBe(1.5);
    expect(snapshot?.maxLiveCacheDurationMs).toBe(1.5);
    expect(snapshot?.liveCacheNotificationCounts).toEqual({ "turn/diff/updated": 1 });
    expect(snapshot?.renderer?.markdown).toEqual({
      plainRenderCount: 2,
      plainRenderDurationMs: 8,
      maxPlainRenderDurationMs: 5,
      highlightedRenderCount: 1,
      highlightedRenderDurationMs: 20,
      maxHighlightedRenderDurationMs: 20,
      maxMarkdownLength: 2_048
    });
    service.dispose();
  });

  it("should_expose_multi_agent_lifecycle_volume_without_retaining_content", () => {
    let now = 1_800_000_000_000;
    const service = createService(defaultSettings, () => now, vi.fn());

    service.recordCodexNotification("rawResponseItem/completed", 100);
    service.recordCodexNotification("item/completed", 80);
    service.recordCodexNotification("thread/started", 60);
    service.recordBackendEvent({
      type: "collaboration.updated",
      sourceId: "source-1",
      event: {
        id: "event-1",
        sourceId: "source-1",
        threadId: "parent-1",
        turnId: "turn-1",
        callId: "call-1",
        action: "spawn",
        toolName: "spawn_agent",
        senderThreadId: "parent-1",
        senderAgentPath: "/root",
        receiverThreadIds: ["child-1"],
        receiverAgentPaths: ["/root/reviewer"],
        prompt: "delegate",
        result: "done",
        taskName: "review",
        model: "gpt-5.6-luna",
        reasoningEffort: "medium",
        agentRole: "explorer",
        forkTurns: "all",
        status: "completed",
        targetAgentStatuses: {},
        evidence: ["rawFunctionCall"]
      }
    });
    now += 1_000;

    const snapshot = service.collectSnapshot();

    expect(snapshot).toMatchObject({
      notificationCategories: {
        rawResponseItem: 1,
        itemLifecycle: 1,
        threadLifecycle: 1
      },
      eventCount: 1,
      eventBytes: 44
    });
    service.dispose();
  });

  it("should_log_after_three_sustained_slow_intervals_and_apply_cooldown", () => {
    let now = 1_800_000_000_000;
    const createLog = vi.fn();
    const service = createService(defaultSettings, () => now, createLog);

    for (let index = 0; index < 6; index += 1) {
      now += 1_200;
      service.collectSnapshot();
    }

    expect(createLog).toHaveBeenCalledTimes(1);
    expect(createLog).toHaveBeenCalledWith(
      "Performance slowdown detected",
      expect.objectContaining({
        reasons: expect.arrayContaining(["main_event_loop_delay"]),
        history: expect.any(Array)
      })
    );
    const details = createLog.mock.calls[0]?.[1] as { history: unknown[] };
    expect(details.history).toHaveLength(3);
    service.dispose();
  });

  it("should_stop_collecting_when_monitoring_is_disabled", () => {
    let now = 1_800_000_000_000;
    const service = createService(defaultSettings, () => now, vi.fn());

    service.setSettings({ ...defaultSettings, performanceMonitoringEnabled: false });
    now += 2_000;

    expect(service.collectSnapshot()).toBeNull();
    service.dispose();
  });

  it("should_log_a_severe_visible_renderer_long_task_immediately", () => {
    let now = 1_800_000_000_000;
    const createLog = vi.fn();
    const service = createService(defaultSettings, () => now, createLog);

    service.recordRendererSample({
      capturedAt: new Date(now).toISOString(),
      intervalMs: 1_000,
      isDocumentVisible: true,
      eventLoopDelayMs: 0,
      longTaskCount: 1,
      longTaskDurationMs: 1_200,
      maxLongTaskDurationMs: 1_200,
      processedEventCount: 0,
      estimatedEventBytes: 0,
      maxEventHandlingDurationMs: 0
    });
    now += 1_000;
    service.collectSnapshot();

    expect(createLog).toHaveBeenCalledTimes(1);
    expect(createLog).toHaveBeenCalledWith(
      "Performance slowdown detected",
      expect.objectContaining({
        reasons: expect.arrayContaining(["renderer_long_tasks"])
      })
    );
    service.dispose();
  });

  it("should_ignore_a_system_suspension_delay", () => {
    let now = 1_800_000_000_000;
    const createLog = vi.fn();
    const service = createService(defaultSettings, () => now, createLog);

    now += 60_000;
    const snapshot = service.collectSnapshot();

    expect(snapshot?.mainEventLoopDelayMs).toBe(0);
    expect(createLog).not.toHaveBeenCalled();
    service.dispose();
  });
});

/** Creates a test monitor with deterministic time and process metrics. */
function createService(
  settings: OpenCodexSettings,
  now: () => number,
  createLog: ReturnType<typeof vi.fn>
): PerformanceMonitoringService {
  return new PerformanceMonitoringService(settings, {
    now,
    createLog,
    readProcessMetrics: () => [{
      type: "Browser",
      cpuPercent: 1,
      workingSetSizeKb: 1_024
    }]
  });
}

/** Creates one renderer sample with optional Markdown timing aggregates. */
function createRendererSample(
  capturedAt: number,
  markdown: NonNullable<OpenCodexRendererPerformanceSample["markdown"]>
): OpenCodexRendererPerformanceSample {
  return {
    capturedAt: new Date(capturedAt).toISOString(),
    intervalMs: 1_000,
    isDocumentVisible: true,
    eventLoopDelayMs: 0,
    longTaskCount: 0,
    longTaskDurationMs: 0,
    maxLongTaskDurationMs: 0,
    processedEventCount: 0,
    estimatedEventBytes: 0,
    maxEventHandlingDurationMs: 0,
    markdown
  };
}
