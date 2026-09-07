import { isDeepStrictEqual } from "node:util";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";

/** Response contract exposed by the public RPC client, without importing generated internals. */
export type WorkspaceResumeResponse = Awaited<ReturnType<CodexAppServerClient["resumeThread"]>>;

/** Expected projection supplied by the backend that prepared the destination configuration. */
export interface WorkspaceResumeExpectation {
  /** Explicit managed profile definition; forces config mismatch detection during warm resume. */
  config?: NonNullable<Parameters<CodexAppServerClient["resumeThread"]>[1]>["config"];
  /** Absolute directory in the source's filesystem, not the Electron host's filesystem. */
  cwd: string;
  /** Exact runtime roots requested for this transition. */
  runtimeWorkspaceRoots: string[];
  /** Named profile and provenance expected after configuration reload. */
  activePermissionProfile: NonNullable<WorkspaceResumeResponse["activePermissionProfile"]>;
  /** Expected compatibility projection, including external roots and network/tmp permissions. */
  sandbox: Extract<WorkspaceResumeResponse["sandbox"], { type: "workspaceWrite" }>;
  /** Approval decisions must retain the explicitly prepared policy. */
  approvalPolicy: WorkspaceResumeResponse["approvalPolicy"];
  /** Approval routing must also match the prepared context. */
  approvalsReviewer: WorkspaceResumeResponse["approvalsReviewer"];
}

/** Rejects mismatches without treating the compatibility projection as a full filesystem-policy proof. */
export function verifyWorkspaceResume(
  threadId: string,
  expected: WorkspaceResumeExpectation,
  actual: Pick<WorkspaceResumeResponse, "thread" | "cwd" | "runtimeWorkspaceRoots"
    | "activePermissionProfile" | "sandbox" | "approvalPolicy" | "approvalsReviewer">
): void {
  if (actual.thread?.id !== threadId || actual.cwd !== expected.cwd) {
    throw new Error("Codex did not resume the requested thread in the destination directory.");
  }
  if (actual.thread.status?.type !== "idle" || actual.thread.canAcceptDirectInput !== true) {
    throw new Error("Resumed thread is not idle or does not accept direct input.");
  }
  if (!equalRoots(actual.runtimeWorkspaceRoots, expected.runtimeWorkspaceRoots)) {
    throw new Error("Codex retained unexpected runtime workspace roots.");
  }
  if (!isDeepStrictEqual(actual.activePermissionProfile, expected.activePermissionProfile)) {
    throw new Error("Codex did not load the expected workspace permission profile.");
  }
  if (actual.sandbox?.type !== "workspaceWrite"
    || !equalRoots(actual.sandbox.writableRoots, expected.sandbox.writableRoots)
    || actual.sandbox.networkAccess !== expected.sandbox.networkAccess
    || actual.sandbox.excludeTmpdirEnvVar !== expected.sandbox.excludeTmpdirEnvVar
    || actual.sandbox.excludeSlashTmp !== expected.sandbox.excludeSlashTmp) {
    throw new Error("Codex returned an unexpected workspace sandbox policy.");
  }
  if (!isDeepStrictEqual(actual.approvalPolicy, expected.approvalPolicy)
    || actual.approvalsReviewer !== expected.approvalsReviewer) {
    throw new Error("Codex returned an unexpected approval policy or reviewer.");
  }
}

/** Compares roots as sets without resolving source paths on the host or folding case. */
function equalRoots(actual: string[] | undefined, expected: string[]): boolean {
  if (!Array.isArray(actual) || actual.some((root) => typeof root !== "string")) {
    return false;
  }
  return isDeepStrictEqual([...new Set(actual)].sort(), [...new Set(expected)].sort());
}
