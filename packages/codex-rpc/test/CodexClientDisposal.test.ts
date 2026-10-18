import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexAppServerClient } from "../src/CodexAppServerClient";
import { stopCodexProcess } from "../src/stopCodexProcess";
import type { ProcessLike } from "../src/types";

/** An owned fake child with no real PID, ensuring shutdown tests can never target a host process. */
class OwnedProcess extends EventEmitter implements ProcessLike {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid = undefined;
  killed = false;
  /** Emits a confirmed exit when a termination signal is sent. */
  kill(): boolean {
    this.killed = true;
    this.emit("close", 0, null);
    return true;
  }
}

afterEach(() => { vi.useRealTimers(); });

describe("retired source connections", () => {
  it("should wait for stdin shutdown and prevent retained references from relaunching Codex", async () => {
    const child = new OwnedProcess();
    const factory = vi.fn(() => child);
    const client = new CodexAppServerClient({ processFactory: factory });
    child.stdin.on("data", (line: Buffer) => {
      const request = JSON.parse(String(line));
      if (request.method === "initialize") child.stdout.write(JSON.stringify({ id: request.id, result: {} }) + "\n");
    });
    await client.start();
    const disposed = client.dispose();
    let finished = false;
    void disposed.then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    child.emit("close", 0, null);
    await disposed;

    await expect(client.start()).rejects.toThrow("connection was stopped");
    await expect(client.request("thread/read", {})).rejects.toThrow("connection was stopped");
    await expect(client.getCodexHome()).rejects.toThrow("connection was stopped");
    expect(factory).toHaveBeenCalledOnce();
  });

  it("should escalate a stuck owned process after the graceful timeout", async () => {
    vi.useFakeTimers();
    const child = new OwnedProcess();
    const kill = vi.spyOn(child, "kill");
    const stopping = stopCodexProcess(child);
    expect(kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    await stopping;
    expect(kill).toHaveBeenCalledOnce();
    expect(kill).toHaveBeenCalledWith("SIGTERM");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("should report an unconfirmed shutdown rather than falsely declaring stopped", async () => {
    vi.useFakeTimers();
    const child = new OwnedProcess();
    vi.spyOn(child, "kill").mockReturnValue(true);
    const stopping = expect(stopCodexProcess(child)).rejects.toThrow("exit could not be confirmed");
    await vi.advanceTimersByTimeAsync(3_000);
    await stopping;
    expect(vi.getTimerCount()).toBe(0);
  });
});
