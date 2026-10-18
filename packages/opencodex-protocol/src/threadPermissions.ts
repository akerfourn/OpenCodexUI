/** Editable access modes supported by the per-conversation permission controls. */
export type ThreadFilesystemAccess = "read-only" | "workspace-write";

/** Source-owned identity; paths and workspace associations are resolved by the backend. */
export interface ThreadPermissionsContext {
  threadId: string;
  sourceId: string;
}

/** Effective native settings, never inferred from global defaults. */
export interface ThreadPermissionsSnapshot extends ThreadPermissionsContext {
  cwd: string;
  profileId: string | null;
  filesystem: ThreadFilesystemAccess | "custom";
  networkAccess: boolean | null;
  approvalsReviewer: "user" | "auto_review";
  approvalPolicy: string;
  canChangeAccess: boolean;
  revision: string;
}

/** Explicit user selections; other native settings remain unchanged. */
export interface ThreadPermissionsPatch {
  filesystem?: ThreadFilesystemAccess;
  networkAccess?: boolean;
  approvalsReviewer: "user" | "auto_review";
}

/** Reads or changes one existing conversation without altering global configuration. */
export type ThreadPermissionsRequest =
  | { type: "threadPermissions.read"; context: ThreadPermissionsContext }
  | { type: "threadPermissions.change"; context: ThreadPermissionsContext;
      revision: string; patch: ThreadPermissionsPatch };
