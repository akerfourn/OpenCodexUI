import type { WorkspaceRemovalService } from "./WorkspaceRemovalService.js";
import type { SourceInstanceSnapshot } from "@open-codex-ui/opencodex-protocol";

/** Defers agent activity globally; long-lived processes still need the existing target-specific checks. */
export function canCheckWorkspaceRemovalSource(snapshot: SourceInstanceSnapshot): boolean {
  const activity = snapshot.activity;
  return snapshot.phase === "ready" && activity !== undefined && activity.requestMethods.length === 0
    && activity.turnCount === 0 && activity.threadCount === 0 && activity.approvalCount === 0;
}

/** Polls only cached intents; source inspection runs only on an already ready, idle connection. */
export class DeferredWorkspaceRemovalScheduler {
  /** One process-local worker prevents overlapping dispatch attempts. */
  private running: Promise<void> | null = null;
  /** Cleared before waiting for the last worker during backend disposal. */
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Prevents another request from starting after shutdown begins. */
  private disposed = false;

  /** Readiness must never start a client; failures go to the application's ordinary error log. */
  constructor(private readonly removals: Pick<WorkspaceRemovalService, "queued" | "processQueued">,
    private readonly isReadyAndIdle: (sourceId: string) => boolean,
    private readonly reportError: (error: unknown) => Promise<void>) {}

  /** Resumes durable queued requests while the application is open. */
  start(): void {
    if (this.timer !== null || this.disposed) return;
    this.timer = setInterval(() => { void this.tick(); }, 5_000);
    this.timer.unref();
    void this.tick();
  }

  /** Shares one attempt across timer callbacks, making scheduling deterministic in tests. */
  async tick(): Promise<void> {
    if (this.disposed) return;
    if (this.running !== null) return await this.running;
    this.running = this.process().catch(this.reportError);
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }

  /** Stops polling and finishes any already dispatched command before closing its source and database. */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  /** Keeps failures isolated so another source's queued deletion can still make progress. */
  private async process(): Promise<void> {
    for (const removal of await this.removals.queued()) {
      if (this.disposed) return;
      if (!this.isReadyAndIdle(removal.sourceId)) continue;
      try {
        await this.removals.processQueued(removal.id);
      } catch (error) {
        await this.reportError(error);
      }
    }
  }
}
