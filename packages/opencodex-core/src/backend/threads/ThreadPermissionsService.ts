import { createHash } from "node:crypto";
import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type { v2 } from "@open-codex-ui/codex-rpc";
import type { OpenCodexProjectWorkspace, ThreadPermissionsRequest,
  ThreadPermissionsSnapshot } from "@open-codex-ui/opencodex-protocol";

import type { ClientPort } from "../runtime/runtimePorts.js";
import type { WorkspaceExecutionService } from "../workspaces/WorkspaceExecutionService.js";

/** Reads effective settings and applies explicit changes to one idle, source-owned chat. */
export class ThreadPermissionsService {
  /** Uses the same thread gate as execution and workspace selection. */
  constructor(
    private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly execution: Pick<WorkspaceExecutionService, "runThreadConfiguration"> | undefined
  ) {}

  /** Leaves global defaults, custom profiles, workspace identity and conversation history intact. */
  async execute(request: ThreadPermissionsRequest): Promise<ThreadPermissionsSnapshot> {
    const { threadId, sourceId } = request.context;
    if (typeof threadId !== "string" || threadId.trim().length === 0
      || typeof sourceId !== "string" || sourceId.trim().length === 0) {
      throw new Error("Conversation permissions require an explicit thread and source.");
    }
    if (this.execution === undefined) {
      throw new Error("Conversation permissions require a synchronized workspace.");
    }
    return await this.execution.runThreadConfiguration(threadId, sourceId, async (workspace) => {
      const client = await this.clients.ensureClient(sourceId);
      const current = await client.resumeThread(threadId, { excludeTurns: true });
      const config = await client.request<v2.ConfigReadResponse>("config/read", { cwd: workspace.path });
      const snapshot = describePermissions(current, workspace, threadId, config.config.default_permissions);
      if (request.type === "threadPermissions.read") return snapshot;

      if (typeof request.revision !== "string" || request.revision !== snapshot.revision) {
        throw new Error("Conversation permissions changed. Refresh before applying your selections.");
      }
      const patch = request.patch;
      if ((patch.filesystem !== undefined && patch.filesystem !== "read-only" && patch.filesystem !== "workspace-write")
        || (patch.networkAccess !== undefined && typeof patch.networkAccess !== "boolean")
        || (patch.approvalsReviewer !== "user" && patch.approvalsReviewer !== "auto_review")) {
        throw new Error("Unsupported conversation permission selection.");
      }
      const filesystem = patch.filesystem ?? snapshot.filesystem;
      const networkAccess = patch.networkAccess ?? snapshot.networkAccess;
      const accessChanged = filesystem !== snapshot.filesystem || networkAccess !== snapshot.networkAccess;
      if (accessChanged && !snapshot.canChangeAccess) {
        throw new Error("This workspace uses a protected or custom access profile. Its access cannot be replaced here.");
      }
      const params: v2.ThreadSettingsUpdateParams = { threadId, approvalsReviewer: patch.approvalsReviewer };
      if (accessChanged) {
        if (typeof networkAccess !== "boolean") throw new Error("Unsupported network permission selection.");
        if (filesystem === "read-only") {
          params.sandboxPolicy = { type: "readOnly", networkAccess };
        } else if (current.sandbox.type === "workspaceWrite") {
          params.sandboxPolicy = { ...current.sandbox, writableRoots: [...current.sandbox.writableRoots],
            networkAccess };
        } else {
          params.sandboxPolicy = { type: "workspaceWrite", writableRoots: [], networkAccess,
            excludeTmpdirEnvVar: true, excludeSlashTmp: true };
        }
      }
      await client.request<v2.ThreadSettingsUpdateResponse>("thread/settings/update", params);
      // The update response is empty: only a fresh native snapshot confirms success.
      const confirmed = describePermissions(await client.resumeThread(threadId, { excludeTurns: true }),
        workspace, threadId, config.config.default_permissions);
      if (confirmed.approvalsReviewer !== patch.approvalsReviewer
        || (accessChanged && (confirmed.filesystem !== filesystem || confirmed.networkAccess !== networkAccess))) {
        throw new Error("Codex did not confirm the requested permissions. Refresh the effective settings.");
      }
      return confirmed;
    });
  }
}

/** Maps the native response while retaining a revision of every security-relevant setting. */
function describePermissions(
  response: v2.ThreadResumeResponse, workspace: OpenCodexProjectWorkspace, threadId: string,
  configuredProfile: unknown
): ThreadPermissionsSnapshot {
  if (workspace.sourceId === null || response.thread.id !== threadId
    || normalizeProjectPath(response.cwd) !== normalizeProjectPath(workspace.path)) {
    throw new Error("Codex resumed a different conversation or workspace. Refresh before changing permissions.");
  }
  if (response.thread.canAcceptDirectInput === false || response.thread.status.type !== "idle") {
    throw new Error("Wait until the conversation is idle before managing its permissions.");
  }
  if (response.approvalsReviewer !== "user" && response.approvalsReviewer !== "auto_review") {
    throw new Error("Codex returned an unsupported approval reviewer.");
  }
  const sandbox = response.sandbox;
  let filesystem: ThreadPermissionsSnapshot["filesystem"] = "custom";
  let networkAccess: boolean | null = null;
  if (sandbox.type === "readOnly" || sandbox.type === "workspaceWrite") {
    filesystem = sandbox.type === "readOnly" ? "read-only" : "workspace-write";
    networkAccess = sandbox.networkAccess;
    if (typeof networkAccess !== "boolean") throw new Error("Codex did not report effective network permissions.");
  }
  const profileId = response.activePermissionProfile?.id ?? null;
  const canChangeAccess = workspace.isPrimary && filesystem !== "custom"
    && isBuiltinProfile(profileId) && isBuiltinProfile(configuredProfile);
  const revision = createHash("sha256").update(JSON.stringify({
    threadId, sourceId: workspace.sourceId, cwd: response.cwd, sandbox,
    activeProfile: response.activePermissionProfile, policy: response.approvalPolicy,
    reviewer: response.approvalsReviewer, canChangeAccess
  })).digest("hex");
  return {
    threadId, sourceId: workspace.sourceId, cwd: response.cwd, profileId,
    filesystem, networkAccess, approvalsReviewer: response.approvalsReviewer,
    approvalPolicy: typeof response.approvalPolicy === "string"
      ? response.approvalPolicy : JSON.stringify(response.approvalPolicy),
    canChangeAccess, revision
  };
}

/** Custom named profiles are not safely represented by the simplified access editor. */
function isBuiltinProfile(value: unknown): boolean {
  return value === undefined || value === null || value === ":read-only" || value === ":workspace";
}
