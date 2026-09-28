import { describe, expect, it, vi } from "vitest";
import type { CodexNotification } from "@open-codex-ui/codex-rpc";

import { createActivityFromNotification, mapThread, mapTurnsToOpenCodexTurns } from "../src/mapping";
import { ThreadTurnCache } from "../src/ThreadTurnCache";
import { recordLiveNotification, shouldPersistLiveNotification } from "../src/backend/threads/liveTurnNotifications";
import { NotificationService } from "../src/backend/support/NotificationService";

/** Creates deterministic review notifications without invoking Codex or a model. */
function notification(status: string, reviewId = "review-1", action: unknown = {
  type: "command", command: "npm install example", cwd: "/workspace/project"
}): CodexNotification {
  return {
    method: status === "inProgress" ? "item/autoApprovalReview/started" : "item/autoApprovalReview/completed",
    params: {
      threadId: "thread-1", turnId: "turn-1", reviewId, targetItemId: "command-1",
      action,
      review: { status, rationale: "Explicit dependency installation request.", riskLevel: "low" }
    }
  };
}

describe("automatic approval reviews", () => {
  it.each([
    ["inProgress", "running"], ["approved", "completed"], ["denied", "error"],
    ["timedOut", "error"], ["aborted", "error"]
  ])("should map %s without losing the action or rationale", (status, activityStatus) => {
    expect(createActivityFromNotification(notification(status))).toMatchObject({
      id: "auto-approval-review:review-1",
      threadId: "thread-1",
      title: "turn-1",
      kind: "autoApprovalReview",
      status: activityStatus,
      autoApprovalReview: {
        status,
        action: "npm install example",
        rationale: "Explicit dependency installation request.",
        riskLevel: "low",
        userAuthorization: null
      }
    });
  });

  it("should keep unknown outcomes explicit and ignore requests without a review id", () => {
    expect(createActivityFromNotification(notification("futureStatus"))).toMatchObject({
      status: "error", autoApprovalReview: { status: "unknown" }
    });
    expect(createActivityFromNotification(notification("approved", ""))).toBeNull();
  });

  it("should identify network reviews without requiring an associated command item", () => {
    const event = notification("denied", "network-1", {
      type: "networkAccess", host: "registry.npmjs.org", port: 443, protocol: "https"
    });
    event.params = { ...event.params as object, targetItemId: null };
    expect(createActivityFromNotification(event)).toMatchObject({
      autoApprovalReview: { action: "registry.npmjs.org", status: "denied" }
    });
  });

  it("should preserve source and conversation routing when emitting the UI update", () => {
    const emit = vi.fn();
    const service = new NotificationService({
      events: { emit }, applyCodexThreadTitle: vi.fn(), applyCodexThreadDeleted: vi.fn(),
      syncCompletedTurn: vi.fn()
    });
    service.handleNotification(notification("approved"), "source-b");
    expect(emit).toHaveBeenCalledWith({
      type: "activity.updated", sourceId: "source-b", threadId: "thread-1",
      activity: expect.objectContaining({ autoApprovalReview: expect.objectContaining({ status: "approved" }) })
    });
  });

  it("should retain separate reviews through completion, serialization and server history refresh", () => {
    const cache = new ThreadTurnCache();
    const thread = mapThread({ id: "thread-1" });
    const entry = cache.getOrCreate(thread);
    recordLiveNotification(cache, notification("inProgress"));
    recordLiveNotification(cache, notification("denied"));
    recordLiveNotification(cache, notification("approved", "review-2"));
    recordLiveNotification(cache, notification("approved", "review-2"));

    const restoredCache = new ThreadTurnCache();
    const restoredEntry = restoredCache.getOrCreate(thread);
    restoredCache.mergeLatestTurns(restoredEntry, JSON.parse(JSON.stringify(cache.toTurns(entry))), null);
    restoredCache.mergeLatestTurns(restoredEntry, [{
      id: "turn-1", status: "completed",
      items: [{ id: "command-1", type: "commandExecution", command: "npm install example" }]
    }], null);

    const turns = mapTurnsToOpenCodexTurns("thread-1", restoredCache.toTurns(restoredEntry));
    const reviews = turns[0]?.items.filter((item) => item.kind === "autoApprovalReview");
    expect(reviews).toHaveLength(2);
    expect(reviews?.map((item) => item.autoApprovalReview?.status)).toEqual(["denied", "approved"]);
    expect(shouldPersistLiveNotification("item/autoApprovalReview/completed")).toBe(true);
    expect(shouldPersistLiveNotification("item/autoApprovalReview/started")).toBe(true);
  });
});
