import { makeAutoObservable, runInAction } from "mobx";
import type {
  OpenCodexFileTarget,
  OpenCodexFileSnapshot,
  OpenCodexFileResult,
  OpenCodexFileErrorCode,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

/** Backend port shared by documents and lazy explorers. */
export interface FileRequestPort {
  request<T>(request: OpenCodexRequest): Promise<T>;
}

/** Optional source location usable by other tools, including a future debugger. */
export interface DocumentPosition {
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

/** Viewer-neutral annotations available to future source producers. */
export interface DocumentAnnotation extends DocumentPosition {
  message: string;
  severity: "error" | "warning" | "info";
}

/** Structured error retained next to the document, without losing its contents. */
export interface FileDocumentError {
  code: OpenCodexFileErrorCode;
  details: string;
}

/** Viewer-independent document state; disk identity never follows UI selection. */
export class FileDocument {
  /** Editable text uses LF internally; the backend restores the original line endings. */
  content = "";
  /** Optional viewer language choice; null retains automatic detection. */
  languageOverride: string | null = null;
  /** Last confirmed text, used to detect edits and undo back to a clean document. */
  savedContent = "";
  /** Original format and optimistic disk revision. */
  snapshot: OpenCodexFileSnapshot | null = null;
  /** Errors leave both the editable text and baseline intact. */
  error: FileDocumentError | null = null;
  /** Initial or explicitly requested read in progress. */
  isLoading = false;
  /** Save in progress; closing is blocked until it completes. */
  isSaving = false;
  /** Prevents overlapping background checks. */
  private isChecking = false;
  /** Stops old completions from mutating disposed documents. */
  private disposed = false;
  /** Viewer resources are released with the document, not its visible component. */
  private readonly disposers: Array<() => void> = [];
  /** A changed on-disk revision requires explicit resolution when locally dirty. */
  hasConflict = false;
  /** Position requested by another module; consumed by the viewer. */
  position: DocumentPosition | null = null;
  /** Serialized editor view state; no Monaco dependency enters document storage. */
  viewState: unknown = null;
  /** Increments only when disk content intentionally replaces the editor buffer. */
  version = 0;
  /** Optional diagnostics supplied by another module, without debugger coupling. */
  annotations: DocumentAnnotation[] = [];

  /** Creates either a disk-backed document or an immutable in-memory document. */
  constructor(
    readonly id: string,
    readonly name: string,
    readonly target: Readonly<OpenCodexFileTarget> | null,
    readonly workspaceName: string,
    private readonly port: FileRequestPort,
    readonly virtualLanguage?: string
  ) {
    makeAutoObservable<this, "port" | "disposed" | "isChecking" | "viewState" | "disposers">(this, {
      port: false,
      target: false,
      disposed: false,
      isChecking: false,
      viewState: false,
      disposers: false
    });
  }

  /** True only when the current buffer differs from its last confirmed baseline. */
  get isDirty(): boolean {
    return this.content !== this.savedContent;
  }

  /** Unsupported format, virtual content and initial reads cannot be edited. */
  get isReadOnly(): boolean {
    return this.target === null || this.snapshot === null || this.snapshot.readOnly || this.isLoading ||
      this.error?.code === "accessDenied" || this.error?.code === "readOnly";
  }

  /** Changes syntax highlighting without modifying the document buffer. */
  setLanguageOverride(language: string | null): void {
    this.languageOverride = language;
  }

  /** Captures an edit without discarding any disk-conflict indication. */
  edit(content: string): void {
    if (!this.isReadOnly) this.content = content;
  }

  /** Sets immutable generated content independently of any physical source path. */
  setVirtualContent(content: string): void {
    if (this.target !== null) return;
    this.content = content;
    this.savedContent = content;
    this.version += 1;
  }

  /** Reloads only after the caller has explicitly resolved any local modifications. */
  async reload(): Promise<void> {
    if (this.target === null || this.isLoading || this.isSaving || this.disposed) return;
    this.isLoading = true;
    try {
      const result = await this.port.request<OpenCodexFileResult<OpenCodexFileSnapshot>>({
        type: "workspaceFiles.read",
        target: { ...this.target }
      });
      if (this.disposed) return;
      runInAction(() => {
        if (result.ok) this.acceptSnapshot(result.value);
        else this.error = result;
      });
    } catch (error) {
      this.fail(error);
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  /** Saves the captured buffer to its original context; failures preserve every edit. */
  async save(): Promise<boolean> {
    if (this.isSaving || this.isLoading || this.disposed) return false;
    if (!this.isDirty) return true;
    if (this.target === null || this.snapshot === null || this.isReadOnly) return false;
    const content = this.content;
    this.isSaving = true;
    try {
      const result = await this.port.request<OpenCodexFileResult<OpenCodexFileSnapshot>>({
        type: "workspaceFiles.save",
        target: { ...this.target },
        content,
        revision: this.snapshot.revision,
        bom: this.snapshot.bom
      });
      if (this.disposed) return false;
      runInAction(() => {
        if (result.ok) {
          this.snapshot = result.value;
          this.savedContent = normalizeText(result.value.content);
          this.error = null;
          this.hasConflict = false;
        } else {
          this.error = result;
          this.hasConflict ||= result.code === "conflict";
        }
      });
      return result.ok && !this.isDirty;
    } catch (error) {
      this.fail(error);
      return false;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /** Updates access flags only; even revoked documents retain their editable buffer. */
  async refreshAccess(): Promise<void> {
    if (this.target === null || this.disposed) return;
    try {
      const result = await this.port.request<OpenCodexFileResult<{ readOnly: boolean }>>({
        type: "workspaceFiles.stat", target: { ...this.target }
      });
      if (this.disposed) return;
      runInAction(() => {
        if (!result.ok) {
          this.error = result;
          return;
        }
        if (this.snapshot !== null) this.snapshot.readOnly = result.value.readOnly || this.snapshot.eol === "mixed";
        if (this.error?.code === "accessDenied" || this.error?.code === "readOnly") this.error = null;
      });
    } catch (error) {
      this.fail(error);
    }
  }

  /** Checks disk changes on focus/interval; local edits are never silently replaced. */
  async checkExternal(): Promise<void> {
    if (
      this.target === null ||
      this.snapshot === null ||
      this.isLoading ||
      this.isSaving ||
      this.isChecking ||
      this.disposed
    )
      return;
    const revision = this.snapshot.revision;
    this.isChecking = true;
    try {
      const result = await this.port.request<OpenCodexFileResult<boolean>>({
        type: "workspaceFiles.check",
        target: { ...this.target },
        revision
      });
      if (this.disposed || this.isSaving || this.snapshot.revision !== revision) return;
      if (!result.ok) {
        runInAction(() => {
          this.error = result;
        });
      } else if (!result.value) {
        if (this.isDirty) {
          runInAction(() => {
            this.hasConflict = true;
          });
        } else {
          await this.reload();
        }
      }
    } catch (error) {
      this.fail(error);
    } finally {
      this.isChecking = false;
    }
  }

  /** Replaces source annotations using detached, viewer-independent data. */
  setAnnotations(annotations: readonly DocumentAnnotation[]): void {
    this.annotations = annotations.map((annotation) => ({ ...annotation }));
  }

  /** Releases this document without letting an old response revive it. */
  dispose(): void {
    this.disposed = true;
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
  }

  /** Registers a viewer resource without coupling document state to Monaco. */
  onDispose(dispose: () => void): void {
    if (this.disposed) dispose();
    else this.disposers.push(dispose);
  }

  /** Applies an acknowledged disk read while preserving viewer-owned position state. */
  private acceptSnapshot(snapshot: OpenCodexFileSnapshot): void {
    this.snapshot = snapshot;
    this.content = normalizeText(snapshot.content);
    this.savedContent = this.content;
    this.hasConflict = false;
    this.error = null;
    this.version += 1;
  }

  /** Records transport failures locally without replacing the editable buffer. */
  private fail(error: unknown): void {
    if (this.disposed) return;
    runInAction(() => {
      this.error = { code: "unavailable", details: String(error) };
    });
  }
}

/** Normalizes editable text without changing the persisted format metadata. */
function normalizeText(content: string): string {
  return content.replace(/\r\n|\r/g, "\n");
}
