import { makeAutoObservable, runInAction } from "mobx";

import type { ProjectStore } from "../project/ProjectStore";
import type { RootStore } from "../RootStore";

/** Owns one explicit repair attempt independently of the currently selected conversation. */
export class ThreadRepairStore {
  /** Prevents duplicate requests while verification or refresh is pending. */
  isBusy = false;
  /** A confirmed reconciliation must not be replayed when only refresh failed. */
  isReconciled = false;
  /** Success requires both source verification and the refreshed conversation. */
  isComplete = false;
  /** Diagnostic details remain local to this repair dialog. */
  error: string | null = null;
  /** Closing the project must not start a follow-up that would reopen its chat. */
  private disposed = false;

  /** Captures the menu row's identity without retaining an observable transport payload. */
  constructor(
    readonly threadId: string,
    private readonly sourceId: string | null,
    private readonly project: ProjectStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ThreadRepairStore, "project" | "root">(
      this, { project: false, root: false }, { autoBind: true }
    );
  }

  /** A stale working indicator is allowed: the backend verifies actual source activity. */
  get canRepair(): boolean {
    const chat = this.project.chatsById.get(this.threadId);
    return !this.disposed && !this.isBusy && !this.isComplete && this.sourceId !== null
      && !this.project.isReadOnlyFromCache && !this.project.workspaces.isBusy
      && chat?.isLocalDraft !== true && chat?.composer.isSubmitting !== true;
  }

  /** Verifies durable blockers before refreshing; never sends a message or interrupts a turn. */
  async repair(): Promise<void> {
    if (!this.canRepair) return;
    this.isBusy = true;
    this.error = null;

    try {
      if (!this.isReconciled) {
        await this.root.request({ type: "threads.workspace.reconcile", threadId: this.threadId });
        runInAction(() => {
          this.isReconciled = true;
        });
      }
      if (this.disposed) return;

      await this.root.request({ type: "threads.recover", threadId: this.threadId });
      runInAction(() => {
        this.isComplete = true;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
    } finally {
      runInAction(() => {
        this.isBusy = false;
      });
    }
  }

  /** React may remount effects in development before the dialog is actually closed. */
  activate(): void {
    this.disposed = false;
  }

  /** Stops follow-up refreshes after the owning dialog or project is unmounted. */
  dispose(): void {
    this.disposed = true;
  }
}
