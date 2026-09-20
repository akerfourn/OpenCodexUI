import type { TranslationShape } from "../../translationShape.js";
import type { frDictation } from "../fr/dictation.js";

export const enDictation = {
  "dictation": {
    "title": "Voice dictation",
    "enabled": "Enable voice dictation",
    "backend": "Transcription backend",
    "local": "Local model — Transformers.js",
    "codex": "Codex — experimental",
    "codexWarning": "This mode sends your voice to OpenAI through the chat’s Codex source. It may be unavailable with your current sign-in or require an API key. There is no automatic fallback to a paid API. Dictation must not start an agent task.",
    "localDescription": "Transcription stays on this computer. After the initial download, it works offline. All available models are multilingual.",
    "model": "Local model",
    "singleModel": "Only one model is kept. Downloading another model removes the previous one; cancelling means it must be downloaded again.",
    "installed": "Installed model: {{model}}",
    "none": "none",
    "download": "Download model",
    "remove": "Remove model",
    "downloading": "Downloading and verifying model…",
    "cancel": "Cancel",
    "language": "Dictation language",
    "automatic": "Automatic detection",
    "start": "Dictate a message",
    "stop": "Stop and transcribe",
    "requesting": "Requesting microphone access…",
    "recording": "Recording (2 minutes maximum)",
    "recordingProgress": "Recording {{elapsed}} / {{limit}} — stop and transcribe",
    "transcribing": "Transcribing…",
    "failed": "Dictation could not finish. Your draft has been preserved.",
    "details": "Details"
  }
} satisfies TranslationShape<typeof frDictation>;
