import { describe, expect, it } from "vitest";

import type { OpenCodexEvent } from "@open-codex-ui/opencodex-protocol";

import {
  createCounters,
  estimateEventBytes,
  isSevereAnomaly,
  readAnomalyReasons,
  readAverageDuration,
  readNotificationCategory
} from "../src/main/performanceMonitoringHelpers";

describe("performance monitoring helpers", () => {
  it("should_map_all_notification_methods_to_complete_categories", () => {
    const categories: Array<[string, string]> = [
      ["item/agentMessage/delta", "assistantDelta"],
      ["item/reasoning/textDelta", "reasoningDelta"],
      ["command/exec/outputDelta", "commandOutputDelta"],
      ["item/commandExecution/outputDelta", "commandOutputDelta"],
      ["process/outputDelta", "commandOutputDelta"],
      ["turn/diff/updated", "diffUpdated"],
      ["item/fileChange/started", "fileChange"],
      ["item/mcpToolCall/progress", "toolProgress"],
      ["rawResponseItem/completed", "rawResponseItem"],
      ["item/started", "itemLifecycle"],
      ["item/completed", "itemLifecycle"],
      ["thread/started", "threadLifecycle"],
      ["thread/status/changed", "threadLifecycle"],
      ["turn/completed", "other"]
    ];

    for (const [method, expectedCategory] of categories) {
      expect(readNotificationCategory(method)).toBe(expectedCategory);
    }
  });

  it("should_estimate_bytes_for_each_supported_event_and_fallback", () => {
    const events: Array<[OpenCodexEvent, number]> = [
      [{
        type: "message.delta",
        threadId: "thread-1",
        messageId: "message-1",
        turnId: "turn-1",
        delta: "hello"
      }, 5],
      [{
        type: "activity.updated",
        threadId: "thread-1",
        activity: {
          id: "activity-1",
          threadId: "thread-1",
          kind: "reasoning",
          content: "abc",
          details: "de",
          summary: "f",
          status: "running"
        }
      }, 6],
      [{
        type: "projectCommand.output",
        projectId: "project-1",
        commandId: "command-1",
        runId: "run-1",
        stream: "stdout",
        delta: "output"
      }, 6],
      [{
        type: "collaboration.updated",
        sourceId: "source-1",
        event: {
          id: "event-1",
          sourceId: "source-1",
          threadId: "thread-1",
          turnId: "turn-1",
          callId: "call-1",
          action: "spawn",
          toolName: "spawn_agent",
          senderThreadId: "thread-1",
          senderAgentPath: "/root",
          receiverThreadIds: ["a", "bb"],
          receiverAgentPaths: ["/x"],
          prompt: "ask",
          result: "ok",
          taskName: "task",
          model: "gpt-5",
          reasoningEffort: "medium",
          agentRole: "reviewer",
          forkTurns: "all",
          status: "completed",
          targetAgentStatuses: {},
          evidence: ["rawFunctionCall"]
        }
      }, 19],
      [{ type: "turn.started", threadId: "thread-1", turnId: "turn-1" }, 0]
    ];

    for (const [event, expectedBytes] of events) {
      expect(estimateEventBytes(event)).toBe(expectedBytes);
    }
  });

  it("should_create_independent_counter_objects_and_buckets", () => {
    const first = createCounters();
    const second = createCounters();

    first.notificationCategories.assistantDelta = 1;
    first.notificationCounts["item/agentMessage/delta"] = 1;
    first.eventCounts["message.delta"] = 1;
    first.liveCacheNotificationCounts["item/agentMessage/delta"] = 1;

    expect(second).toEqual(createCounters());
  });

  it("should_return_zero_or_the_positive_average_duration", () => {
    expect(readAverageDuration(0, 0)).toBe(0);
    expect(readAverageDuration(30, 0)).toBe(0);
    expect(readAverageDuration(30, 3)).toBe(10);
  });

  it("should_read_reason_thresholds_for_main_backend_and_visible_renderer_lag", () => {
    expect(readAnomalyReasons(createAnomalySnapshot())).toEqual([]);
    expect(readAnomalyReasons(createAnomalySnapshot({
      mainEventLoopDelayMs: 150,
      maxNotificationDurationMs: 100,
      renderer: createRendererAnomalySample({
        eventLoopDelayMs: 150,
        longTaskDurationMs: 500,
        maxEventHandlingDurationMs: 100
      })
    }))).toEqual([
      "main_event_loop_delay",
      "backend_notification_duration",
      "renderer_event_loop_delay",
      "renderer_long_tasks",
      "renderer_event_handling_duration"
    ]);
  });

  it("should_read_severe_thresholds_including_renderer_max_long_task", () => {
    expect(isSevereAnomaly(createAnomalySnapshot())).toBe(false);
    expect(isSevereAnomaly(createAnomalySnapshot({ mainEventLoopDelayMs: 999 }))).toBe(false);
    expect(isSevereAnomaly(createAnomalySnapshot({ mainEventLoopDelayMs: 1_000 }))).toBe(true);
    expect(isSevereAnomaly(createAnomalySnapshot({ maxNotificationDurationMs: 499 }))).toBe(false);
    expect(isSevereAnomaly(createAnomalySnapshot({ maxNotificationDurationMs: 500 }))).toBe(true);
    expect(isSevereAnomaly(createAnomalySnapshot({
      renderer: createRendererAnomalySample({ eventLoopDelayMs: 1_000 })
    }))).toBe(true);
    expect(isSevereAnomaly(createAnomalySnapshot({
      renderer: createRendererAnomalySample({ maxLongTaskDurationMs: 1_000 })
    }))).toBe(true);
    expect(isSevereAnomaly(createAnomalySnapshot({
      renderer: createRendererAnomalySample({ maxEventHandlingDurationMs: 500 })
    }))).toBe(true);
  });

  it("should_ignore_renderer_anomalies_when_the_document_is_invisible", () => {
    const renderer = createRendererAnomalySample({
      isDocumentVisible: false,
      eventLoopDelayMs: 1_000,
      longTaskDurationMs: 1_000,
      maxLongTaskDurationMs: 1_000,
      maxEventHandlingDurationMs: 500
    });
    const snapshot = createAnomalySnapshot({ renderer });

    expect(readAnomalyReasons(snapshot)).toEqual([]);
    expect(isSevereAnomaly(snapshot)).toBe(false);
  });

  it("should_use_total_long_task_duration_for_reasons_and_max_duration_for_severity", () => {
    const longTaskSnapshot = createAnomalySnapshot({
      renderer: createRendererAnomalySample({
        longTaskDurationMs: 500,
        maxLongTaskDurationMs: 999
      })
    });

    expect(readAnomalyReasons(longTaskSnapshot)).toEqual(["renderer_long_tasks"]);
    expect(isSevereAnomaly(longTaskSnapshot)).toBe(false);
    expect(isSevereAnomaly(createAnomalySnapshot({
      renderer: createRendererAnomalySample({
        longTaskDurationMs: 0,
        maxLongTaskDurationMs: 1_000
      })
    }))).toBe(true);
  });
});

type AnomalySnapshot = Parameters<typeof readAnomalyReasons>[0];
type AnomalyRenderer = NonNullable<AnomalySnapshot["renderer"]>;

/** Creates a minimal anomaly snapshot for helper tests. */
function createAnomalySnapshot(
  overrides: Partial<AnomalySnapshot> = {}
): AnomalySnapshot {
  return {
    mainEventLoopDelayMs: 0,
    maxNotificationDurationMs: 0,
    renderer: null,
    ...overrides
  };
}

/** Creates renderer metrics with only the anomaly fields under test. */
function createRendererAnomalySample(
  overrides: Partial<AnomalyRenderer> = {}
): AnomalyRenderer {
  return {
    isDocumentVisible: true,
    eventLoopDelayMs: 0,
    longTaskDurationMs: 0,
    maxLongTaskDurationMs: 0,
    maxEventHandlingDurationMs: 0,
    ...overrides
  };
}
