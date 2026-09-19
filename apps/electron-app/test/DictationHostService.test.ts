import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DICTATION_SETTINGS, normalizeDictationSettings,
  type OpenCodexDictationInput, type OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import { DictationHostService, validateDictationAudio } from "../src/main/dictation/DictationHostService.js";

const input: OpenCodexDictationInput = {
  sessionId: "recording-1", sourceId: "source-1", backend: "codex", language: "auto", audioBase64: "AAA="
};
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

/** Builds the host boundary without loading models or starting Codex. */
async function fixture(enabled: boolean) {
  const directory = await mkdtemp(path.join(tmpdir(), "dictation-host-"));
  directories.push(directory);
  const codex = { transcribe: vi.fn().mockResolvedValue("bonjour"), cancel: vi.fn() };
  const settings = { dictation: { ...DEFAULT_DICTATION_SETTINGS, enabled, backend: "codex" } } as OpenCodexSettings;
  const service = new DictationHostService(directory, "unused-worker", () => settings, codex, vi.fn());
  return { service, codex, settings };
}

describe("dictation host boundary", () => {
  it("should default old or malformed preferences to disabled local dictation", () => {
    expect(normalizeDictationSettings()).toEqual(DEFAULT_DICTATION_SETTINGS);
    expect(normalizeDictationSettings({ modelId: "bad", backend: "bad", language: "bad" } as never))
      .toEqual(DEFAULT_DICTATION_SETTINGS);
  });

  it("should reject disabled dictation without contacting Codex", async () => {
    const { service, codex } = await fixture(false);
    await expect(service.handle({ type: "dictation.transcribe", input })).rejects.toThrow("disabled");
    expect(codex.transcribe).not.toHaveBeenCalled();
  });

  it("should route the enabled backend without falling back to another service", async () => {
    const { service, codex } = await fixture(true);
    codex.transcribe.mockRejectedValueOnce(new Error("requires API key auth"));
    await expect(service.handle({ type: "dictation.transcribe", input })).rejects.toThrow("requires API key auth");
    await expect(service.handle({ type: "dictation.transcribe", input })).resolves.toEqual({ text: "bonjour" });
  });

  it("should cancel before local inference if installation metadata is still loading", async () => {
    const { service, settings } = await fixture(true);
    settings.dictation!.backend = "local";
    let resolve!: (state: Awaited<ReturnType<typeof service.local.getState>>) => void;
    vi.spyOn(service.local, "getState").mockReturnValue(new Promise((done) => { resolve = done; }));
    const transcribe = vi.spyOn(service.local, "transcribe");
    const pending = service.handle({ type: "dictation.transcribe", input: { ...input, backend: "local" } });
    const rejected = expect(pending).rejects.toThrow("cancelled");
    await service.handle({ type: "dictation.cancel", sessionId: input.sessionId });
    resolve({ installedModelId: "whisper-base", downloadingModelId: null, progress: null, error: null });
    await rejected;
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("should reject malformed, odd-sized, and oversized audio payloads", () => {
    expect(() => validateDictationAudio(input)).not.toThrow();
    expect(() => validateDictationAudio({ ...input, audioBase64: "!!!=" })).toThrow("Invalid dictation");
    expect(() => validateDictationAudio({ ...input, audioBase64: "AA==" })).toThrow("Invalid PCM");
    expect(() => validateDictationAudio({ ...input, audioBase64: "A".repeat(5_120_004) })).toThrow("Invalid dictation");
    expect(() => validateDictationAudio({ ...input, sessionId: "install" })).toThrow("Invalid dictation");
  });
});
