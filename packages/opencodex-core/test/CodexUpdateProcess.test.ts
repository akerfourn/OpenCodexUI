import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCodexUpdateProcess } from "../src/backend/sources/codexUpdateProcess";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

/** Strict process double with no host PID and no executable or filesystem side effects. */
function updateProcess() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true)
  });
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  return child;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("Codex update process transport", () => {
  it("should preserve UTF-8 split across chunks and never open a Windows terminal", async () => {
    const child = updateProcess();
    const pending = runCodexUpdateProcess({ command: "wsl.exe", args: ["--exec", "codex", "update"], shell: false }, 1000);
    const text = Buffer.from("Mise à jour terminée", "utf8");
    child.stdout.write(text.subarray(0, 6));
    child.stdout.write(text.subarray(6));
    child.emit("close", 0);
    await expect(pending).resolves.toMatchObject({ exitCode: 0, stdout: "Mise à jour terminée" });
    expect(spawn).toHaveBeenCalledWith("wsl.exe", ["--exec", "codex", "update"], {
      shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("should decode native WSL startup errors emitted as UTF-16LE", async () => {
    const child = updateProcess();
    const pending = runCodexUpdateProcess({ command: "wsl.exe", args: [], shell: false }, 1000);
    child.stderr.write(Buffer.from("Accès refusé", "utf16le"));
    child.emit("close", 1);
    await expect(pending).resolves.toMatchObject({ exitCode: 1, stderr: "Accès refusé" });
  });

  it("should bound captured output without interrupting an otherwise successful update", async () => {
    const child = updateProcess();
    const pending = runCodexUpdateProcess({ command: "codex", args: [], shell: false }, 1000);
    child.stdout.write(Buffer.alloc(1024 * 1024, "x"));
    child.emit("close", 0);
    const result = await pending;
    expect(result.stdout.length).toBeLessThan(513 * 1024);
    expect(result.stdout).toContain("[output truncated]");
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("should time out with an explicit failure and terminate only its owned process", async () => {
    const child = updateProcess();
    const pending = expect(runCodexUpdateProcess({ command: "wsl.exe", args: [], shell: false }, 1000))
      .rejects.toThrow("Timed out while running wsl.exe");
    await vi.advanceTimersByTimeAsync(1000);
    await pending;
    expect(child.kill).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
