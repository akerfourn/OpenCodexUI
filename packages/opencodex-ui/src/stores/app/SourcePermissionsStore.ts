import { makeAutoObservable, runInAction } from "mobx";
import type { SourcePermissionValues, SourcePermissionsPatch,
  SourcePermissionsSnapshot } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import { readChatErrorMessage } from "../chat/chatErrorMessage";

/** Keeps one source's native defaults separate from connection edits and conversation permissions. */
export class SourcePermissionsStore {
  /** Last confirmed native defaults and editing capabilities. */
  snapshot: SourcePermissionsSnapshot | null = null;
  /** Selections remain local until Apply is pressed. */
  values: SourcePermissionValues = {
    filesystem: "inherited", networkAccess: null, approvalPolicy: "inherited", approvalsReviewer: "inherited"
  };
  /** Whether a fresh native read is pending. */
  isLoading = false;
  /** Whether an explicit mutation is pending. */
  isSaving = false;
  /** Last read or application failure. */
  error: string | null = null;
  /** Only a reread confirmed by Codex produces a success message. */
  didSave = false;

  /** Binds all requests to this source, independently of Home's current selection. */
  constructor(private readonly root: RootStore, readonly sourceId: string) {
    makeAutoObservable<SourcePermissionsStore, "root">(this, { root: false, sourceId: false }, { autoBind: true });
  }

  /** Whether controls have a usable confirmed snapshot. */
  get canEdit(): boolean { return this.snapshot !== null && !this.isLoading && !this.isSaving; }
  /** Whether at least one supported selection differs from the confirmed defaults. */
  get hasChanges(): boolean { return Object.keys(this.patch()).length > 0; }

  /** Records a form choice without writing to Codex. */
  setValue<Key extends keyof SourcePermissionValues>(key: Key, value: SourcePermissionValues[Key]): void {
    this.values[key] = value;
    this.didSave = false;
  }

  /** Reads native configuration only when the permissions panel is opened or refreshed. */
  async load(): Promise<void> {
    if (this.isLoading || this.isSaving) return;
    this.isLoading = true;
    this.snapshot = null;
    this.error = null;
    this.didSave = false;
    try {
      const snapshot = await this.root.request<SourcePermissionsSnapshot>({ type: "sourcePermissions.read", sourceId: this.sourceId });
      runInAction(() => { this.apply(snapshot); });
    } catch (error) {
      runInAction(() => { this.error = readChatErrorMessage(error); });
    } finally {
      runInAction(() => { this.isLoading = false; });
    }
  }

  /** Sends only changed primitives; failures require a fresh snapshot before another save. */
  async save(): Promise<boolean> {
    if (!this.canEdit || !this.hasChanges || this.snapshot === null) return false;
    const revision = this.snapshot.revision;
    const patch = this.patch();
    this.isSaving = true;
    this.error = null;
    this.didSave = false;
    try {
      const snapshot = await this.root.request<SourcePermissionsSnapshot>({
        type: "sourcePermissions.change", sourceId: this.sourceId, revision, patch
      });
      runInAction(() => {
        this.apply(snapshot);
        this.didSave = true;
      });
      return true;
    } catch (error) {
      runInAction(() => {
        this.snapshot = null;
        this.error = readChatErrorMessage(error);
      });
      return false;
    } finally {
      runInAction(() => { this.isSaving = false; });
    }
  }

  /** Clones chosen primitives so observable state never crosses IPC. */
  private patch(): SourcePermissionsPatch {
    const snapshot = this.snapshot;
    if (snapshot === null) return {};
    const { filesystem, networkAccess, approvalPolicy, approvalsReviewer } = this.values;
    const patch: SourcePermissionsPatch = {};
    if (snapshot.editable.filesystem && filesystem !== snapshot.filesystem
      && (filesystem === "read-only" || filesystem === "workspace-write")) patch.filesystem = filesystem;
    if (snapshot.editable.approvalPolicy && approvalPolicy !== snapshot.approvalPolicy
      && (approvalPolicy === "on-request" || approvalPolicy === "untrusted" || approvalPolicy === "never")) {
      patch.approvalPolicy = approvalPolicy;
    }
    if (snapshot.editable.approvalsReviewer && approvalsReviewer !== snapshot.approvalsReviewer
      && (approvalsReviewer === "user" || approvalsReviewer === "auto_review")) patch.approvalsReviewer = approvalsReviewer;
    if (snapshot.editable.networkAccess && filesystem === "workspace-write" && typeof networkAccess === "boolean"
      && (networkAccess !== snapshot.networkAccess || patch.filesystem === "workspace-write")) {
      patch.networkAccess = networkAccess;
      if (snapshot.profileId !== null && snapshot.editable.filesystem) patch.filesystem = "workspace-write";
    }
    return patch;
  }

  /** Checks returned identity before replacing the form with confirmed native values. */
  private apply(snapshot: SourcePermissionsSnapshot): void {
    if (snapshot === null || snapshot === undefined || snapshot.sourceId !== this.sourceId
      || typeof snapshot.revision !== "string" || typeof snapshot.configPath !== "string") {
      throw new Error("Invalid source permission response.");
    }
    this.snapshot = snapshot;
    this.values = { filesystem: snapshot.filesystem, networkAccess: snapshot.networkAccess ?? false,
      approvalPolicy: snapshot.approvalPolicy, approvalsReviewer: snapshot.approvalsReviewer };
  }
}
