import { makeAutoObservable, runInAction } from "mobx";
import type {
  DebugImportPreview, OpenCodexFileContext, OpenCodexFileResult
} from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";

/** Owns a read-only import preview for one captured workspace. */
export class DebugImportStore {
  /** A cheap stat reveals launch.json without parsing it on panel opening. */
  detected = false;
  /** Only the explicit import action reads and parses the file. */
  loading = false;
  /** Last preview; never inserted into saved preferences automatically. */
  preview: DebugImportPreview | null = null;
  /** Read or parse failure, retained while the user can retry. */
  error: string | null = null;
  /** Invalidates requests when the owning panel changes workspace or closes. */
  private generation = 0;
  /** Workspace ownership is immutable for the lifetime of this preview. */
  readonly context: OpenCodexFileContext;

  /** Captures plain identifiers rather than retaining observable workspace metadata. */
  constructor(private readonly root: RootStore, context: OpenCodexFileContext) {
    this.context = Object.freeze({ ...context });
    makeAutoObservable<this, "root" | "generation">(
      this, { root: false, context: false, generation: false }, { autoBind: true }
    );
  }

  /** Missing or inaccessible files do not interrupt normal use of the Debug panel. */
  async detect(): Promise<void> {
    const generation = this.generation;
    try {
      const result = await this.root.request<OpenCodexFileResult<{ kind: string }>>({
        type: "workspaceFiles.stat", target: { ...this.context, path: ".vscode/launch.json" }
      });
      runInAction(() => {
        if (generation === this.generation) this.detected = result.ok && result.value.kind === "file";
      });
    } catch {
      // Detection is optional; explicit import reports the actual read failure.
      runInAction(() => { if (generation === this.generation) this.detected = false; });
    }
  }

  /** Loads a fresh preview without starting an adapter or saving any configuration. */
  async load(): Promise<void> {
    const generation = ++this.generation;
    this.loading = true;
    this.error = null;
    this.preview = null;
    try {
      const preview = await this.root.request<DebugImportPreview>({
        type: "debug", action: { kind: "previewImport", context: { ...this.context } }
      });
      runInAction(() => { if (generation === this.generation) this.preview = preview; });
    } catch (error) {
      runInAction(() => { if (generation === this.generation) this.error = String(error); });
    } finally {
      runInAction(() => { if (generation === this.generation) this.loading = false; });
    }
  }

  /** Cancels ownership of results without attempting to cancel backend filesystem reads. */
  dispose(): void { this.generation++; }
}
