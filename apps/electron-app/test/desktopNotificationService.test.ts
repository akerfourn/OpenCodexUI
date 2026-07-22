import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexApproval,
  OpenCodexApprovalDecision,
  OpenCodexEvent,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import { DesktopNotificationService } from "../src/main/desktopNotificationService";
import { defaultSettings } from "../src/main/settingsStore";

describe("DesktopNotificationService", () => {
  it("should ignore interrupted and failed turns", () => {
    const createNotification = vi.fn(() => createFakeNotification());
    const service = createService(createNotification);

    service.handleEvent(createTurnCompletedEvent("failed"));
    service.handleEvent(createTurnCompletedEvent("interrupted"));

    expect(createNotification).not.toHaveBeenCalled();
  });

  it("should navigate when a completed response notification is clicked", () => {
    const notification = createFakeNotification();
    const createNotification = vi.fn(() => notification);
    const focusWindow = vi.fn();
    const navigateToThread = vi.fn();
    const service = createService(createNotification, {
      focusWindow,
      navigateToThread
    });

    service.handleEvent(createTurnCompletedEvent("completed"));
    notification.emit("click");

    expect(focusWindow).toHaveBeenCalledTimes(1);
    expect(navigateToThread).toHaveBeenCalledWith("source-1", "thread-1");
  });

  it("should resolve a native approval action through the existing approval flow", () => {
    const notification = createFakeNotification();
    const createNotification = vi.fn(() => notification);
    const navigateToThread = vi.fn();
    const resolveApproval = vi.fn();
    const service = createService(createNotification, {
      navigateToThread,
      resolveApproval
    });
    const approval: OpenCodexApproval = {
      id: "approval-1",
      sourceId: "source-1",
      threadId: "thread-1",
      title: "Run tests",
      kind: "command",
      body: "Run tests",
      reason: null,
      command: "npm test",
      cwd: "/project",
      grantRoot: null,
      permissions: null,
      choices: ["accept", "acceptForSession", "decline"]
    };

    service.handleEvent({ type: "approval.requested", approval });
    notification.emit("action", {}, 1);

    expect(navigateToThread).toHaveBeenCalledWith("source-1", "thread-1");
    expect(resolveApproval).toHaveBeenCalledWith("approval-1", "acceptForSession");
    expect(notification.options["actions"]).toEqual([
      { type: "button", text: "Yes" },
      { type: "button", text: "Always allow" },
      { type: "button", text: "No" }
    ]);

    service.handleEvent({ type: "approval.resolved", approvalId: "approval-1" });
    expect(notification.close).toHaveBeenCalledTimes(1);
  });
});

type FakeNotification = {
  options: Record<string, unknown>;
  on(event: string, listener: (...args: unknown[]) => void): FakeNotification;
  emit(event: string, ...args: unknown[]): void;
  show: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

/** Creates a native notification double with manually triggerable events. */
function createFakeNotification(): FakeNotification {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const notification = {
    options: {},
    on(event: string, listener: (...args: unknown[]) => void): FakeNotification {
      listeners.set(event, listener);
      return notification;
    },
    emit(event: string, ...args: unknown[]): void {
      listeners.get(event)?.(...args);
    },
    show: vi.fn(),
    close: vi.fn()
  } satisfies FakeNotification;

  return notification;
}

/** Creates a service configured with deterministic native notification hooks. */
function createService(
  createNotification: ReturnType<typeof vi.fn>,
  overrides: {
    focusWindow?: () => void;
    navigateToThread?: (sourceId: string | null, threadId: string) => void;
    resolveApproval?: (approvalId: string, decision: OpenCodexApprovalDecision) => void;
  } = {}
): DesktopNotificationService {
  const settings: OpenCodexSettings = {
    ...defaultSettings,
    desktopNotifications: {
      turnCompleted: true,
      approvalRequested: true
    }
  };

  return new DesktopNotificationService({
    settings,
    platform: "darwin",
    isSupported: () => true,
    createNotification: (options) => {
      const notification = createNotification(options) as FakeNotification;
      notification.options = options as unknown as Record<string, unknown>;
      return notification as never;
    },
    focusWindow: overrides.focusWindow ?? vi.fn(),
    navigateToThread: overrides.navigateToThread ?? vi.fn(),
    resolveApproval: overrides.resolveApproval ?? vi.fn(),
    logger: vi.fn()
  });
}

/** Creates one completed-turn event for the notification tests. */
function createTurnCompletedEvent(
  turnStatus: string
): Extract<OpenCodexEvent, { type: "turn.completed" }> {
  return {
    type: "turn.completed",
    sourceId: "source-1",
    threadId: "thread-1",
    turnId: "turn-1",
    durationMs: 100,
    turnStatus
  };
}
