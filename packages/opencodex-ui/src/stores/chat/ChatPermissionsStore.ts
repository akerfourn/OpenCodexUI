import { makeAutoObservable, runInAction } from "mobx";
import type { ThreadFilesystemAccess, ThreadPermissionsContext, ThreadPermissionsPatch,
  ThreadPermissionsSnapshot } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import type { ChatStore } from "./ChatStore";
import { readChatErrorMessage } from "./chatErrorMessage";

/** Edits effective native permissions for one chat, without changing application defaults. */
export class ChatPermissionsStore {
  /** Last settings confirmed by the owning Codex source. */
  snapshot: ThreadPermissionsSnapshot | null = null;
  /** Explicit selections, kept separate from the confirmed snapshot. */
  filesystem: ThreadFilesystemAccess = "read-only";
  /** Whether outgoing network access is selected. */
  networkAccess = false;
  /** Selected approval reviewer; the native approval policy is preserved. */
  approvalsReviewer: "user" | "auto_review" = "user";
  /** Whether a native read is pending. */
  isLoading = false;
  /** Whether an explicit mutation is pending. */
  isSaving = false;
  /** Last request error, scoped to this dialog. */
  error: string | null = null;
  /** Whether the last explicit save was confirmed by Codex. */
  didSave = false;
  /** Invalidates late results when a newer operation supersedes them. */
  private sequence = 0;

  /** Attaches permission state to the chat's explicit identity and transport. */
  constructor(private readonly chat: ChatStore, private readonly root: RootStore) {
    makeAutoObservable<ChatPermissionsStore, "chat" | "root" | "sequence">(this,
      { chat: false, root: false, sequence: false }, { autoBind: true });
  }

  /** Whether the conversation is persisted, source-owned and locally idle. */
  get isAvailable(): boolean {
    return !this.chat.isLocalDraft && this.chat.sourceId !== null && !this.chat.composer.isSubmitting
      && !this.chat.runtime.hasRunningTurnIndicator && !this.chat.runtime.isSyncing
      && !this.chat.runtime.isRefreshing;
  }

  /** Whether edits still refer to the currently displayed conversation. */
  get canEdit(): boolean {
    return this.isAvailable && !this.isLoading && !this.isSaving && this.snapshot !== null
      && this.matches(this.snapshot);
  }

  /** Whether the form differs from the effective settings shown at its last read. */
  get hasChanges(): boolean {
    if (this.snapshot === null) return false;
    return this.approvalsReviewer !== this.snapshot.approvalsReviewer
      || (this.snapshot.canChangeAccess && (this.filesystem !== this.snapshot.filesystem
        || this.networkAccess !== this.snapshot.networkAccess));
  }

  /** Updates the explicit filesystem selection. */
  setFilesystem(value: ThreadFilesystemAccess): void {
    this.filesystem = value;
    this.didSave = false;
  }
  /** Updates the explicit network selection. */
  setNetworkAccess(value: boolean): void {
    this.networkAccess = value;
    this.didSave = false;
  }
  /** Updates the explicit reviewer selection. */
  setReviewer(value: "user" | "auto_review"): void {
    this.approvalsReviewer = value;
    this.didSave = false;
  }

  /** Refreshes from Codex every time the dialog opens, without guessing default permissions. */
  async load(): Promise<void> {
    if (!this.isAvailable || this.isLoading || this.isSaving) return;
    const context = this.context();
    if (context === null) return;
    const sequence = ++this.sequence;
    this.isLoading = true;
    this.error = null;
    this.didSave = false;
    this.snapshot = null;
    try {
      const snapshot = await this.root.request<ThreadPermissionsSnapshot>({ type: "threadPermissions.read", context });
      if (sequence === this.sequence && this.matches(context)) runInAction(() => { this.apply(snapshot, context); });
    } catch (error) {
      if (sequence === this.sequence) runInAction(() => { this.error = readChatErrorMessage(error); });
    } finally {
      if (sequence === this.sequence) runInAction(() => { this.isLoading = false; });
    }
  }

  /** Applies only a user-confirmed selection and accepts only the returned effective settings. */
  async save(): Promise<boolean> {
    if (!this.canEdit || !this.hasChanges || this.snapshot === null) return false;
    const context = this.context();
    if (context === null) return false;
    const revision = this.snapshot.revision;
    const patch: ThreadPermissionsPatch = { approvalsReviewer: this.approvalsReviewer };
    if (this.snapshot.canChangeAccess) {
      patch.filesystem = this.filesystem;
      patch.networkAccess = this.networkAccess;
    }
    const sequence = ++this.sequence;
    this.isSaving = true;
    this.error = null;
    this.didSave = false;
    try {
      const snapshot = await this.root.request<ThreadPermissionsSnapshot>({
        type: "threadPermissions.change", context, revision, patch
      });
      if (sequence !== this.sequence || !this.matches(context)) return false;
      runInAction(() => {
        this.apply(snapshot, context);
        this.didSave = true;
      });
      return true;
    } catch (error) {
      if (sequence === this.sequence) runInAction(() => {
        this.snapshot = null;
        this.error = readChatErrorMessage(error);
      });
      return false;
    } finally {
      if (sequence === this.sequence) runInAction(() => { this.isSaving = false; });
    }
  }

  /** Captures primitives instead of passing an observable thread through IPC. */
  private context(): ThreadPermissionsContext | null {
    if (this.chat.sourceId === null) return null;
    return { threadId: this.chat.thread.id, sourceId: this.chat.sourceId };
  }

  /** Rejects results delivered after a source or thread identity change. */
  private matches(context: ThreadPermissionsContext): boolean {
    return context.threadId === this.chat.thread.id && context.sourceId === this.chat.sourceId;
  }

  /** Copies the effective result into observable state only after checking its identity. */
  private apply(snapshot: ThreadPermissionsSnapshot, context: ThreadPermissionsContext): void {
    if (snapshot === undefined || snapshot === null || snapshot.threadId !== context.threadId
      || snapshot.sourceId !== context.sourceId || typeof snapshot.revision !== "string") {
      throw new Error("Invalid effective conversation permissions.");
    }
    this.snapshot = snapshot;
    if (snapshot.filesystem !== "custom") this.filesystem = snapshot.filesystem;
    this.networkAccess = snapshot.networkAccess === true;
    this.approvalsReviewer = snapshot.approvalsReviewer;
  }
}
