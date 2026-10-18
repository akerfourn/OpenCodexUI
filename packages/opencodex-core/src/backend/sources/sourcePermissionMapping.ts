import { createHash } from "node:crypto";
import type { v2 } from "@open-codex-ui/codex-rpc";
import type { SourcePermissionsPatch, SourcePermissionsSnapshot } from "@open-codex-ui/opencodex-protocol";

/** Finds the base user file without interpreting source paths on the Electron host. */
export function userConfigLayer(response: v2.ConfigReadResponse): v2.ConfigLayer {
  const layer = response.layers?.find(item => item.name.type === "user"
    && (item.name.profile === null || item.name.profile === undefined));
  if (layer === undefined || layer.name.type !== "user" || layer.name.file.length === 0
    || typeof layer.version !== "string" || layer.version.length === 0
    || (layer.disabledReason !== null && layer.disabledReason !== undefined)) {
    throw new Error("Codex did not expose an editable user configuration. Check the source configuration.");
  }
  return layer;
}

/** Reads nullable configured defaults honestly instead of guessing effective per-project permissions. */
export function describeSourcePermissions(sourceId: string, response: v2.ConfigReadResponse,
  requirements: v2.ConfigRequirements | null, sourceSettings: unknown): SourcePermissionsSnapshot {
  const layer = userConfigLayer(response);
  if (layer.name.type !== "user") throw new Error("Missing user configuration.");
  const config = response.config;
  const profileId = typeof config.default_permissions === "string" ? config.default_permissions : null;
  let filesystem: SourcePermissionsSnapshot["filesystem"] = "inherited";
  const mode = config.sandbox_mode;
  if (mode === "read-only" || mode === "workspace-write") filesystem = mode;
  else if (mode !== null && mode !== undefined) filesystem = "custom";
  else if (profileId === ":read-only") filesystem = "read-only";
  else if (profileId === ":workspace") filesystem = "workspace-write";
  else if (profileId !== null) filesystem = "custom";
  let approvalPolicy: SourcePermissionsSnapshot["approvalPolicy"] = "inherited";
  if (config.approval_policy === "on-request" || config.approval_policy === "untrusted" || config.approval_policy === "never") {
    approvalPolicy = config.approval_policy;
  } else if (config.approval_policy !== null && config.approval_policy !== undefined) approvalPolicy = "custom";
  let approvalsReviewer: SourcePermissionsSnapshot["approvalsReviewer"] = "inherited";
  if (config.approvals_reviewer === "user" || config.approvals_reviewer === "auto_review") {
    approvalsReviewer = config.approvals_reviewer;
  } else if (config.approvals_reviewer !== null && config.approvals_reviewer !== undefined) {
    throw new Error("Codex returned an unsupported approval reviewer.");
  }
  const customProfile = profileId !== null && profileId !== ":read-only" && profileId !== ":workspace";
  const protectedAccess = customProfile || filesystem === "custom" || requirements?.allowedPermissionProfiles != null
    || requirements?.defaultPermissions != null;
  const allowedFilesystems = (["read-only", "workspace-write"] as const).filter(value =>
    requirements?.allowedSandboxModes == null || requirements.allowedSandboxModes.includes(value));
  const allowedPolicies = (["on-request", "untrusted", "never"] as const).filter(value =>
    requirements?.allowedApprovalPolicies == null || requirements.allowedApprovalPolicies.includes(value));
  const allowedReviewers = (["user", "auto_review"] as const).filter(value =>
    requirements?.allowedApprovalsReviewers == null || requirements.allowedApprovalsReviewers.includes(value));
  let networkAccess: boolean | null = null;
  if (filesystem === "read-only" || filesystem === "workspace-write") networkAccess = false;
  if (mode === "workspace-write") networkAccess = config.sandbox_workspace_write?.network_access ?? false;
  return {
    sourceId, configPath: layer.name.file, profileId, filesystem, approvalPolicy, approvalsReviewer, networkAccess,
    writableRoots: [...(config.sandbox_workspace_write?.writable_roots ?? [])],
    editable: {
      filesystem: !protectedAccess && allowedFilesystems.length > 0 && !isOverridden(response, "sandbox_mode")
        && !isOverridden(response, "default_permissions"),
      networkAccess: !protectedAccess && allowedFilesystems.includes("workspace-write")
        && !isOverridden(response, "sandbox_workspace_write.network_access")
        && !isOverridden(response, "sandbox_mode") && !isOverridden(response, "default_permissions"),
      approvalPolicy: allowedPolicies.length > 0 && !isOverridden(response, "approval_policy"),
      approvalsReviewer: allowedReviewers.length > 0 && !isOverridden(response, "approvals_reviewer")
    },
    allowedFilesystems, allowedPolicies, allowedReviewers, sharedSourceIds: [],
    revision: createHash("sha256").update(JSON.stringify(sortConfiguration({ sourceId, response, requirements, sourceSettings }))).digest("hex")
  };
}

/** Native maps have no stable key order across reads; revisions compare their content instead. */
function sortConfiguration(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortConfiguration);
  if (value === null || typeof value !== "object") return value;
  const result: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(value).sort()) result[key] = sortConfiguration((value as Record<string, unknown>)[key]);
  return result;
}

/** Prevents pretending that base-user writes can replace higher-priority values. */
function isOverridden(response: v2.ConfigReadResponse, key: string): boolean {
  const rootKey = key.split(".")[0] ?? key;
  const origin = response.origins[key] ?? response.origins[rootKey];
  if (origin === undefined) return false;
  if (origin.name.type === "user") return origin.name.profile != null;
  return origin.name.type !== "system";
}

/** Builds a small atomic edit list while preserving unrelated keys, roots and custom profiles. */
export function sourcePermissionEdits(snapshot: SourcePermissionsSnapshot, patch: SourcePermissionsPatch): v2.ConfigEdit[] {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Invalid permission selection.");
  const edits: v2.ConfigEdit[] = [];
  for (const key of Object.keys(patch)) {
    if (key !== "filesystem" && key !== "networkAccess" && key !== "approvalPolicy" && key !== "approvalsReviewer") {
      throw new Error("Unsupported permission setting.");
    }
    const value = patch[key];
    if (value === undefined) continue;
    if (!snapshot.editable[key]) throw new Error("This permission is controlled by a custom profile or another configuration layer.");
    let keyPath: string;
    if (key === "filesystem") {
      if (!snapshot.allowedFilesystems.includes(value as "read-only" | "workspace-write")) throw new Error("Unsupported filesystem default.");
      keyPath = "sandbox_mode";
    } else if (key === "approvalPolicy") {
      if (!snapshot.allowedPolicies.includes(value as "on-request" | "untrusted" | "never")) throw new Error("Unsupported approval policy.");
      keyPath = "approval_policy";
    } else if (key === "approvalsReviewer") {
      if (!snapshot.allowedReviewers.includes(value as "user" | "auto_review")) throw new Error("Unsupported approval reviewer.");
      keyPath = "approvals_reviewer";
    } else {
      if (typeof value !== "boolean" || (patch.filesystem ?? snapshot.filesystem) !== "workspace-write") {
        throw new Error("Network defaults require workspace-write access.");
      }
      if (snapshot.profileId !== null && patch.filesystem === undefined) {
        throw new Error("Select an explicit filesystem default before replacing a built-in permission profile.");
      }
      keyPath = "sandbox_workspace_write.network_access";
    }
    edits.push({ keyPath, value, mergeStrategy: "upsert" });
  }
  if (edits.length === 0) throw new Error("Select at least one permission to change.");
  return edits;
}
