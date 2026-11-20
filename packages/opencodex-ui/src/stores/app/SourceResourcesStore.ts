import { makeAutoObservable, runInAction } from "mobx";
import { defaultSourceResources, type SourceResourceSettings, type SourceResourceSnapshot } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";

/** Edits a complete local scheduling policy without restarting a running source. */
export class SourceResourcesStore {
  /** Capability discovery is deferred until the resources tab opens. */
  snapshot: SourceResourceSnapshot | null = null;
  /** Selected scheduling priority, independent of other source forms. */
  priority: SourceResourceSettings["priority"] = "normal";
  /** Empty input means unlimited; retain text so invalid edits remain visible for correction. */
  cpuLimit = "";
  /** Prevents overlapping reads and edits while capability discovery is running. */
  isLoading = false;
  /** Prevents duplicate writes and dismissal while saving. */
  isSaving = false;

  /** Owns one explicit source; only plain DTOs are sent across the request boundary. */
  constructor(private readonly root: RootStore, readonly sourceId: string) {
    makeAutoObservable<SourceResourcesStore, "root">(this, { root: false }, { autoBind: true });
  }

  /** Validates locally without turning a field edit into an application error. */
  get isValid(): boolean {
    const text = this.cpuLimit.trim();
    if (text.length === 0) return true;
    const value = Number(text);
    return Number.isInteger(value) && value >= 1 && value <= 100;
  }

  /** Compares user intent with the last persisted policy, including disabling a former limit. */
  get hasChanges(): boolean {
    const saved = this.snapshot?.settings ?? defaultSourceResources();
    return saved.priority !== this.priority || saved.cpuLimitPercent !== this.settings.cpuLimitPercent;
  }

  /** Produces a new transport DTO, never a MobX observable object. */
  get settings(): SourceResourceSettings {
    let cpuLimitPercent = null;
    if (this.cpuLimit.trim().length > 0) cpuLimitPercent = Number(this.cpuLimit);
    return { priority: this.priority, cpuLimitPercent };
  }

  /** Reads optional OS capabilities without connecting to Codex; request failures use the global journal. */
  async load(): Promise<void> {
    if (this.isLoading || this.snapshot !== null) return;
    this.isLoading = true;
    try {
      const snapshot = await this.root.request<SourceResourceSnapshot>({ type: "sources.resources.read", sourceId: this.sourceId });
      runInAction(() => {
        this.snapshot = snapshot;
        this.priority = snapshot.settings.priority;
        this.cpuLimit = snapshot.settings.cpuLimitPercent?.toString() ?? "";
      });
    } catch {
      // RootStore.request already reports the original failure once.
    } finally {
      runInAction(() => { this.isLoading = false; });
    }
  }

  /** Allows removing a policy that became unsupported after moving configuration to another host. */
  reset(): void {
    this.priority = "normal";
    this.cpuLimit = "";
  }

  /** Updates the priority within the form's observable action boundary. */
  setPriority(priority: SourceResourceSettings["priority"]): void { this.priority = priority; }

  /** Retains numeric text until the form validates and serializes it. */
  setCpuLimit(value: string): void { this.cpuLimit = value; }

  /** Persists only resources; no project association, conversation or source process is altered. */
  async save(): Promise<void> {
    if (this.isSaving || this.isLoading || this.snapshot === null || !this.isValid || !this.hasChanges) return;
    const settings = this.settings;
    this.isSaving = true;
    try {
      await this.root.request({ type: "sources.update", sourceId: this.sourceId, patch: { settings: { resources: {
        priority: settings.priority, cpuLimitPercent: settings.cpuLimitPercent
      } } } });
      runInAction(() => {
        if (this.snapshot !== null) this.snapshot.settings = settings;
      });
    } catch {
      // Keep the draft for retry; the shared request boundary owns error feedback.
    } finally {
      runInAction(() => { this.isSaving = false; });
    }
  }
}
