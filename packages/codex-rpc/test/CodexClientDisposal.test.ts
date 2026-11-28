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

describe("daemon-owned Codex sessions", () => {
  it("should wait for daemon readiness before sending an ordinary RPC", async () => {
    const child = new OwnedProcess();
    const launch = vi.fn(() => child);
    const client = new CodexAppServerClient({
      command: "synthetic-codex",
      clientInfo: { name: "OpenCodexUI", version: "fixture" },
      experimentalApi: false,
      rustCodexDaemonPath: "daemon",
      processFactory: launch,
      requestTimeoutMs: 1_000
    });
    const frames: Array<{ id: number; method: string }> = [];
    child.stdin.on("data", (line: Buffer) => {
      const frame = JSON.parse(String(line));
      frames.push(frame);
      if (frame.method === "thread/read") {
        writeResponse(child, frame.id, { result: { thread: { id: "t1" } } });
      }
    });
    child.stdin.once("finish", () => child.emit("close", 0, null));

    const thread = client.request("thread/read", { threadId: "t1" });
    const codexHome = client.getCodexHome();
    expect(frames).toEqual([{
      jsonrpc: "2.0", id: 1, method: "opencodex/session/open",
      params: {
        protocolVersion: 1,
        clientInfo: { name: "OpenCodexUI", version: "fixture" },
        experimentalApi: false
      }
    }]);
    writeResponse(child, frames[0]!.id, { result: { status: "ready", codexHome: "source-home" } });

    await expect(codexHome).resolves.toBe("source-home");
    await expect(thread).resolves.toEqual({ thread: { id: "t1" } });
    expect(frames.map(frame => frame.method)).toEqual(["opencodex/session/open", "thread/read"]);
    expect(launch).toHaveBeenCalledOnce();
    expect(launch).toHaveBeenCalledWith("daemon", [
      "--codex-stdio", "1000", "synthetic-codex", "app-server"
    ]);
    await client.dispose();
  });

  it("should close a rejected session and open a fresh one on retry", async () => {
    const rejected = new OwnedProcess();
    const replacement = new OwnedProcess();
    const launch = vi.fn().mockReturnValueOnce(rejected).mockReturnValueOnce(replacement);
    const client = new CodexAppServerClient({ rustCodexDaemonPath: "daemon", processFactory: launch });
    respondToOpen(rejected, { error: { code: -32042, message: "Initialization refused", data: { retry: true } } });
    respondToOpen(replacement, { result: { status: "ready", codexHome: "replacement-home" } });

    await expect(client.start()).rejects.toMatchObject({
      name: "JsonRpcError", code: -32042, message: "Initialization refused", data: { retry: true }
    });
    expect(rejected.stdin.writableEnded).toBe(true);
    await expect(client.getCodexHome()).resolves.toBe("replacement-home");
    expect(launch).toHaveBeenCalledTimes(2);
    await client.dispose();
  });

  it("should reject startup when the daemon connection is stopped before it is ready", async () => {
    const child = new OwnedProcess();
    child.stdin.once("finish", () => child.emit("close", 0, null));
    const client = new CodexAppServerClient({ rustCodexDaemonPath: "daemon", processFactory: () => child });

    const opening = expect(client.start()).rejects.toThrow("Codex app-server stopped");
    await client.stop();

    await opening;
    expect(child.stdin.writableEnded).toBe(true);
    expect(child.killed).toBe(false);
  });
});

/** Answers the open request and confirms exit once the client closes its input. */
function respondToOpen(child: OwnedProcess, response: Record<string, unknown>): void {
  child.stdin.once("data", (line: Buffer) => {
    const request = JSON.parse(String(line));
    expect(request.method).toBe("opencodex/session/open");
    writeResponse(child, request.id, response);
  });
  child.stdin.once("finish", () => child.emit("close", 0, null));
}

/** Delivers one synthetic reply through the same pipe read by the transport. */
function writeResponse(child: OwnedProcess, id: number, response: Record<string, unknown>): void {
  child.stdout.write(JSON.stringify({ id, ...response }) + "\n");
}
