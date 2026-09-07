import { writeWorkspacePermissionConfiguration } from "./workspacePermissionConfiguration.js";
import { isDeepStrictEqual } from "node:util";
import type { OpenCodexCacheRepository, WorkspaceTransitionRecord } from "@open-codex-ui/opencodex-cache";
import { buildManagedPermissionProfile } from
  "../projects/projectContextConfig.js";
import type { ClientPort } from "../runtime/runtimePorts.js";
import type { WorkspaceResumeExpectation } from "./workspaceResumeVerification.js";
import { workspacePermissionInput } from "./workspacePermissionProfile.js";

/** Approval settings must come from the validated source context, never UI-supplied defaults. */
export type WorkspaceApprovalContext = Pick<WorkspaceResumeExpectation, "approvalPolicy" | "approvalsReviewer">;

/** Writes and checks a destination-specific managed policy without changing project preferences. */
export class WorkspacePermissionPreparation {
  /** Uses the existing source-aware filesystem RPC boundary and persisted project context folders. */
  constructor(
    private readonly repository: OpenCodexCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">
  ) {}

  /**
   * Requires an existing transition reservation and prior lifecycle/source-policy validation.
   * Does not mark the transition dispatched, resume threads, or establish process inactivity.
   */
  async prepare(
    transition: WorkspaceTransitionRecord,
    approval: WorkspaceApprovalContext
  ): Promise<WorkspaceResumeExpectation> {
    const approvals = structuredClone(approval);
    const stored = await this.repository.workspaces.transitions.getForThread(transition.threadId);
    if (!isDeepStrictEqual(stored, transition)) {
      throw new Error("Workspace permission preparation requires the current durable transition reservation.");
    }
    const project = (await this.repository.listProjects()).find((item) => item.id === transition.projectId);
    if (project === undefined || project.sourceId !== transition.sourceId) {
      throw new Error("Workspace permission source does not own this project.");
    }
    const input = workspacePermissionInput(transition, project.preferences.context?.folders ?? []);
    const profile = buildManagedPermissionProfile(input);
    const configOverrides = { [`permissions.${input.profileId}`]: { ...profile } };
    const expected: WorkspaceResumeExpectation = {
      config: configOverrides, cwd: input.projectPath, runtimeWorkspaceRoots: [input.projectPath],
      activePermissionProfile: { id: input.profileId, extends: ":workspace" },
      sandbox: { type: "workspaceWrite", networkAccess: false,
        excludeTmpdirEnvVar: true, excludeSlashTmp: true,
        writableRoots: input.externalFolders.filter((folder) => folder.permission === "write")
          .map((folder) => folder.path) },
      ...approvals
    };
    if (transition.expectationJson !== null && JSON.stringify(expected) !== transition.expectationJson) {
      throw new Error("Workspace permission contract changed; refusing to overwrite the recovery configuration.");
    }
    const client = await this.clients.ensureClient(transition.sourceId);
    await writeWorkspacePermissionConfiguration(client, input);
    return expected;
  }
}
