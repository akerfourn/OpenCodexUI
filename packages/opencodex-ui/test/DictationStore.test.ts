import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_DICTATION_SETTINGS, type OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../src/stores/RootStore";
import { DictationStore } from "../src/stores/app/DictationStore";
import { encodePcm16 } from "../src/dictation/AudioRecording";

const recording = vi.hoisted(() => ({ finish: vi.fn(), cancel: vi.fn() }));
vi.mock("../src/dictation/AudioRecording", async (importOriginal) => ({
  ...await importOriginal<object>(),
  AudioRecording: vi.fn(() => recording)
}));

/** Exposes a controlled asynchronous boundary without timers. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Supplies only the host and microphone effects used by the store. */
function fixture() {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  const microphone = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: microphone } });
  const request = vi.fn(async (request: OpenCodexRequest): Promise<unknown> => {
    if (request.type === "dictation.models.state") return { installedModelId: "whisper-base" };
    if (request.type === "dictation.transcribe") return { text: "bonjour" };
    return undefined;
  });
  const root = { settings: { dictation: { ...DEFAULT_DICTATION_SETTINGS, enabled: true } }, request };
  return { store: new DictationStore(root as unknown as RootStore), request, microphone, stop, stream };
}

describe("dictation draft lifecycle", () => {
  beforeEach(() => { vi.clearAllMocks(); recording.finish.mockResolvedValue("AAA="); });
  afterEach(() => vi.unstubAllGlobals());

  it("should insert recognized text only after transcription succeeds", async () => {
    const { store } = fixture();
    const insert = vi.fn();
    await store.start("source", insert);
    expect(store.status).toBe("recording");
    expect(insert).not.toHaveBeenCalled();
    await store.finish();
    expect(insert).toHaveBeenCalledWith("bonjour");
    expect(store.busy).toBe(false);
  });

  it("should leave the draft untouched when transcription fails", async () => {
    const { store, request } = fixture();
    const insert = vi.fn();
    await store.start("source", insert);
    request.mockRejectedValueOnce(new Error("backend unavailable"));
    await store.finish();
    expect(insert).not.toHaveBeenCalled();
    expect(store.error).toBe("backend unavailable");
    expect(store.busy).toBe(false);
  });

  it("should ignore a transcript arriving after navigation cancels the recording", async () => {
    const { store, request } = fixture();
    const result = deferred<{ text: string }>();
    const insert = vi.fn();
    await store.start("source", insert);
    request.mockImplementation(async (request) => request.type === "dictation.transcribe" ? result.promise : undefined);
    const finished = store.finish();
    await Promise.resolve();
    expect(store.status).toBe("transcribing");
    store.cancel();
    result.resolve({ text: "late result" });
    await finished;
    expect(insert).not.toHaveBeenCalled();
    expect(store.busy).toBe(false);
    expect(recording.cancel).toHaveBeenCalled();
  });

  it("should release microphone access granted after cancellation", async () => {
    const { store, microphone, stream, stop } = fixture();
    const permission = deferred<MediaStream>();
    microphone.mockReturnValue(permission.promise);
    const started = store.start("source", vi.fn());
    await Promise.resolve();
    expect(microphone).toHaveBeenCalled();
    store.cancel();
    permission.resolve(stream);
    await started;
    expect(stop).toHaveBeenCalled();
    expect(store.status).toBe("idle");
  });

  it("should refuse recording when the selected model is absent", async () => {
    const { store, request, microphone } = fixture();
    request.mockResolvedValueOnce({ installedModelId: null });
    await store.start("source", vi.fn());
    expect(microphone).not.toHaveBeenCalled();
    expect(store.error).toContain("Download the selected model");
  });

  it("should encode clipped mono samples as signed little-endian PCM16", () => {
    const bytes = Buffer.from(encodePcm16(new Float32Array([-2, -1, 0, 1, 2])), "base64");
    expect(Array.from({ length: 5 }, (_, index) => bytes.readInt16LE(index * 2)))
      .toEqual([-32768, -32768, 0, 32767, 32767]);
  });
});
