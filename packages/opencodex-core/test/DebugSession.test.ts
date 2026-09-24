import { describe, test, expect, vi } from "vitest";
import type { DebugConfiguration } from "@open-codex-ui/opencodex-protocol";
import { DebugSession } from "../src/backend/debug/DebugSession.js";
import type { DebugAdapter } from "../src/backend/debug/DebugAdapter.js";
import type { DapConnection } from "../src/backend/debug/DapConnection.js";

const context = { sourceId: "source", projectId: "project", workspaceId: "workspace", workspacePath: "/project" };
const config: DebugConfiguration = { id: "node", name: "Node", adapter: "javascript", context,
  target: "node", request: "launch", program: "main.js" };

/** Uses a simulated adapter while exercising actual lifecycle and breakpoint mapping. */
function fixture(configuration = config) {
  const request = vi.fn(async () => ({}));
  const connection = { request } as unknown as DapConnection;
  const adapter: DebugAdapter = {
    onEvent: () => undefined, onError: () => undefined, onReady: () => undefined,
    configure: async () => undefined,
    start: vi.fn(async () => { adapter.onReady({ supportsConfigurationDoneRequest: true }); }),
    stop: vi.fn(async () => undefined), connection: () => connection,
    updateBreakpoints: async () => adapter.configure(connection, true)
  };
  const session = new DebugSession(configuration, () => undefined, adapter);
  return { session, adapter, request, connection };
}
describe("debug session", () => {
  test("rejects late variable responses after execution resumes", async () => {
    const { session, adapter, request } = fixture();
    await session.start({ entrypoint: "unused", executable: "unused" }, []);
    adapter.onEvent({ event: "stopped", body: { threadId: 1, reason: "breakpoint" } });
    let respond!: (value: object) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { respond = resolve; }));
    const pending = session.query({ kind: "variables", sessionId: session.snapshot.id,
      epoch: session.snapshot.epoch, reference: 7 });
    adapter.onEvent({ event: "continued" });
    respond({ variables: [{ name: "stale" }] });
    await expect(pending).rejects.toThrow("expired");
    await session.finish();
  });
  test("maps refused breakpoints and clears sources when users remove the last breakpoint", async () => {
    const { session, request } = fixture();
    await session.start({ entrypoint: "unused", executable: "unused" }, []);
    request.mockResolvedValueOnce({ breakpoints: [{ verified: false, message: "Source map missing" }] });
    await session.setBreakpoints([{ id: "bp", context, path: "main.ts", line: 3, enabled: true }]);
    expect(session.snapshot.breakpoints).toMatchObject([{ id: "bp", verified: false, message: "Source map missing" }]);
    request.mockResolvedValueOnce({ breakpoints: [] });
    await session.setBreakpoints([]);
    expect(request).toHaveBeenLastCalledWith("setBreakpoints", { source: { path: "/project/main.ts" }, breakpoints: [] });
    await session.finish();
  });
  test.each(["launch", "attach"] as const)("respects %s ownership during stop and ignores late events", async request => {
    const { session, adapter } = fixture({ ...config, request });
    await session.start({ entrypoint: "unused", executable: "unused" }, []);
    await session.finish();
    expect(adapter.stop).toHaveBeenCalledWith(request === "launch");
    adapter.onEvent({ event: "stopped", body: { threadId: 1 } });
    expect(session.snapshot.state).toBe("terminated");
    await session.finish();
    expect(adapter.stop).toHaveBeenCalledTimes(1);
  });
  test("cleans failed launches and preserves the diagnostic", async () => {
    const { session, adapter } = fixture();
    adapter.start = async () => { throw new Error("Cannot connect"); };
    await session.start({ entrypoint: "unused", executable: "unused" }, []);
    expect(session.snapshot).toMatchObject({ state: "failed", error: "Error: Cannot connect" });
    expect(adapter.stop).toHaveBeenCalledWith(true);
  });
});
