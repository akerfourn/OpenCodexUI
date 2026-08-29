/** Covers source routing and safe request shaping for native thread goals. */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexThreadGoal
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import { ThreadGoalService } from "../src/backend/threads/ThreadGoalService";

describe("ThreadGoalService", () => {
  it("should route goal operations through the resolved source and omit undefined fields", async () => {
    const goal = createGoal();
    const client = {
      getThreadGoal: vi.fn(async () => ({ goal })),
      setThreadGoal: vi.fn(async () => ({ goal })),
      clearThreadGoal: vi.fn(async () => ({ cleared: true }))
    } as unknown as CodexAppServerClient;
    const sourceResolver = {
      resolveThreadSourceId: vi.fn(async () => "source-a")
    };
    const ensureClient = vi.fn(async () => client);
    const events = {
      emit: vi.fn(),
      recordClientRequest: vi.fn()
    };
    const service = new ThreadGoalService({
      sourceResolver,
      clients: { ensureClient },
      events
    });

    await expect(service.read("thread-1", "source-a")).resolves.toEqual(goal);
    await expect(service.set("thread-1", "source-a", {
      objective: "Finish the migration",
      status: "active",
      tokenBudget: 20_000
    })).resolves.toEqual(goal);
    await expect(service.clear("thread-1", "source-a")).resolves.toEqual({ cleared: true });

    expect(sourceResolver.resolveThreadSourceId).toHaveBeenCalledTimes(3);
    expect(sourceResolver.resolveThreadSourceId).toHaveBeenNthCalledWith(
      1,
      "thread-1",
      "source-a"
    );
    expect(sourceResolver.resolveThreadSourceId).toHaveBeenNthCalledWith(
      2,
      "thread-1",
      "source-a"
    );
    expect(sourceResolver.resolveThreadSourceId).toHaveBeenNthCalledWith(
      3,
      "thread-1",
      "source-a"
    );
    expect(ensureClient).toHaveBeenCalledTimes(3);
    expect(ensureClient).toHaveBeenNthCalledWith(1, "source-a");
    expect(ensureClient).toHaveBeenNthCalledWith(2, "source-a");
    expect(ensureClient).toHaveBeenNthCalledWith(3, "source-a");
    expect(client.setThreadGoal).toHaveBeenCalledWith({
      threadId: "thread-1",
      objective: "Finish the migration",
      status: "active",
      tokenBudget: 20_000
    });
    expect(events.recordClientRequest).toHaveBeenCalledWith(
      "source-a",
      "thread-1",
      "thread.goal.set",
      null,
      expect.objectContaining({
        hasObjective: true,
        objectiveLength: 20,
        tokenBudget: 20_000
      })
    );
    expect(events.recordClientRequest.mock.calls[1]?.[4]).not.toHaveProperty(
      "objective"
    );
    expect(events.emit).not.toHaveBeenCalled();
  });

  it("should reject goal operations when no Codex source can be resolved", async () => {
    const service = new ThreadGoalService({
      sourceResolver: {
        resolveThreadSourceId: vi.fn(async () => null)
      },
      clients: {
        ensureClient: vi.fn()
      },
      events: {
        recordClientRequest: vi.fn()
      }
    });

    await expect(service.read("orphan-thread")).rejects.toThrow(
      "Cannot manage a native goal without a Codex source."
    );
  });
});

/** Creates the complete goal shape returned by the app-server. */
function createGoal(): OpenCodexThreadGoal {
  return {
    threadId: "thread-1",
    objective: "Finish the migration",
    status: "active",
    tokenBudget: 20_000,
    tokensUsed: 1_000,
    timeUsedSeconds: 12,
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_010
  };
}
