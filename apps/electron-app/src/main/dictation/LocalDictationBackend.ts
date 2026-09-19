import { utilityProcess, type UtilityProcess } from "electron";
import { mkdir, readFile, rm, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type {
  OpenCodexDictationInput, OpenCodexDictationModelState, OpenCodexDictationSettings
} from "@open-codex-ui/opencodex-protocol";
import { LOCAL_DICTATION_MODELS } from "./localModels.js";
import type { DictationBackend } from "./DictationBackend.js";

type ModelId = OpenCodexDictationSettings["modelId"];

/** Owns a single model directory and at most one cancellable worker. */
export class LocalDictationBackend implements DictationBackend {
  /** Installation metadata exposed to settings and composer controls. */
  private state: OpenCodexDictationModelState = {
    installedModelId: null, downloadingModelId: null, progress: null, error: null
  };
  /** Native inference or download worker owned by the current operation. */
  private worker: UtilityProcess | null = null;
  /** Resolves only after the child exits and releases its model files. */
  private workerExited: Promise<void> | null = null;
  /** Shares termination completion between cancellation and operation cleanup. */
  private stoppingWorker: Promise<void> | null = null;
  /** Rejects a pending job when its worker is cancelled. */
  private rejectJob: ((error: Error) => void) | null = null;
  /** Session identifier, or the reserved install/remove operation name. */
  private operation: string | null = null;
  /** Prevents cancelled work from publishing a successful installation. */
  private cancelled = false;
  /** Startup metadata read shared by all public operations. */
  private readonly initialized: Promise<void>;
  /** The only model directory managed by this backend. */
  private readonly directory: string;
  /** Persisted proof that installation and model loading both completed. */
  private readonly marker: string;

  /** Uses host app data, independently from the selected Codex source filesystem. */
  constructor(
    userDataPath: string,
    private readonly workerPath: string,
    private readonly emit: (state: OpenCodexDictationModelState) => void
  ) {
    this.directory = path.join(userDataPath, "dictation", "model");
    this.marker = path.join(userDataPath, "dictation", "installed.json");
    this.initialized = this.loadInstalled();
  }

  /** Reads only an installation completed by the current catalogue revision. */
  private async loadInstalled(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.marker, "utf8")) as { modelId: ModelId; revision: string };
      const model = LOCAL_DICTATION_MODELS[value.modelId];
      if (model !== undefined && model.revision === value.revision) this.state.installedModelId = value.modelId;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.state.error = String(error);
    }
  }

  /** Returns an authoritative snapshot after reading persisted installation metadata. */
  async getState(): Promise<OpenCodexDictationModelState> {
    await this.initialized;
    return { ...this.state };
  }

  /** Replaces the previous model; partial downloads never count as installed models. */
  async install(modelId: ModelId): Promise<OpenCodexDictationModelState> {
    if (!Object.hasOwn(LOCAL_DICTATION_MODELS, modelId)) throw new Error("Unknown dictation model.");
    this.begin("install");
    this.state = { installedModelId: null, downloadingModelId: modelId, progress: 0, error: null };
    this.publish();
    try {
      await this.initialized;
      this.state.installedModelId = null;
      await rm(this.marker, { force: true });
      await rm(this.directory, { recursive: true, force: true });
      await mkdir(this.directory, { recursive: true });
      if (this.cancelled) throw new Error("Download cancelled.");
      await this.runWorker({ kind: "install", modelId });
      if (this.cancelled) throw new Error("Download cancelled.");
      await writeFile(`${this.marker}.tmp`, JSON.stringify({ modelId, revision: LOCAL_DICTATION_MODELS[modelId].revision }));
      await rename(`${this.marker}.tmp`, this.marker);
      if (this.cancelled) throw new Error("Download cancelled.");
      this.state.installedModelId = modelId;
    } catch (error) {
      await this.stopWorker();
      await rm(this.marker, { force: true });
      await rm(this.directory, { recursive: true, force: true });
      if (!this.cancelled) this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      await this.stopWorker();
      this.operation = null;
      this.state.downloadingModelId = null;
      this.state.progress = null;
      this.publish();
    }
    return { ...this.state };
  }

  /** Deletes the installed model without touching application or conversation data. */
  async remove(): Promise<OpenCodexDictationModelState> {
    await this.initialized;
    this.begin("remove");
    try {
      await rm(this.marker, { force: true });
      await rm(this.directory, { recursive: true, force: true });
      this.state = { installedModelId: null, downloadingModelId: null, progress: null, error: null };
      this.publish();
      return { ...this.state };
    } finally { this.operation = null; }
  }

  /** Runs local-only inference; no model is downloaded implicitly from the composer. */
  async transcribe(input: OpenCodexDictationInput): Promise<string> {
    this.begin(input.sessionId);
    try {
      await this.initialized;
      if (this.cancelled) throw new Error("Dictation cancelled.");
      const modelId = this.state.installedModelId;
      if (modelId === null) throw new Error("Download a dictation model in settings first.");
      return await this.runWorker({ kind: "transcribe", modelId, audioBase64: input.audioBase64, language: input.language });
    } finally {
      await this.stopWorker();
      this.operation = null;
    }
  }

  /** Cancels only the requested operation, leaving unrelated work alone. */
  async cancel(sessionId: string): Promise<void> {
    if (this.operation !== sessionId) return;
    this.cancelled = true;
    const reject = this.rejectJob;
    await this.stopWorker();
    reject?.(new Error("Dictation cancelled."));
  }

  /** Stops inference/downloads when the renderer or application closes. */
  async dispose(): Promise<void> {
    if (this.operation !== null) await this.cancel(this.operation);
  }

  /** Serializes installation and inference without blocking the main process. */
  private begin(operation: string): void {
    if (this.operation !== null) throw new Error("Dictation is busy.");
    this.operation = operation;
    this.cancelled = false;
  }

  /** Starts an isolated worker and forwards bounded, content-free download progress. */
  private runWorker(data: Record<string, unknown>): Promise<string> {
    return new Promise((resolve, reject) => {
      // ONNX's native binding cannot reliably reload in successive worker_threads.
      const worker = utilityProcess.fork(this.workerPath, [], {
        serviceName: "OpenCodexUI dictation", stdio: ["ignore", "ignore", "pipe"]
      });
      this.worker = worker;
      this.rejectJob = reject;
      let diagnostics = "";
      worker.stderr?.on("data", (chunk: Buffer) => {
        diagnostics = (diagnostics + chunk.toString()).slice(-4096);
      });
      const timeout = setTimeout(() => reject(new Error("Dictation operation timed out.")), 15 * 60_000);
      this.workerExited = new Promise((exited) => {
        worker.once("exit", (code) => {
          clearTimeout(timeout);
          reject(new Error(`Dictation worker stopped (${code}). ${diagnostics}`.trim()));
          exited();
        });
      });
      worker.on("message", (message: { type: string; progress?: number; text?: string; message?: string }) => {
        if (message.type === "progress") {
          this.state.progress = message.progress ?? null;
          this.publish();
        } else if (message.type === "done") {
          clearTimeout(timeout);
          resolve(message.text ?? "");
        } else if (message.type === "error") {
          clearTimeout(timeout);
          reject(new Error(message.message ?? "Dictation failed."));
        }
      });
      worker.postMessage({ ...data, directory: this.directory });
    });
  }

  /** Releases native inference resources before another worker can start. */
  private async stopWorker(): Promise<void> {
    if (this.stoppingWorker !== null) return this.stoppingWorker;
    const worker = this.worker;
    const exited = this.workerExited;
    this.worker = null;
    this.workerExited = null;
    this.rejectJob = null;
    if (worker === null) return;
    // A cancellation can arrive before Chromium reports the child's PID.
    if (!worker.kill()) worker.once("spawn", () => { worker.kill(); });
    this.stoppingWorker = exited ?? Promise.resolve();
    try {
      await this.stoppingWorker;
    } finally {
      this.stoppingWorker = null;
    }
  }

  /** Emits a plain snapshot; audio and transcripts are never progress events. */
  private publish(): void { this.emit({ ...this.state }); }
}
