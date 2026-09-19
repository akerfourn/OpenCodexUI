import type { OpenCodexDictationInput } from "@open-codex-ui/opencodex-protocol";

/** A backend produces draft text and owns cancellation of its current transcription. */
export interface DictationBackend {
  transcribe(input: OpenCodexDictationInput): Promise<string>;
  cancel(sessionId: string): Promise<void>;
}
