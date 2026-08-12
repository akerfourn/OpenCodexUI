/**
 * Provides deterministic aggregation and anomaly rules for performance monitoring.
 */
import type {
  OpenCodexEvent,
  OpenCodexRendererPerformanceSample
} from "@open-codex-ui/opencodex-protocol";

/** Counters accumulated during one performance monitoring interval. */
export type MonitoringCounters = {
  notificationCount: number;
  notificationBytes: number;
  maxNotificationDurationMs: number;
  notificationCategories: Record<string, number>;
  eventCount: number;
  eventBytes: number;
  notificationCounts: Record<string, number>;
  eventCounts: Record<string, number>;
  liveCacheNotificationCount: number;
  liveCacheDurationMs: number;
  maxLiveCacheDurationMs: number;
  liveCacheNotificationCounts: Record<string, number>;
};

/** Minimal snapshot shape required by the anomaly rules. */
type AnomalySnapshot = {
  mainEventLoopDelayMs: number;
  maxNotificationDurationMs: number;
  renderer: Pick<
    OpenCodexRendererPerformanceSample,
    | "isDocumentVisible"
    | "eventLoopDelayMs"
    | "longTaskDurationMs"
    | "maxLongTaskDurationMs"
    | "maxEventHandlingDurationMs"
  > | null;
};

/** Creates empty interval counters. */
export function createCounters(): MonitoringCounters {
  return {
    notificationCount: 0,
    notificationBytes: 0,
    maxNotificationDurationMs: 0,
    notificationCategories: {},
    eventCount: 0,
    eventBytes: 0,
    notificationCounts: {},
    eventCounts: {},
    liveCacheNotificationCount: 0,
    liveCacheDurationMs: 0,
    maxLiveCacheDurationMs: 0,
    liveCacheNotificationCounts: {}
  };
}

/** Maps verbose notification methods to stable standard-mode categories. */
export function readNotificationCategory(method: string): string {
  if (method === "item/agentMessage/delta") {
    return "assistantDelta";
  }

  if (method.startsWith("item/reasoning/")) {
    return "reasoningDelta";
  }

  if (method === "command/exec/outputDelta" ||
    method === "item/commandExecution/outputDelta" ||
    method === "process/outputDelta") {
    return "commandOutputDelta";
  }

  if (method === "turn/diff/updated") {
    return "diffUpdated";
  }

  if (method.startsWith("item/fileChange/")) {
    return "fileChange";
  }

  if (method === "item/mcpToolCall/progress") {
    return "toolProgress";
  }

  if (method === "rawResponseItem/completed") {
    return "rawResponseItem";
  }

  if (method === "item/started" || method === "item/completed") {
    return "itemLifecycle";
  }

  if (method === "thread/started" || method === "thread/status/changed") {
    return "threadLifecycle";
  }

  return "other";
}

/**
 * Returns a stable average duration for one sampled interval.
 *
 * @param totalDurationMs Accumulated duration.
 * @param count Number of timed operations.
 * @returns Average duration, or zero when no operation was timed.
 */
export function readAverageDuration(totalDurationMs: number, count: number): number {
  return count > 0 ? totalDurationMs / count : 0;
}

/** Estimates user-independent event payload volume from known string fields. */
export function estimateEventBytes(event: OpenCodexEvent): number {
  if (event.type === "message.delta") {
    return event.delta.length;
  }

  if (event.type === "activity.updated") {
    return (event.activity.content?.length ?? 0) +
      (event.activity.details?.length ?? 0) +
      (event.activity.summary?.length ?? 0);
  }

  if (event.type === "projectCommand.output") {
    return event.delta.length;
  }

  if (event.type === "collaboration.updated") {
    const collaborationEvent = event.event;
    const values = [
      collaborationEvent.prompt,
      collaborationEvent.result,
      collaborationEvent.taskName,
      collaborationEvent.senderAgentPath,
      ...collaborationEvent.receiverThreadIds,
      ...collaborationEvent.receiverAgentPaths
    ];

    return values.reduce((total, value) => total + (value?.length ?? 0), 0);
  }

  return 0;
}

/** Reads anomaly reasons from one aggregated interval. */
export function readAnomalyReasons(snapshot: AnomalySnapshot): string[] {
  const reasons: string[] = [];
  const renderer = snapshot.renderer;

  if (snapshot.mainEventLoopDelayMs >= 150) {
    reasons.push("main_event_loop_delay");
  }

  if (snapshot.maxNotificationDurationMs >= 100) {
    reasons.push("backend_notification_duration");
  }

  if (renderer?.isDocumentVisible === true && renderer.eventLoopDelayMs >= 150) {
    reasons.push("renderer_event_loop_delay");
  }

  if (renderer?.isDocumentVisible === true && renderer.longTaskDurationMs >= 500) {
    reasons.push("renderer_long_tasks");
  }

  if (renderer?.isDocumentVisible === true && renderer.maxEventHandlingDurationMs >= 100) {
    reasons.push("renderer_event_handling_duration");
  }

  return reasons;
}

/** Returns whether one interval is severe enough to log immediately. */
export function isSevereAnomaly(snapshot: AnomalySnapshot): boolean {
  const renderer = snapshot.renderer;

  return snapshot.mainEventLoopDelayMs >= 1_000 ||
    snapshot.maxNotificationDurationMs >= 500 ||
    (
      renderer?.isDocumentVisible === true &&
      (
        renderer.eventLoopDelayMs >= 1_000 ||
        renderer.maxLongTaskDurationMs >= 1_000 ||
        renderer.maxEventHandlingDurationMs >= 500
      )
    );
}
