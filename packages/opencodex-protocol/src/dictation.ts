/** Dictation inserts text into a draft; it never submits a conversation turn. */
export interface OpenCodexDictationSettings {
  enabled: boolean;
  backend: "local" | "codex";
  modelId: "whisper-tiny" | "whisper-base" | "whisper-small";
  language: string;
}

export const DEFAULT_DICTATION_SETTINGS: OpenCodexDictationSettings = {
  enabled: false, backend: "local", modelId: "whisper-base", language: "auto"
};

export const DICTATION_LANGUAGES = ["auto", "fr", "en", "de", "es", "it", "pt", "nl", "pl", "ru", "uk", "ar", "hi", "ja", "ko", "zh"] as const;
export const DICTATION_MAX_SECONDS = 120;
export const DICTATION_SAMPLE_RATE = 16_000;

/** Public catalogue of multilingual, quantized local models. Sizes include an allowance for tokenizers. */
export const DICTATION_MODELS = [
  { id: "whisper-tiny", label: "Whisper Tiny", downloadMegabytes: 45 },
  { id: "whisper-base", label: "Whisper Base", downloadMegabytes: 81 },
  { id: "whisper-small", label: "Whisper Small", downloadMegabytes: 253 }
] as const;

/** JSON-compatible audio payload: mono PCM16 little-endian at 16 kHz. */
export interface OpenCodexDictationInput {
  sessionId: string;
  backend: OpenCodexDictationSettings["backend"];
  sourceId: string | null;
  audioBase64: string;
  language: string;
}

/** Host-owned model download state, independent from the conversation source. */
export interface OpenCodexDictationModelState {
  installedModelId: OpenCodexDictationSettings["modelId"] | null;
  downloadingModelId: OpenCodexDictationSettings["modelId"] | null;
  progress: number | null;
  error: string | null;
}

/** Normalizes persisted preferences from older or manually edited settings files. */
export function normalizeDictationSettings(value?: Partial<OpenCodexDictationSettings>): OpenCodexDictationSettings {
  return {
    enabled: value?.enabled === true,
    backend: value?.backend === "codex" ? "codex" : "local",
    modelId: DICTATION_MODELS.find((model) => model.id === value?.modelId)?.id ?? "whisper-base",
    language: DICTATION_LANGUAGES.find((language) => language === value?.language) ?? "auto"
  };
}
