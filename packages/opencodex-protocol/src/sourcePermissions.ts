/** User-level defaults, distinct from any existing conversation's settings. */
export interface SourcePermissionValues {
  filesystem: "read-only" | "workspace-write" | "custom" | "inherited";
  networkAccess: boolean | null;
  approvalPolicy: "on-request" | "untrusted" | "never" | "custom" | "inherited";
  approvalsReviewer: "user" | "auto_review" | "inherited";
}

/** Only explicitly selected defaults cross the transport boundary. */
export interface SourcePermissionsPatch {
  filesystem?: "read-only" | "workspace-write";
  networkAccess?: boolean;
  approvalPolicy?: "on-request" | "untrusted" | "never";
  approvalsReviewer?: "user" | "auto_review";
}

/** Native configuration identity and administrator-constrained choices. */
export interface SourcePermissionsSnapshot extends SourcePermissionValues {
  sourceId: string;
  configPath: string;
  revision: string;
  profileId: string | null;
  writableRoots: string[];
  editable: Record<keyof SourcePermissionValues, boolean>;
  allowedFilesystems: ("read-only" | "workspace-write")[];
  allowedPolicies: ("on-request" | "untrusted" | "never")[];
  allowedReviewers: ("user" | "auto_review")[];
  sharedSourceIds: string[];
}

/** The renderer identifies a source and never chooses a configuration file path. */
export type SourcePermissionsRequest =
  | { type: "sourcePermissions.read"; sourceId: string }
  | { type: "sourcePermissions.change"; sourceId: string; revision: string; patch: SourcePermissionsPatch };
