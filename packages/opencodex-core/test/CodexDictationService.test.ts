import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { CodexDictationService, resampleTo24k } from "../src/backend/dictation/CodexDictationService.js";
import { createDictationTranscript } from "../src/backend/dictation/codexDictationTranscript.js";

/** Models only Codex transport events, with no account or network dependency. */
function fixture() {
  const events = new EventEmitter();
  const subscribe = (event: string) => (listener: (...args: unknown[]) => void) => {
    events.on(event, listener);
    return { dispose: () => events.off(event, listener) };
  };
  const client = {
    start: vi.fn(), stop: vi.fn(), getCodexHome: vi.fn().mockResolvedValue("/isolated-home"),
    startThread: vi.fn().mockResolvedValue({ thread: { id: "voice-thread" } }),
    request: vi.fn(), rejectServerRequest: vi.fn(),
    onNotification: subscribe("notification"), onServerRequest: subscribe("request"),
    onError: subscribe("error"), onClose: subscribe("close")
  };
  const notify = (method: string, data: Record<string, unknown> = {}) => {
    events.emit("notification", { method, params: { threadId: "voice-thread", ...data } });
  };
  return { client, events, notify, typed: client as unknown as CodexAppServerClient };
}

describe("experimental Codex dictation", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("should propagate an asynchronous startup failure after the RPC acknowledgement", async () => {
    const { client, typed, notify } = fixture();
    client.request.mockImplementation(async (method) => {
      if (method === "thread/realtime/start") queueMicrotask(() => notify("thread/realtime/error", { message: "requires API key auth" }));
    });
    const service = new CodexDictationService(async () => typed);
    await expect(service.transcribe({
      sessionId: "voice-1", sourceId: "source", backend: "codex", audioBase64: "AAA=", language: "auto"
    })).rejects.toThrow("requires API key auth");
    expect(client.request).not.toHaveBeenCalledWith("thread/realtime/appendAudio", expect.anything());
    expect(client.startThread).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true, sandbox: "read-only" }));
    expect(client.stop).toHaveBeenCalled();
  });

  it("should wait for the final user transcript and ignore assistant text", async () => {
    const { typed, notify } = fixture();
    const transcript = createDictationTranscript(typed, "voice-thread");
    notify("thread/realtime/started");
    await transcript.started;
    notify("thread/realtime/transcript/done", { role: "assistant", text: "ignore" });
    notify("thread/realtime/transcript/done", { role: "user", text: "bonjour" });
    transcript.finishInput();
    const result = vi.fn();
    void transcript.result.then(result);
    notify("thread/realtime/transcript/delta", { role: "user", delta: "suite" });
    await vi.advanceTimersByTimeAsync(3000);
    expect(result).not.toHaveBeenCalled();
    notify("thread/realtime/transcript/done", { role: "user", text: "la suite" });
    await vi.advanceTimersByTimeAsync(2500);
    await expect(transcript.result).resolves.toBe("bonjour la suite");
    transcript.dispose();
  });

  it("should stop the isolated process if Codex starts an agent turn", async () => {
    const { client, typed, notify } = fixture();
    const transcript = createDictationTranscript(typed, "voice-thread");
    notify("turn/started");
    await expect(transcript.result).rejects.toThrow("agent turn");
    expect(client.stop).toHaveBeenCalled();
    transcript.dispose();
  });

  it("should reject tool requests instead of asking the user for permission", async () => {
    const { client, typed, events } = fixture();
    const transcript = createDictationTranscript(typed, "voice-thread");
    events.emit("request", { id: 12 });
    await expect(transcript.result).rejects.toThrow("requested an action");
    expect(client.rejectServerRequest).toHaveBeenCalledWith(12, "Tools are unavailable during dictation.");
    expect(client.stop).toHaveBeenCalled();
    transcript.dispose();
  });

  it("should not create a thread when cancelled during client startup", async () => {
    const { client, typed } = fixture();
    let ready!: () => void;
    client.start.mockReturnValue(new Promise<void>((resolve) => { ready = resolve; }));
    const service = new CodexDictationService(async () => typed);
    const pending = service.transcribe({
      sessionId: "voice-1", sourceId: "source", backend: "codex", audioBase64: "AAA=", language: "auto"
    });
    const rejected = expect(pending).rejects.toThrow("cancelled");
    await Promise.resolve();
    await service.cancel("voice-1");
    ready();
    await rejected;
    expect(client.startThread).not.toHaveBeenCalled();
  });

  it("should preserve a constant PCM signal and duration when adapting the sample rate", () => {
    const pcm = Buffer.alloc(32_000);
    for (let offset = 0; offset < pcm.length; offset += 2) pcm.writeInt16LE(1200, offset);
    const converted = resampleTo24k(pcm);
    expect(converted.length).toBe(48_000);
    expect(converted.readInt16LE(0)).toBe(1200);
    expect(converted.readInt16LE(converted.length - 2)).toBe(1200);
  });
});
