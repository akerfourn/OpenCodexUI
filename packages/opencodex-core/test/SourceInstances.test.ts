import { describe, expect, it, vi } from "vitest";
import { SourceInstancesService } from "../src/backend/sources/SourceInstancesService";
import { instancePool, instanceSource } from "./sourceInstances.fixture";

describe("source-owned instances", () => {
  it("should allow ordinary shutdown while a background quota read is still pending", async () => {
    const { pool } = instancePool();
    const client = await pool.ensureClient("a");
    const quota = expect(client.request("account/rateLimits/read", {})).rejects.toThrow("stopped");
    expect(pool.readState("a").isActive).toBe(false);
    await pool.stopClient("a");
    await quota;
    expect(pool.readState("a").phase).toBe("stopped");
  });

  it("should keep command execution protected even when no chat is active", async () => {
    const { pool } = instancePool();
    const client = await pool.ensureClient("a");
    const command = expect(client.request("command/exec", { command: ["build"] })).rejects.toThrow("stopped");
    expect(pool.readState("a").isActive).toBe(true);
    expect(pool.readState("a").activity?.requestMethods).toEqual(["command/exec"]);
    await expect(pool.stopClient("a")).rejects.toThrow("SOURCE_BUSY");
    await pool.stopClient("a", true);
    await command;
  });

  it("should publish updated reasons while busy and keep returned snapshots detached from pool state", async () => {
    const { pool, children, emit } = instancePool();
    await pool.ensureClient("a");
    const command = expect(pool.getClient("a")!.request("command/exec", {})).rejects.toThrow("stopped");
    children[0]!.notification("turn/started", { threadId: "thread", turn: { id: "turn" } });
    const snapshot = pool.readState("a");
    expect(snapshot.activity).toMatchObject({ requestMethods: ["command/exec"], turnCount: 1 });
    snapshot.activity!.requestMethods.push("outside-mutation");
    expect(pool.readState("a").activity?.requestMethods).toEqual(["command/exec"]);
    const changes = emit.mock.calls.map(([event]) => event).filter(event => event.type === "sourceInstances.changed");
    expect(changes.at(-1).snapshot).toMatchObject({ isActive: true, activity: { turnCount: 1 } });
    await pool.stopClient("a", true);
    await command;
  });

  it("should list stopped sources without launching or detecting Codex", async () => {
    const { pool, children } = instancePool();
    const resolveRequestedSource = vi.fn();
    const service = new SourceInstancesService({ resolveRequestedSource }, pool,
      { listSources: async () => [instanceSource("a"), instanceSource("b")] });
    expect(await service.list()).toEqual(["a", "b"].map(sourceId => ({ sourceId, phase: "stopped",
      isActive: false, manuallyStopped: false, error: null })));
    expect(children).toHaveLength(0);
    expect(resolveRequestedSource).not.toHaveBeenCalled();
  });

  it("should share initialization between concurrent requests", async () => {
    const { pool, children } = instancePool(false);
    const first = pool.ensureClient("a");
    const second = pool.ensureClient("a");
    await Promise.resolve();
    expect(children).toHaveLength(1);
    expect(pool.readState("a").phase).toBe("starting");
    children[0]!.ready();
    expect(await first).toBe(await second);
    expect(pool.readState("a").phase).toBe("ready");
    await pool.dispose();
  });

  it("should refuse busy stop and restart unless force was explicitly requested", async () => {
    const { pool, children } = instancePool();
    await pool.ensureClient("a");
    await pool.ensureClient("b");
    children[0]!.notification("turn/started", { threadId: "thread", turn: { id: "turn" } });
    expect(pool.readState("a").isActive).toBe(true);
    await expect(pool.stopClient("a")).rejects.toThrow("SOURCE_BUSY");
    await expect(pool.restartClient("a")).rejects.toThrow("SOURCE_BUSY");
    expect(children[0]!.stdin.writableEnded).toBe(false);

    await pool.restartClient("a", true);
    expect(children[0]!.stdin.writableEnded).toBe(true);
    expect(children[1]!.stdin.writableEnded).toBe(false);
    expect(children).toHaveLength(3);
    expect(pool.readState("a")).toMatchObject({ phase: "ready", isActive: false });
    expect(pool.readState("b").phase).toBe("ready");
    await pool.dispose();
  });

  it("should latch manual stops against background reads and allow explicit startup", async () => {
    const { pool, children } = instancePool();
    const oldClient = await pool.ensureClient("a");
    await pool.stopClient("a");
    expect(pool.readState("a")).toMatchObject({ phase: "stopped", manuallyStopped: true });
    await expect(pool.ensureClient("a")).rejects.toThrow("SOURCE_STOPPED");
    await expect(oldClient.request("thread/read", {})).rejects.toThrow("connection was stopped");
    expect(children).toHaveLength(1);
    await pool.startClient("a");
    expect(pool.readState("a")).toMatchObject({ phase: "ready", manuallyStopped: false });
    expect(children).toHaveLength(2);
    await pool.dispose();
  });

  it("should allow force to cancel a hung initialization and start a fresh instance", async () => {
    const { pool, children } = instancePool(false);
    const starting = expect(pool.ensureClient("a")).rejects.toThrow("stopped");
    await Promise.resolve();
    await expect(pool.stopClient("a")).rejects.toThrow("SOURCE_BUSY");
    await pool.stopClient("a", true);
    await starting;
    expect(pool.readState("a")).toMatchObject({ phase: "stopped", isActive: false });
    const next = pool.startClient("a");
    await Promise.resolve();
    children[1]!.ready();
    await next;
    expect(pool.readState("a").phase).toBe("ready");
    await pool.dispose();
  });

  it("should ignore late notifications and approvals from a retired process", async () => {
    const { pool, children, emit, closed } = instancePool();
    await pool.ensureClient("a");
    await pool.restartClient("a");
    const calls = emit.mock.calls.length;
    children[0]!.notification("turn/started", { threadId: "old", turn: { id: "old" } });
    children[0]!.emit("close", 1, null);
    expect(pool.readState("a")).toMatchObject({ phase: "ready", isActive: false });
    expect(emit.mock.calls).toHaveLength(calls);
    expect(closed).toHaveBeenCalledOnce();
    await pool.dispose();
  });

  it("should publish a source-specific error after unexpected process exit", async () => {
    const { pool, children, closed } = instancePool();
    await pool.ensureClient("a");
    children[0]!.emit("close", 1, null);
    expect(pool.getClient("a")).toBeUndefined();
    expect(pool.readState("a")).toMatchObject({ phase: "error", isActive: false,
      error: "Codex app-server exited unexpectedly." });
    expect(closed).toHaveBeenCalledWith("a");
    await pool.dispose();
  });

  it("should retain ownership when shutdown fails and prevent launching a duplicate process", async () => {
    const { pool, children, clients } = instancePool();
    await pool.ensureClient("a");
    const failed = vi.spyOn(clients[0]!, "dispose").mockRejectedValueOnce(new Error("Exit not confirmed"));
    await expect(pool.stopClient("a")).rejects.toThrow("Exit not confirmed");
    expect(pool.getClient("a")).toBe(clients[0]);
    expect(pool.readState("a")).toMatchObject({ phase: "error", error: "Exit not confirmed" });
    await expect(pool.ensureClient("a")).rejects.toThrow("SOURCE_STOPPED");
    expect(children).toHaveLength(1);
    failed.mockRestore();
    await pool.restartClient("a", true);
    expect(children).toHaveLength(2);
    await pool.dispose();
  });

  it("should clean up a failed initialization before allowing a replacement", async () => {
    const { pool, children } = instancePool(false);
    const failed = expect(pool.ensureClient("a")).rejects.toThrow("Invalid configuration");
    await Promise.resolve();
    children[0]!.stdout.write(JSON.stringify({ id: children[0]!.initialization,
      error: { message: "Invalid configuration", code: -32000 } }) + "\n");
    await failed;
    expect(children[0]!.stdin.writableEnded).toBe(true);
    expect(pool.getClient("a")).toBeUndefined();
    expect(pool.readState("a")).toMatchObject({ phase: "error", error: "Invalid configuration" });
    await pool.dispose();
  });

  it("should validate source identity and a strict force boolean before controlling processes", async () => {
    const { pool, children } = instancePool();
    const service = new SourceInstancesService({ resolveRequestedSource: async () => instanceSource("a") }, pool, null);
    await expect(service.execute({ type: "sourceInstances.start", sourceId: "b" })).rejects.toThrow("unavailable");
    await expect(service.execute({ type: "sourceInstances.start", sourceId: "" })).rejects.toThrow("explicit");
    await expect(service.execute({ type: "sourceInstances.stop", sourceId: "a", force: "true" } as never))
      .rejects.toThrow("explicit confirmation");
    expect(children).toHaveLength(0);
    await expect(service.execute({ type: "sourceInstances.start", sourceId: "a" })).resolves.toMatchObject({ phase: "ready" });
    await pool.dispose();
  });
});
