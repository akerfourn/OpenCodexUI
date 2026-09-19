import { DICTATION_MAX_SECONDS, DICTATION_SAMPLE_RATE } from "@open-codex-ui/opencodex-protocol";

/** Captures microphone audio without retaining it on disk. */
export class AudioRecording {
  /** Browser encoder for the user-authorized microphone stream. */
  private readonly recorder: MediaRecorder;
  /** In-memory compressed audio released with this recording. */
  private readonly chunks: Blob[] = [];
  /** Resolves after the browser emits its final encoded chunk. */
  private readonly stopped: Promise<Blob>;
  /** Enforces the shared maximum recording duration. */
  private readonly timer: ReturnType<typeof setTimeout>;

  /** Starts a bounded recording after the user grants microphone access. */
  constructor(private readonly stream: MediaStream, onLimit: () => void, onError: (error: Error) => void) {
    this.recorder = new MediaRecorder(stream);
    this.stopped = new Promise((resolve, reject) => {
      this.recorder.ondataavailable = (event) => { if (event.data.size > 0) this.chunks.push(event.data); };
      this.recorder.onerror = () => {
        const error = new Error("Microphone recording failed.");
        reject(error);
        this.cancel();
        onError(error);
      };
      this.recorder.onstop = () => resolve(new Blob(this.chunks, { type: this.recorder.mimeType }));
    });
    void this.stopped.catch(() => undefined);
    this.recorder.start(250);
    this.timer = setTimeout(onLimit, DICTATION_MAX_SECONDS * 1000);
    for (const track of stream.getAudioTracks()) track.onended = onLimit;
  }

  /** Releases the microphone immediately, including on cancellation and navigation. */
  cancel(): void {
    clearTimeout(this.timer);
    if (this.recorder.state !== "inactive") this.recorder.stop();
    this.stream.getTracks().forEach((track) => { track.onended = null; track.stop(); });
  }

  /** Produces a plain PCM16 payload, resampled to the shared backend input format. */
  async finish(): Promise<string> {
    this.cancel();
    const blob = await this.stopped;
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const length = Math.min(Math.ceil(decoded.duration * DICTATION_SAMPLE_RATE), DICTATION_MAX_SECONDS * DICTATION_SAMPLE_RATE);
      const offline = new OfflineAudioContext(1, Math.max(1, length), DICTATION_SAMPLE_RATE);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const audio = (await offline.startRendering()).getChannelData(0);
      return encodePcm16(audio);
    } finally { await context.close(); }
  }
}

/** Serializes bounded PCM data without spreading a large array onto the call stack. */
export function encodePcm16(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}
