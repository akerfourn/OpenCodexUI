import { describe, expect, it, vi } from "vitest";
import { OpenCodexRequestRouter } from "../src/OpenCodexRequestRouter";
import type { OpenCodexBackendRuntime } from "../src/OpenCodexBackendRuntime";
import { requestRoutingRuntime } from "./requestRoutingFixture";

describe("cached workspace history routing", () => {
  it("should read the explicit thread history through the workspace facade", async () => {
    const history = vi.fn(async () => []);
    const runtime = { workspaces: { history } } as unknown as OpenCodexBackendRuntime;
    const router = new OpenCodexRequestRouter(requestRoutingRuntime(runtime));
    await expect(router.handleRequest({ type: "threads.workspace.history", threadId: "thread" })).resolves.toEqual([]);
    expect(history).toHaveBeenCalledWith("thread");
  });

  it("should leave an optional history failure to the timeline without recovering an unrelated chat", async () => {
    const handleRequestError = vi.fn();
    const runtime = { handleRequestError, workspaces: {
      history: vi.fn(async () => { throw new Error("History cache unavailable"); })
    } } as unknown as OpenCodexBackendRuntime;
    const router = new OpenCodexRequestRouter(requestRoutingRuntime(runtime));
    await expect(router.handleRequest({ type: "threads.workspace.history", threadId: "thread" }))
      .rejects.toThrow("History cache unavailable");
    expect(handleRequestError).not.toHaveBeenCalled();
  });
});
