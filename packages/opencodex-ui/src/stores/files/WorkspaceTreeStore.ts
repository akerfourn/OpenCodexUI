import { makeAutoObservable, observable, runInAction } from "mobx";
import type {
  OpenCodexFileContext,
  OpenCodexFileEntry,
  OpenCodexFileResult
} from "@open-codex-ui/opencodex-protocol";
import type { FileRequestPort, FileDocumentError } from "./FileDocument";

/** One directory's independently loaded state. */
export interface FileDirectoryState {
  entries: OpenCodexFileEntry[];
  loading: boolean;
  loaded: boolean;
  error: FileDocumentError | null;
}

/** Lazy tree tied permanently to one source/workspace; no recursive reads. */
export class WorkspaceTreeStore {
  /** Loaded direct children keyed by relative directory path. */
  readonly directories = observable.map<string, FileDirectoryState>();
  /** Expansion survives tool switches and revisiting this workspace. */
  readonly expanded = observable.set<string>([""]);
  /** Invalidates requests from a prior refresh or disposed project. */
  private generation = 0;

  /** Captures the source identity rather than observing the active selection. */
  constructor(
    readonly context: Readonly<OpenCodexFileContext>,
    private readonly port: FileRequestPort
  ) {
    makeAutoObservable<this, "port" | "generation">(this, { port: false, context: false, generation: false });
  }

  /** Expands one folder and loads its children only on demand. */
  toggle(path: string): void {
    if (this.expanded.has(path)) {
      this.expanded.delete(path);
      return;
    }
    this.expanded.add(path);
    void this.load(path);
  }

  /** Loads only the requested directory; late responses stay in this tree. */
  async load(path: string): Promise<void> {
    const previous = this.directories.get(path);
    if (previous?.loading || previous?.loaded) return;
    const generation = this.generation;
    this.directories.set(path, { entries: [], loading: true, loaded: false, error: null });
    try {
      const result = await this.port.request<OpenCodexFileResult<OpenCodexFileEntry[]>>({
        type: "workspaceFiles.list",
        target: { ...this.context, path }
      });
      if (generation !== this.generation) return;
      runInAction(() => {
        this.directories.set(path, {
          entries: result.ok ? result.value : [],
          loading: false,
          loaded: result.ok,
          error: result.ok ? null : result
        });
      });
    } catch (error) {
      if (generation !== this.generation) return;
      runInAction(() => {
        this.directories.set(path, {
          entries: [],
          loading: false,
          loaded: false,
          error: { code: "unavailable", details: String(error) }
        });
      });
    }
  }

  /** Reloads the root; expanded descendants load when their rows are rendered. */
  refresh(): void {
    this.generation += 1;
    this.directories.clear();
    void this.load("");
  }

  /** Invalidates outstanding responses when the owning project closes. */
  dispose(): void {
    this.generation += 1;
  }
}
