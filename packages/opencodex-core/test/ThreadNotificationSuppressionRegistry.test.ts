import { describe, expect, it } from "vitest";

import { ThreadNotificationSuppressionRegistry } from "../src/backend/threads/ThreadNotificationSuppressionRegistry";

describe("ThreadNotificationSuppressionRegistry", () => {
  it("should isolate idempotent suppression by thread identifier", () => {
    const registry = new ThreadNotificationSuppressionRegistry();

    registry.ignore("thread-a");
    registry.ignore("thread-a");

    expect(registry.has("thread-a")).toBe(true);
    expect(registry.has("thread-b")).toBe(false);

    registry.release("thread-b");
    expect(registry.has("thread-a")).toBe(true);

    registry.release("thread-a");
    expect(registry.has("thread-a")).toBe(false);
  });
});
