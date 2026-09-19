# Voice dictation

Dictation is disabled by default. Its settings select a backend independently
from the conversation model. Recording is limited to two minutes. Recognized
text is appended to the draft, without submitting a turn or replacing selected
text. Cancellation and navigation invalidate pending results.

## Boundaries

- `opencodex-protocol` defines settings, model state, and transport DTOs.
- `opencodex-ui` captures microphone audio and owns the recording lifecycle.
- Electron's `DictationHostService` validates and routes requests through the
  `DictationBackend` interface (`transcribe` and `cancel`).
- `opencodex-core` owns the experimental Codex app-server adapter.

Audio crosses IPC as base64-encoded mono PCM16 little-endian at 16 kHz. These
requests bypass the regular core request router. Audio is not written to disk
or application logs. The UI keeps the existing draft when a backend fails.

## Local inference

Transformers.js runs in a dedicated Electron utility process, outside the
renderer and Electron's main event loop. Each operation gets a fresh process:
ONNX Runtime's native binding cannot reliably reload in successive Node worker
threads within the same process. This also isolates cancellation and crashes.
ONNX Runtime uses CPU inference with at most
four compute threads. Native ONNX dependencies must remain unpacked in Electron
builds. The worker is built separately for development and release builds.
Signed macOS builds include a microphone usage description and the
[audio-input entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input)
for the application and its helpers.

The fixed catalogue offers multilingual, quantized Whisper Tiny, Base, and
Small. Installation is explicit, under `<userData>/dictation/model`. A new
download removes the previous model first. Failed or cancelled downloads leave
no usable installation. A completion marker is written only after model
loading succeeds.

Model repository revisions and weight SHA-256 hashes are pinned in
`localModels.ts`. Update both deliberately when changing the catalogue.
Transcription disables remote model access and additional model caches. It
therefore works offline after installation. A worker is released after each
operation; models are reloaded for each recording to avoid retaining their
memory while dictation is idle.

## Experimental Codex adapter

Each recording uses a disposable app-server process for the conversation's
explicit source. The adapter creates an ephemeral thread, requests the v2
WebSocket transcription mode, and appends 24 kHz audio. It waits for the
`thread/realtime/started` notification, not just the request acknowledgement.
Only finalized user transcripts are accepted. Unexpected agent turns or tool
requests stop the isolated session.

This mode depends on the installed Codex version and its authentication.
In particular, Codex 0.155.1 rejected transcription startup with simulated
ChatGPT authentication, requiring API-key authentication. This is not proof of
availability for a real account. There is no credential extraction, direct
HTTP transcription call, or automatic paid-API fallback in this integration.

The experimental RPC has no explicit input-commit operation. The adapter adds
trailing silence and waits for finalized transcripts followed by a quiet
interval. Late segments can still be missed; this backend is not guaranteed to
match the completeness or availability of the local backend. It should be
revisited when Codex provides a stable, bounded transcription operation.

## Validation

Tests cover cancellation, late microphone permission, late transcripts,
backend failures, payload limits, single-model replacement, and asynchronous
Codex startup errors without network calls. For a native-runtime smoke test,
build the application and exercise the packaged worker with a temporary model
directory and a public audio fixture. Never use private audio in fixtures.
