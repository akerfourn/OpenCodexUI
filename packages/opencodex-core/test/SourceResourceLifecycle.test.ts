import type { ProcessFactory } from "@open-codex-ui/codex-rpc";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSourceResourceProcessFactory } from "../src/backend/sources/resources/sourceResourceProcess";
import { instancePool, instanceSource } from "./sourceInstances.fixture";

vi.mock("../src/backend/sources/resources/sourceResourceProcess", () => ({ createSourceResourceProcessFactory: vi.fn() }));

/** Adds an opt-in policy without replacing source resolution or pool lifecycle logic. */
function limitedSource(id: string) {
  const source = instanceSource(id);
  if (source.kind === "local") source.settings.resources = { priority: "low", cpuLimitPercent: 50 };
  return source;
}

describe("source startup during resource discovery", () => {
  beforeEach(() => { vi.mocked(createSourceResourceProcessFactory).mockReset(); });

  it("should cancel a pending capability probe without allowing a late app-server launch", async () => {
    let finish!: (factory: ProcessFactory | undefined) => void;
    vi.mocked(createSourceResourceProcessFactory).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { pool, children } = instancePool(true, limitedSource);
    const starting = expect(pool.ensureClient("a")).rejects.toThrow("interrupted");
    await Promise.resolve();
    expect(pool.readState("a").phase).toBe("starting");

    await pool.stopClient("a", true);
    finish(undefined);
    await starting;

    expect(children).toHaveLength(0);
    expect(pool.readState("a")).toMatchObject({ phase: "stopped", manuallyStopped: true });
    await pool.startClient("a");
    expect(children).toHaveLength(1);
    await pool.dispose();
  });

  it("should surface unenforceable policies before creating a client and never fall back to an unrestricted launch", async () => {
    vi.mocked(createSourceResourceProcessFactory).mockRejectedValueOnce(new Error("CPU limits unavailable"));
    const { pool, children } = instancePool(true, limitedSource);
    await expect(pool.ensureClient("a")).rejects.toThrow("CPU limits unavailable");
    expect(children).toHaveLength(0);
    expect(pool.readState("a")).toMatchObject({ phase: "error", error: "CPU limits unavailable" });
    await pool.dispose();
  });
});
