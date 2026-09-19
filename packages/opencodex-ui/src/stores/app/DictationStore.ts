import { makeAutoObservable, runInAction } from "mobx";
import {
  normalizeDictationSettings, type OpenCodexDictationModelState, type OpenCodexDictationSettings,
  type OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import { AudioRecording } from "../../dictation/AudioRecording";

/** Owns model management and one recording, independently from the chosen speech backend. */
export class DictationStore {
  /** Last host snapshot of the single installed or downloading model. */
  modelState: OpenCodexDictationModelState = {
    installedModelId: null, downloadingModelId: null, progress: null, error: null
  };
  /** Drives recording controls and blocks submission until dictation ends. */
  status: "idle" | "requesting" | "recording" | "transcribing" = "idle";
  /** Dismissible diagnostics kept separate from conversation errors. */
  error: string | null = null;
  /** Serializes settings changes and model management. */
  managing = false;
  /** Non-observable browser microphone resource. */
  private recording: AudioRecording | null = null;
  /** Invalidated on cancellation to discard late asynchronous results. */
  private sessionId: string | null = null;
  /** Insertion callback owned by the original composer. */
  private onText: ((text: string) => void) | null = null;
  /** Explicit Codex source captured when recording begins. */
  private sourceId: string | null = null;
  /** Stable backend preferences for the current recording. */
  private recordingSettings: OpenCodexDictationSettings | null = null;

  /** Defers microphone access and model loading until explicit user actions. */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<DictationStore, "root" | "recording" | "onText">(this, {
      root: false, recording: false, onText: false
    });
  }

  /** Reads normalized defaults without requiring a settings migration. */
  get settings(): OpenCodexDictationSettings { return normalizeDictationSettings(this.root.settings.dictation); }
  /** Prevents concurrent microphone sessions and model replacement during inference. */
  get busy(): boolean { return this.status !== "idle"; }

  /** Applies content-free host progress notifications. */
  applyModelState(state: OpenCodexDictationModelState): void { this.modelState = { ...state }; }

  /** Restores installed-model status when opening the settings section. */
  async load(): Promise<void> {
    try {
      const state = await this.root.request<OpenCodexDictationModelState>({ type: "dictation.models.state" });
      runInAction(() => this.applyModelState(state));
    } catch (error) { runInAction(() => { this.error = errorMessage(error); }); }
  }

  /** Persists preferences before exposing a new backend selection. */
  async updateSettings(patch: Partial<OpenCodexDictationSettings>): Promise<void> {
    if (this.busy || this.managing) return;
    this.managing = true;
    this.error = null;
    try {
      const dictation = { ...this.settings, ...patch };
      const settings = await this.root.request<OpenCodexSettings>({ type: "settings.update", patch: { dictation } });
      runInAction(() => { this.root.settings = settings; });
    } catch (error) { runInAction(() => { this.error = errorMessage(error); }); }
    finally { runInAction(() => { this.managing = false; }); }
  }

  /** Replaces or removes the single host-local model from the settings UI. */
  async manageModel(action: "install" | "remove"): Promise<void> {
    if (this.busy || this.managing) return;
    this.managing = true;
    this.error = null;
    try {
      const request = action === "install"
        ? { type: "dictation.models.install" as const, modelId: this.settings.modelId }
        : { type: "dictation.models.remove" as const };
      const state = await this.root.request<OpenCodexDictationModelState>(request);
      runInAction(() => this.applyModelState(state));
    } catch (error) { runInAction(() => { this.error = errorMessage(error); }); }
    finally { runInAction(() => { this.managing = false; }); }
  }

  /** Cancels an in-flight model download and leaves cleanup to the host. */
  async cancelDownload(): Promise<void> {
    try { await this.root.request({ type: "dictation.models.cancel" }); }
    catch (error) { runInAction(() => { this.error = errorMessage(error); }); }
  }

  /** Captures the target composer callback so a later result cannot land in another chat. */
  async start(sourceId: string | null, onText: (text: string) => void): Promise<void> {
    if (this.busy || this.managing || !this.settings.enabled) return;
    const id = crypto.randomUUID();
    const settings = this.settings;
    this.sessionId = id;
    this.recordingSettings = settings;
    this.sourceId = sourceId;
    this.onText = onText;
    this.status = "requesting";
    this.error = null;
    let stream: MediaStream | null = null;
    try {
      if (settings.backend === "local") {
        const state = await this.root.request<OpenCodexDictationModelState>({ type: "dictation.models.state" });
        if (state.installedModelId !== settings.modelId) throw new Error("Download the selected model in dictation settings first.");
      }
      if (this.sessionId !== id) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (this.sessionId !== id) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const recording = new AudioRecording(stream, () => { void this.finish(); }, (error) => {
        if (this.sessionId === id) runInAction(() => { this.error = error.message; this.reset(); });
      });
      runInAction(() => { this.recording = recording; this.status = "recording"; });
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (this.sessionId === id) runInAction(() => { this.error = errorMessage(error); this.reset(); });
    }
  }

  /** Stops recording, then inserts text only if its original composer is still attached. */
  async finish(): Promise<void> {
    const recording = this.recording;
    const id = this.sessionId;
    const settings = this.recordingSettings;
    if (recording === null || id === null || settings === null || this.status !== "recording") return;
    this.status = "transcribing";
    try {
      const audioBase64 = await recording.finish();
      if (this.sessionId !== id) return;
      const result = await this.root.request<{ text: string }>({
        type: "dictation.transcribe",
        input: { sessionId: id, sourceId: this.sourceId, backend: settings.backend, language: settings.language, audioBase64 }
      });
      if (this.sessionId !== id) return;
      if (result.text.trim().length === 0) throw new Error("No speech was recognized.");
      this.onText?.(result.text);
    } catch (error) {
      if (this.sessionId === id) runInAction(() => { this.error = errorMessage(error); });
    } finally {
      if (this.sessionId === id) runInAction(() => this.reset());
    }
  }

  /** Invalidates late results before releasing the mic and cancelling the backend job. */
  cancel(): void {
    const id = this.sessionId;
    this.recording?.cancel();
    this.reset();
    if (id !== null) {
      void this.root.request({ type: "dictation.cancel", sessionId: id }).catch((error: unknown) => {
        if (this.sessionId === null) runInAction(() => { this.error = errorMessage(error); });
      });
    }
  }

  /** Dismisses a user-visible error without altering the draft. */
  clearError(): void { this.error = null; }

  /** Releases callbacks and audio references after completion or cancellation. */
  private reset(): void {
    this.recording = null;
    this.sessionId = null;
    this.onText = null;
    this.recordingSettings = null;
    this.status = "idle";
  }
}

/** Preserves actionable browser or backend error details. */
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
