import type { v2 } from "@open-codex-ui/codex-rpc";
import { readObject } from "../../mapping.js";
import { verifyWorkspaceResume } from "./workspaceResumeVerification.js";

/** Checks the generated creation policy while leaving new-thread approval defaults to Codex. */
export function verifyWorkspaceThreadCreation(
  response: v2.ThreadStartResponse, parameters: Partial<v2.ThreadStartParams>, cwd: string | null
): void {
  if (parameters.permissions == null) return;
  if (cwd === null) throw new Error("Workspace conversation requires an explicit directory.");
  const profile = readObject(parameters.config?.[`permissions.${parameters.permissions}`]);
  const writableRoots = Object.entries(readObject(profile.filesystem))
    .filter(([key, value]) => value === "write" && !key.includes("*") && !key.startsWith(":"))
    .map(([key]) => key);
  verifyWorkspaceResume(response.thread.id, {
    cwd, runtimeWorkspaceRoots: [cwd],
    activePermissionProfile: { id: parameters.permissions, extends: ":workspace" },
    sandbox: { type: "workspaceWrite", writableRoots, networkAccess: false,
      excludeTmpdirEnvVar: true, excludeSlashTmp: true },
    approvalPolicy: response.approvalPolicy, approvalsReviewer: response.approvalsReviewer
  }, response);
}
