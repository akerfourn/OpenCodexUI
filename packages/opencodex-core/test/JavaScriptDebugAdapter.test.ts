import { describe, test, expect, vi } from "vitest";

const harness = vi.hoisted(() => ({ connections: [] as unknown[], stop: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  mkdtemp: async () => "/temporary/debug-profile", rm: async () => undefined,
  stat: async () => ({ isFile: () => true })
}));
vi.mock("../src/backend/debug/DebugAdapterProcess.js", () => ({
  DebugAdapterProcess: class {
    onExit = () => undefined;
    async start() { return 1234; }
    async stop() { harness.stop(); }
  }
}));
vi.mock("../src/backend/debug/DapConnection.js", () => ({
  DapConnection: { connect: async () => harness.connections.shift() }
}));

import { JavaScriptDebugAdapter } from "../src/backend/debug/JavaScriptDebugAdapter.js";
import type { DapConnection, DapEvent } from "../src/backend/debug/DapConnection.js";

/** Simulates DAP launch waiting for configurationDone, including the required reverse target request. */
function connection(target: boolean) {
  let complete!: () => void;
  const channel = {
    onEvent: (_event: DapEvent) => undefined,
    onClose: (_error: Error) => undefined,
    onRequest: async (_command: string, _args: object) => ({}),
    close: vi.fn(),
    request: vi.fn(async (command: string) => {
      if (command === "initialize") {
        queueMicrotask(() => channel.onEvent({ event: "initialized" }));
        return { supportsConfigurationDoneRequest: true };
      }
      if (command === "launch" || command === "attach") {
        if (!target) queueMicrotask(() => void channel.onRequest("startDebugging", {
          request: "launch", configuration: { type: "pwa-node", __pendingTargetId: "target-one" }
        }));
        await new Promise<void>(resolve => { complete = resolve; });
      }
      if (command === "configurationDone") complete();
      return {};
    })
  };
  return channel;
}

describe("standalone JavaScript adapter handshake", () => {
  test("configures both channels before launch resolves and disconnects both", async () => {
    const root = connection(false);
    const target = connection(true);
    harness.connections = [root, target];
    harness.stop.mockClear();
    const adapter = new JavaScriptDebugAdapter();
    let ready!: () => void;
    const completed = new Promise<void>(resolve => { ready = resolve; });
    adapter.onReady = ready;
    adapter.configure = async channel => { await channel.request("setBreakpoints", { source: { path: "/project/main.js" }, breakpoints: [{ line: 2 }] }); };
    await adapter.start({ id: "one", name: "Node", adapter: "javascript", request: "launch", target: "node",
      program: "main.js", context: { sourceId: "local", projectId: "project", workspaceId: "main", workspacePath: "/project" } },
    { executable: "node", entrypoint: "/adapter" });
    await completed;
    expect(root.request.mock.calls.map(call => call[0])).toEqual(["initialize", "launch", "setBreakpoints", "configurationDone"]);
    expect(target.request.mock.calls.map(call => call[0])).toEqual(["initialize", "launch", "setBreakpoints", "configurationDone"]);
    expect(adapter.connection()).toBe(target as unknown as DapConnection);
    await expect(root.onRequest("startDebugging", { request: "launch", configuration: { __pendingTargetId: "second" } })).rejects.toThrow("Only one debug target");
    await adapter.stop(false);
    expect(target.request).toHaveBeenLastCalledWith("disconnect", { terminateDebuggee: false, restart: false }, 1800);
    expect(root.close).toHaveBeenCalledOnce();
    expect(target.close).toHaveBeenCalledOnce();
    expect(harness.stop).toHaveBeenCalledOnce();
  });
  test.each(["launch", "attach"] as const)("signals only owned local targets after failed %s disconnect", async mode => {
    const root = connection(false);
    const target = connection(true);
    harness.connections = [root, target];
    const adapter = new JavaScriptDebugAdapter();
    let ready!: () => void;
    const completed = new Promise<void>(resolve => { ready = resolve; });
    adapter.onReady = ready;
    await adapter.start({ id: "one", name: "Node", adapter: "javascript", request: mode, target: "node",
      program: "main.js", port: 9229,
      context: { sourceId: "local", projectId: "project", workspaceId: "main", workspacePath: "/project" } },
    { executable: "node", entrypoint: "/adapter" });
    await completed;
    target.onEvent({ event: "process", body: { isLocalProcess: true, systemProcessId: 42424 } });
    target.request.mockRejectedValueOnce(new Error("Connection lost"));
    const kill = vi.spyOn(process, "kill").mockReturnValue(true);
    try {
      await adapter.stop(mode === "launch");
      if (mode === "launch") expect(kill).toHaveBeenCalledWith(42424, "SIGKILL");
      else expect(kill).not.toHaveBeenCalled();
    } finally { kill.mockRestore(); }
  });

});
