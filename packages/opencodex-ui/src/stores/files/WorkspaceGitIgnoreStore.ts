import { makeAutoObservable, observable, runInAction } from "mobx";
import type { OpenCodexFileContext, OpenCodexFileResult } from "@open-codex-ui/opencodex-protocol";
import type { FileRequestPort } from "./FileDocument";

/** Batches visible entries and invalidates cached ignore rules with the owning Git snapshot. */
export class WorkspaceGitIgnoreStore {
  /** Only checked paths are present; ignored entries stay fully usable. */
  readonly paths = observable.map<string, boolean>();
  /** Avoids duplicate checks when several effects observe the same entries. */
  private readonly pending = new Set<string>();
  /** A Git refresh can change ignore rules without changing file names. */
  private revision: object | null = null;
  /** Invalidates late replies after a refresh, source change or disposal. */
  private generation = 0;

  /** Retains immutable workspace ownership for every request. */
  constructor(private readonly context: Readonly<OpenCodexFileContext>, private readonly port: FileRequestPort) {
    makeAutoObservable<this, "context" | "port" | "pending" | "revision" | "generation">(this,
      { context: false, port: false, pending: false, revision: false, generation: false });
  }

  /** Checks only newly visible entries; every transport payload is a plain DTO. */
  async load(paths: string[], revision: object): Promise<void> {
    if (revision !== this.revision) {
      this.reset();
      this.revision = revision;
    }
    const unchecked = paths.filter(path => !this.paths.has(path) && !this.pending.has(path));
    const generation = this.generation;
    for (const path of unchecked) this.pending.add(path);
    for (let start = 0; start < unchecked.length; start += 200) {
      if (generation !== this.generation) return;
      const batch = unchecked.slice(start, start + 200);
      try {
        const result = await this.port.request<OpenCodexFileResult<string[]>>({ type: "workspaceFiles.ignored",
          target: { ...this.context, path: "" }, paths: [...batch] });
        if (generation !== this.generation) return;
        if (!result.ok) throw new Error(result.details);
        const ignored = new Set(result.value);
        runInAction(() => { for (const path of batch) this.paths.set(path, ignored.has(path)); });
      } catch (error) {
        if (generation === this.generation) this.port.reportError?.(error, this.context.workspacePath);
      } finally {
        if (generation === this.generation) for (const path of batch) this.pending.delete(path);
      }
    }
  }

  /** Releases old observations and prevents in-flight replies from restoring them. */
  reset(): void {
    this.generation += 1;
    this.paths.clear();
    this.pending.clear();
  }
}
