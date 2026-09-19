import {
  DICTATION_MAX_SECONDS, DICTATION_SAMPLE_RATE, normalizeDictationSettings,
  type OpenCodexDictationInput, type OpenCodexDictationModelState, type OpenCodexRequest,
  type OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import type { DictationBackend } from "./DictationBackend.js";
import { LocalDictationBackend } from "./LocalDictationBackend.js";

/** Routes dictation independently of chat turns, with an extensible backend boundary. */
export class DictationHostService {
  /** Host-local model management and worker lifecycle. */
  readonly local: LocalDictationBackend;
  /** Adapters share the same recording and cancellation contract. */
  private readonly backends: Record<"local" | "codex", DictationBackend>;
  /** Covers cancellation during validation, before an adapter starts work. */
  private active: { id: string; cancelled: boolean } | null = null;

  /** Wires host-local models and the source-aware Codex adapter. */
  constructor(
    userDataPath: string,
    workerPath: string,
    private readonly settings: () => OpenCodexSettings,
    codex: DictationBackend,
    emit: (state: OpenCodexDictationModelState) => void
  ) {
    this.local = new LocalDictationBackend(userDataPath, workerPath, emit);
    this.backends = { local: this.local, codex };
  }

  /** Handles only the host's dictation requests; audio never enters application logs. */
  async handle(request: OpenCodexRequest): Promise<unknown> {
    switch (request.type) {
      case "dictation.models.state": return this.local.getState();
      case "dictation.models.install": return this.local.install(request.modelId);
      case "dictation.models.remove": return this.local.remove();
      case "dictation.models.cancel": await this.local.cancel("install"); return;
      case "dictation.cancel":
        if (this.active?.id === request.sessionId) this.active.cancelled = true;
        await Promise.all(Object.values(this.backends).map((backend) => backend.cancel(request.sessionId)));
        return;
      case "dictation.transcribe": {
        validateDictationAudio(request.input);
        const settings = normalizeDictationSettings(this.settings().dictation);
        if (!settings.enabled || settings.backend !== request.input.backend) throw new Error("Dictation is disabled or its backend changed.");
        if (this.active !== null) throw new Error("Dictation is busy.");
        const operation = { id: request.input.sessionId, cancelled: false };
        this.active = operation;
        try {
          if (request.input.backend === "local") {
            const state = await this.local.getState();
            if (state.installedModelId !== settings.modelId) throw new Error("Download the selected dictation model first.");
          }
          if (operation.cancelled) throw new Error("Dictation cancelled.");
          return { text: await this.backends[request.input.backend].transcribe(request.input) };
        } finally {
          this.active = null;
        }
      }
      default: throw new Error("Unsupported dictation request.");
    }
  }
}

/** Rejects malformed, oversized, or non-PCM recording payloads before starting workers. */
export function validateDictationAudio(input: OpenCodexDictationInput): void {
  if (input === null || typeof input !== "object" ||
      typeof input.sessionId !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(input.sessionId) ||
      input.sessionId === "install" || input.sessionId === "remove" ||
      !["local", "codex"].includes(input.backend) ||
      (input.sourceId !== null && typeof input.sourceId !== "string") ||
      typeof input.audioBase64 !== "string" || input.audioBase64.length === 0 ||
      input.audioBase64.length > Math.ceil(DICTATION_MAX_SECONDS * DICTATION_SAMPLE_RATE * 2 / 3) * 4 ||
      input.audioBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(input.audioBase64) ||
      normalizeDictationSettings({ language: input.language }).language !== input.language) {
    throw new Error("Invalid dictation recording.");
  }
  const bytes = Buffer.from(input.audioBase64, "base64");
  if (bytes.length % 2 !== 0 || bytes.length < 2) throw new Error("Invalid PCM audio.");
}
