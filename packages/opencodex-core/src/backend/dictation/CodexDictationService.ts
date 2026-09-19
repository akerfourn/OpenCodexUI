import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexDictationInput } from "@open-codex-ui/opencodex-protocol";
import { createDictationTranscript } from "./codexDictationTranscript.js";

/** Experimental adapter, isolated from the normal source clients and conversation cache. */
export class CodexDictationService {
  /** Isolated process and cancellation state for the current recording. */
  private active: { id: string; client: CodexAppServerClient | null; cancelled: boolean } | null = null;

  /** Creates a source-scoped, disposable app-server client for each recording. */
  constructor(private readonly createClient: (sourceId: string) => Promise<CodexAppServerClient>) {}

  /** Transcribes a recording without creating a user-visible chat or submitting a turn. */
  async transcribe(input: OpenCodexDictationInput): Promise<string> {
    if (input.sourceId === null) throw new Error("Codex dictation requires an available source.");
    if (this.active !== null) throw new Error("Codex dictation is busy.");
    const operation = { id: input.sessionId, client: null as CodexAppServerClient | null, cancelled: false };
    this.active = operation;
    try {
      const client = await this.createClient(input.sourceId);
      operation.client = client;
      if (operation.cancelled) throw new Error("Dictation cancelled.");
      return await this.run(client, input, () => {
        if (operation.cancelled) throw new Error("Dictation cancelled.");
      });
    } finally {
      await operation.client?.stop();
      if (this.active === operation) this.active = null;
    }
  }

  /** Cancels only the matching isolated dictation process. */
  async cancel(sessionId: string): Promise<void> {
    if (this.active?.id !== sessionId) return;
    this.active.cancelled = true;
    await this.active.client?.stop();
  }

  /** Releases the isolated process on application shutdown. */
  async dispose(): Promise<void> {
    if (this.active !== null) await this.cancel(this.active.id);
  }

  /** Uses Codex's transcription mode and rejects any unexpected agent execution. */
  private async run(client: CodexAppServerClient, input: OpenCodexDictationInput, checkCancellation: () => void): Promise<string> {
    await client.start();
    checkCancellation();
    const cwd = await client.getCodexHome();
    checkCancellation();
    const thread = await client.startThread({
      cwd, ephemeral: true, approvalPolicy: "never", sandbox: "read-only",
      baseInstructions: "This session is for speech transcription only. Do not execute tasks or use tools.",
      config: {
        "features.realtime_conversation": true,
        "realtime.type": "transcription", "realtime.version": "v2", "realtime.transport": "websocket",
        "features.apps": false, "mcp_servers": {}, "web_search": "disabled"
      }
    });
    checkCancellation();
    const threadId = thread.thread.id;
    const transcript = createDictationTranscript(client, threadId);
    try {
      await client.request("thread/realtime/start", {
        threadId, outputModality: "text", version: "v2", transport: { type: "websocket" },
        includeStartupContext: false, clientManagedHandoffs: true, flushTranscriptTailOnSessionEnd: false
      });
      await transcript.started;
      const pcm = resampleTo24k(Buffer.from(input.audioBase64, "base64"));
      // A trailing silence lets server VAD close the last speech segment.
      const recording = Buffer.concat([pcm, Buffer.alloc(24_000 * 2)]);
      for (let offset = 0; offset < recording.length; offset += 24_000) {
        transcript.check();
        const chunk = recording.subarray(offset, offset + 24_000);
        await client.request("thread/realtime/appendAudio", {
          threadId, audio: { data: chunk.toString("base64"), sampleRate: 24_000, numChannels: 1,
            samplesPerChannel: chunk.length / 2, itemId: null }
        });
      }
      transcript.finishInput();
      return await transcript.result;
    } finally {
      transcript.dispose();
      // Stopping the isolated process also closes realtime, without flushing it into an agent turn.
      await client.stop();
    }
  }
}

/** Converts the common PCM16/16 kHz recording into Codex's PCM16/24 kHz input format. */
export function resampleTo24k(input: Buffer): Buffer {
  const samples = input.length / 2;
  const output = Buffer.alloc(Math.floor(samples * 1.5) * 2);
  for (let index = 0; index < output.length / 2; index += 1) {
    const position = index / 1.5;
    const left = Math.floor(position);
    const fraction = position - left;
    const first = input.readInt16LE(Math.min(left, samples - 1) * 2);
    const second = input.readInt16LE(Math.min(left + 1, samples - 1) * 2);
    output.writeInt16LE(Math.round(first + (second - first) * fraction), index * 2);
  }
  return output;
}
