import { makeAutoObservable, runInAction } from "mobx";
import type { OpenCodexEvent, SourceInstanceRequest, SourceInstanceSnapshot } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";

export type SourceInstanceAction = "start" | "stop" | "restart";

/** Shows source lifecycle and sends explicit controls without starting clients during status reads. */
export class SourceInstancesStore {
  /** Authoritative source-specific states, independent of the global connection indicator. */
  readonly states = new Map<string, SourceInstanceSnapshot>();
  /** Actions currently submitted by this renderer. */
  readonly pending = new Map<string, SourceInstanceAction>();
  /** Errors stay next to the source that caused them. */
  readonly errors = new Map<string, string>();
  /** Whether an initial snapshot request is in flight. */
  isLoading = false;
  /** Failure to read the pool is visible instead of being mistaken for stopped instances. */
  loadError: string | null = null;
  /** Prevents delayed lists from overwriting newer source lifecycle events. */
  private eventSequence = 0;
  /** Last event generation observed for each source. */
  private readonly sourceSequences = new Map<string, number>();
  /** Late start failures cannot overwrite a subsequent forced stop. */
  private readonly actionSequences = new Map<string, number>();

  /** Attaches content-free lifecycle state to the UI transport. */
  constructor(private readonly root: RootStore) {
    makeAutoObservable<SourceInstancesStore, "root" | "eventSequence" | "sourceSequences" | "actionSequences">(this, {
      root: false, eventSequence: false, sourceSequences: false, actionSequences: false
    }, { autoBind: true });
  }

  /** Applies bootstrap state and live transitions without triggering any RPC. */
  handleEvent(event: OpenCodexEvent): void {
    if (event.type === "app.bootstrap") {
      for (const snapshot of event.sourceInstances ?? []) {
        this.apply(snapshot);
      }
    } else if (event.type === "sourceInstances.changed") {
      this.eventSequence += 1;
      this.sourceSequences.set(event.snapshot.sourceId, this.eventSequence);
      this.apply(event.snapshot);
      const error = this.errors.get(event.snapshot.sourceId);
      const isTransientError = error?.startsWith("SOURCE_BUSY") === true || error?.startsWith("SOURCE_UPDATING") === true;
      const isIdle = event.snapshot.phase === "ready" || event.snapshot.phase === "stopped";
      if (isIdle && !event.snapshot.isActive && isTransientError) {
        this.errors.delete(event.snapshot.sourceId);
      }
    }
  }

  /** Reads process metadata only; a source need not be running to appear. */
  async load(): Promise<void> {
    if (this.isLoading) {
      return;
    }
    const sequence = this.eventSequence;
    this.isLoading = true;
    this.loadError = null;
    try {
      const snapshots = await this.root.request<SourceInstanceSnapshot[]>({ type: "sourceInstances.list" });
      runInAction(() => {
        for (const snapshot of snapshots) {
          if ((this.sourceSequences.get(snapshot.sourceId) ?? 0) <= sequence) this.apply(snapshot);
        }
      });
    } catch (error) {
      runInAction(() => {
        this.loadError = error instanceof Error ? error.message : String(error);
      });
    } finally {
      runInAction(() => {
        this.isLoading = false;
      });
    }
  }

  /** Controls one source; forced interruption is never automatically retried or inferred. */
  async control(sourceId: string, action: SourceInstanceAction, force = false): Promise<boolean> {
    const canInterruptStartup = action !== "start" && this.states.get(sourceId)?.phase === "starting";
    if (this.pending.has(sourceId) && !canInterruptStartup) {
      return false;
    }
    const sequence = (this.actionSequences.get(sourceId) ?? 0) + 1;
    this.actionSequences.set(sourceId, sequence);
    this.pending.set(sourceId, action);
    this.errors.delete(sourceId);
    try {
      let request: SourceInstanceRequest;
      if (action === "start") {
        request = { type: "sourceInstances.start", sourceId };
      } else {
        request = { type: `sourceInstances.${action}`, sourceId, force };
      }
      await this.root.request<SourceInstanceSnapshot>(request);
      // Events own the state: a delayed response must not erase activity observed after it was produced.
      return true;
    } catch (error) {
      if (this.actionSequences.get(sourceId) === sequence) {
        runInAction(() => {
          this.errors.set(sourceId, error instanceof Error ? error.message : String(error));
        });
      }
      return false;
    } finally {
      if (this.actionSequences.get(sourceId) === sequence) {
        runInAction(() => {
          this.pending.delete(sourceId);
        });
      }
    }
  }

  /** Copies plain native snapshots into observable UI state. */
  private apply(snapshot: SourceInstanceSnapshot): void {
    const next: SourceInstanceSnapshot = {
      sourceId: snapshot.sourceId,
      phase: snapshot.phase,
      isActive: snapshot.isActive,
      manuallyStopped: snapshot.manuallyStopped,
      error: snapshot.error
    };
    if (snapshot.activity !== undefined) {
      next.activity = { ...snapshot.activity, requestMethods: [...snapshot.activity.requestMethods] };
    }
    this.states.set(snapshot.sourceId, next);
  }
}
