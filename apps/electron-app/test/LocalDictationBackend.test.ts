import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDictationBackend } from "../src/main/dictation/LocalDictationBackend.js";

const workers = vi.hoisted(() => ({ instances: [] as Array<EventEmitter & { kill: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> }> }));
vi.mock("electron", () => ({
  utilityProcess: {
    fork: vi.fn(() => {
      const child = new EventEmitter() as EventEmitter & {
        kill: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn>;
      };
      child.kill = vi.fn(() => { child.emit("exit", 0); return true; });
      child.postMessage = vi.fn();
      workers.instances.push(child);
      return child;
    })
  }
}));
const directories: string[] = [];
const backends: LocalDictationBackend[] = [];

/** Uses temporary storage while replacing network/inference workers with controlled events. */
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "dictation-model-"));
  directories.push(directory);
  const backend = new LocalDictationBackend(directory, "fake-worker", vi.fn());
  backends.push(backend);
  await backend.getState();
  return { backend, directory };
}

describe("single-model local dictation", () => {
  beforeEach(() => { workers.instances = []; });
  afterEach(async () => {
    await Promise.all(backends.splice(0).map((backend) => backend.dispose()));
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  it("should replace the previous model and persist only a completed installation", async () => {
    const { backend, directory } = await fixture();
    const first = backend.install("whisper-tiny");
    await vi.waitFor(() => expect(workers.instances).toHaveLength(1));
    workers.instances[0]!.emit("message", { type: "done" });
    expect((await first).installedModelId).toBe("whisper-tiny");
    await writeFile(path.join(directory, "dictation/model/old-weight"), "old");
    const second = backend.install("whisper-base");
    await vi.waitFor(() => expect(workers.instances).toHaveLength(2));
    await expect(readFile(path.join(directory, "dictation/model/old-weight"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await backend.getState()).installedModelId).toBeNull();
    workers.instances[1]!.emit("message", { type: "done" });
    expect((await second).installedModelId).toBe("whisper-base");
    expect(JSON.parse(await readFile(path.join(directory, "dictation/installed.json"), "utf8")).modelId).toBe("whisper-base");
  });

  it("should remove partial files and metadata when a download is cancelled", async () => {
    const { backend, directory } = await fixture();
    const install = backend.install("whisper-small");
    await vi.waitFor(() => expect(workers.instances).toHaveLength(1));
    await writeFile(path.join(directory, "dictation/model/download.part"), "partial");
    await backend.cancel("install");
    expect(await install).toMatchObject({ installedModelId: null, downloadingModelId: null, error: null });
    await expect(readFile(path.join(directory, "dictation/model/download.part"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(directory, "dictation/installed.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(workers.instances[0]!.kill).toHaveBeenCalled();
  });

  it("should expose installation errors without accepting an incomplete model", async () => {
    const { backend } = await fixture();
    const install = backend.install("whisper-tiny");
    await vi.waitFor(() => expect(workers.instances).toHaveLength(1));
    workers.instances[0]!.emit("message", { type: "error", message: "checksum mismatch" });
    expect(await install).toMatchObject({ installedModelId: null, error: "checksum mismatch" });
  });

  it("should use fresh processes for installation, transcription, and retry after cancellation", async () => {
    const { backend } = await fixture();
    const install = backend.install("whisper-tiny");
    await vi.waitFor(() => expect(workers.instances).toHaveLength(1));
    workers.instances[0]!.emit("message", { type: "done" });
    await install;
    expect(workers.instances[0]!.kill).toHaveBeenCalled();

    const input = {
      sessionId: "recording-1", backend: "local" as const, sourceId: null,
      language: "en", audioBase64: "AAA="
    };
    const cancelled = backend.transcribe(input);
    const rejected = expect(cancelled).rejects.toThrow("Dictation worker stopped");
    await vi.waitFor(() => expect(workers.instances).toHaveLength(2));
    await backend.cancel(input.sessionId);
    await rejected;
    expect(workers.instances[1]!.kill).toHaveBeenCalled();

    const retry = backend.transcribe({ ...input, sessionId: "recording-2" });
    await vi.waitFor(() => expect(workers.instances).toHaveLength(3));
    expect(workers.instances[2]!.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      kind: "transcribe", modelId: "whisper-tiny", audioBase64: "AAA="
    }));
    workers.instances[2]!.emit("message", { type: "done", text: "bonjour" });
    await expect(retry).resolves.toBe("bonjour");
    expect(workers.instances[2]!.kill).toHaveBeenCalled();
  });

  it("should terminate a process that spawns after cancellation was requested", async () => {
    const { backend } = await fixture();
    const install = backend.install("whisper-tiny");
    await vi.waitFor(() => expect(workers.instances).toHaveLength(1));
    const child = workers.instances[0]!;
    child.kill.mockReturnValueOnce(false);
    const cancelled = backend.cancel("install");
    child.emit("spawn");
    await cancelled;
    expect((await install).installedModelId).toBeNull();
    expect(child.kill).toHaveBeenCalledTimes(2);
  });
});
