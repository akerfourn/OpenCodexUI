import { makeAutoObservable, runInAction } from "mobx";
import type { BrowserPermissionsContext, BrowserPermissionsSnapshot,
  BrowserPermissionChange } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";

/** Owns one dialog's snapshot; stale requests cannot overwrite a newer refresh. */
export class BrowserPermissionsStore {
  /** Last successfully loaded file and inherited global rules. */
  snapshot: BrowserPermissionsSnapshot | null = null;
  /** Pending read or mutation disables controls until its result is known. */
  busy = false;
  /** Localized error key; raw filesystem and RPC details remain available separately. */
  errorKey: string | null = null;
  /** Underlying error detail for troubleshooting an inaccessible source. */
  errorDetail: string | null = null;
  /** Indicates that the plugin may still have cached an older decision. */
  needsReload = false;
  /** Guards against a refresh response arriving after a newer operation. */
  private generation = 0;

  /** Captures an explicit source and scope independently of active application selection. */
  constructor(private readonly root: RootStore, readonly context: BrowserPermissionsContext) {
    makeAutoObservable<BrowserPermissionsStore, "root">(this, { root: false });
  }

  /** Reads current file content, including changes made by the browser plugin. */
  async load(): Promise<void> {
    await this.perform(async () => {
      return await this.root.request<BrowserPermissionsSnapshot>({
        type: "browserPermissions.read", context: { ...this.context }
      });
    });
  }

  /** Sends a plain targeted change with the revision that the user actually reviewed. */
  async change(change: BrowserPermissionChange): Promise<void> {
    if (this.snapshot === null || this.busy) return;
    const revision = this.snapshot.file.revision;
    await this.perform(async () => {
      const snapshot = await this.root.request<BrowserPermissionsSnapshot>({
        type: "browserPermissions.change", context: { ...this.context }, revision,
        change: { resource: change.resource, pattern: change.pattern, decision: change.decision }
      });
      runInAction(() => { this.needsReload = true; });
      return snapshot;
    });
  }

  /** Explicitly restarts an idle Codex connection to clear plugin permission caches. */
  async reloadConnection(): Promise<void> {
    if (this.busy) return;
    await this.perform(async () => {
      await this.root.request({ type: "browserPermissions.reload", sourceId: this.context.sourceId });
      runInAction(() => { this.needsReload = false; });
      return await this.root.request<BrowserPermissionsSnapshot>({
        type: "browserPermissions.read", context: { ...this.context }
      });
    });
  }

  /** Keeps failed writes visible without discarding the last reviewed snapshot. */
  private async perform(operation: () => Promise<BrowserPermissionsSnapshot>): Promise<void> {
    const generation = ++this.generation;
    this.busy = true;
    this.errorKey = null;
    this.errorDetail = null;
    try {
      const snapshot = await operation();
      runInAction(() => {
        if (generation === this.generation) this.snapshot = snapshot;
      });
    } catch (error) {
      runInAction(() => {
        if (generation !== this.generation) return;
        const detail = error instanceof Error ? error.message : String(error);
        this.errorDetail = detail;
        this.errorKey = browserPermissionsErrorKey(detail);
      });
    } finally {
      runInAction(() => { if (generation === this.generation) this.busy = false; });
    }
  }
}

/** Converts stable backend error markers into user-facing translation keys. */
function browserPermissionsErrorKey(detail: string): string {
  for (const [marker, key] of [
    ["BROWSER_CONFLICT", "conflict"], ["BROWSER_BUSY", "busy"],
    ["BROWSER_UNSUPPORTED", "unsupported"], ["BROWSER_FORMAT", "format"],
    ["BROWSER_INVALID", "invalid"]
  ] as const) {
    if (detail.includes(marker)) return `browserPermissions.errors.${key}`;
  }
  return "browserPermissions.errors.unavailable";
}
