import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stopCodexProcess } from "../src/stopCodexProcess";
import type { ProcessLike } from "../src/types";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;

/** No OS process is created; the child and taskkill executable are both strict transport doubles. */
function windowsChild() {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    pid: 777, killed: false, kill: vi.fn(() => true)
  }) as unknown as ProcessLike & EventEmitter;
  const killer = new EventEmitter();
  vi.mocked(spawn).mockReturnValue(killer as ReturnType<typeof spawn>);
  return { child, killer };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(spawn).mockReset();
  Object.defineProperty(process, "platform", { value: "win32" });
});

afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  vi.useRealTimers();
});

describe("Windows owned instance shutdown", () => {
  it("should close gracefully without invoking taskkill when the process exits on EOF", async () => {
    const { child } = windowsChild();
    const stopped = stopCodexProcess(child);
    child.emit("close", 0, null);
    await stopped;
    expect(spawn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("should target only the owned PID and its descendants in a hidden process after the timeout", async () => {
    const { child, killer } = windowsChild();
    const stopped = stopCodexProcess(child);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(spawn).toHaveBeenCalledWith("taskkill.exe", ["/PID", "777", "/T", "/F"], {
      windowsHide: true, stdio: "ignore", timeout: 2_000
    });
    child.emit("close", 1, null);
    killer.emit("close", 0);
    await stopped;
    expect(child.kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("should propagate a refused tree termination instead of claiming a successful stop", async () => {
    const { child, killer } = windowsChild();
    const rejected = expect(stopCodexProcess(child)).rejects.toThrow("Unable to terminate the owned Codex process");
    await vi.advanceTimersByTimeAsync(1_000);
    killer.emit("close", 5);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});
