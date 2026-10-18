import { describe, expect, it, vi } from "vitest";
import { instancePool } from "./sourceInstances.fixture";

describe("source update lifecycle", () => {
  it("should keep a manually stopped source suspended after its update", async () => {
    const { pool, children } = instancePool();
    await pool.ensureClient("a");
    await pool.stopClient("a");
    await pool.runSourceUpdate("a", async () => {
      expect(pool.readState("a").phase).toBe("updating");
    });
    expect(pool.readState("a")).toMatchObject({ phase: "stopped", manuallyStopped: true });
    expect(children).toHaveLength(1);
    await expect(pool.ensureClient("a")).rejects.toThrow("SOURCE_STOPPED");
    await pool.dispose();
  });

  it("should not create an app-server just to update an unused source", async () => {
    const { pool, children } = instancePool();
    await expect(pool.runSourceUpdate("a", async () => "updated")).resolves.toBe("updated");
    expect(children).toHaveLength(0);
    expect(pool.readState("a").phase).toBe("stopped");
    await pool.dispose();
  });

  it("should wait for exit, block reconnection and lifecycle races, then resume only the source that was running", async () => {
    const { pool, children } = instancePool();
    const oldClient = await pool.ensureClient("a");
    const otherClient = await pool.ensureClient("b");
    let finish!: () => void;
    let entered!: () => void;
    const enteredUpdate = new Promise<void>(resolve => { entered = resolve; });
    const updating = pool.runSourceUpdate("a", async () => {
      entered();
      await new Promise<void>(resolve => { finish = resolve; });
      return "updated";
    });
    await enteredUpdate;
    expect(children[0]!.stdin.writableEnded).toBe(true);
    expect(children[1]!.stdin.writableEnded).toBe(false);
    expect(pool.readState("a").phase).toBe("updating");
    await expect(pool.ensureClient("a")).rejects.toThrow("SOURCE_UPDATING");
    await expect(pool.startClient("a")).rejects.toThrow("SOURCE_UPDATING");
    await expect(pool.stopClient("a", true)).rejects.toThrow("SOURCE_UPDATING");
    await expect(pool.restartClient("a", true)).rejects.toThrow("SOURCE_UPDATING");
    await expect(pool.runSourceUpdate("a", async () => undefined)).rejects.toThrow("SOURCE_UPDATING");
    finish();
    await expect(updating).resolves.toBe("updated");
    expect(pool.readState("a")).toMatchObject({ phase: "ready", isActive: false });
    expect(pool.getClient("a")).not.toBe(oldClient);
    expect(pool.getClient("b")).toBe(otherClient);
    expect(children).toHaveLength(3);
    await pool.dispose();
  });

  it("should refuse an active source before executing the updater", async () => {
    const { pool, children } = instancePool();
    await pool.ensureClient("a");
    children[0]!.notification("turn/started", { threadId: "thread", turn: { id: "turn" } });
    const update = vi.fn(async () => undefined);
    await expect(pool.runSourceUpdate("a", update)).rejects.toThrow("SOURCE_BUSY");
    expect(update).not.toHaveBeenCalled();
    expect(children[0]!.stdin.writableEnded).toBe(false);
    await pool.dispose();
  });

  it("should restore the previous running state after an updater failure", async () => {
    const { pool, children } = instancePool();
    await pool.ensureClient("a");
    await expect(pool.runSourceUpdate("a", async () => { throw new Error("Download refused"); }))
      .rejects.toThrow("Download refused");
    expect(pool.readState("a").phase).toBe("ready");
    expect(children).toHaveLength(2);
    await pool.dispose();
  });

  it("should not run an updater when process shutdown cannot be confirmed", async () => {
    const { pool, clients } = instancePool();
    await pool.ensureClient("a");
    const dispose = vi.spyOn(clients[0]!, "dispose").mockRejectedValueOnce(new Error("Exit not confirmed"));
    const update = vi.fn(async () => undefined);
    await expect(pool.runSourceUpdate("a", update)).rejects.toThrow("Exit not confirmed");
    expect(update).not.toHaveBeenCalled();
    expect(pool.readState("a").phase).toBe("error");
    dispose.mockRestore();
    await pool.dispose();
  });
});
