import type { WorkspaceExecutionReservation } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import { workspacePermissionInput } from "./workspacePermissionProfile.js";
import { buildManagedPermissionProfile } from "../projects/projectContextConfig.js";
import { writeWorkspacePermissionConfiguration } from "./workspacePermissionConfiguration.js";
import path from "node:path";
import type { v2 } from "@open-codex-ui/codex-rpc";
import type { OpenCodexCacheRepository, WorkspaceTransitionRecord } from "@open-codex-ui/opencodex-cache";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { WorkspacePermissionPreparation } from "./WorkspacePermissionPreparation.js";
import type { WorkspaceSelectionPreparation } from "./WorkspaceSelectionService.js";
import type { WorkspaceResumeExpectation } from "./workspaceResumeVerification.js";
import { normalizePermissionPath } from "./workspacePermissionProfile.js";

/** Validates the supported source policy and runtime before enabling production transitions. */
export class WorkspaceRuntimePreparation implements WorkspaceSelectionPreparation {
  /** Reuses the source-local managed permission writer. */
  private readonly permissions: WorkspacePermissionPreparation;

  /** Requires durable project ownership and source-explicit clients. */
  constructor(private readonly repository: OpenCodexCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">) {
    this.permissions = new WorkspacePermissionPreparation(repository, clients);
  }

  /** Materializes an isolated profile under the new conversation's durable reservation. */
  async prepareCreation(reservation: WorkspaceExecutionReservation,
    primary: OpenCodexProjectWorkspace): Promise<Partial<v2.ThreadStartParams>> {
    const stored = (await this.repository.workspaces.listReservations(reservation.workspaceId))
      .find((item) => item.id === reservation.id && item.state === "preparing" && item.threadId === null);
    if (stored === undefined) throw new Error("New conversation preparation requires its durable reservation.");
    const project = (await this.repository.listProjects()).find((item) => item.id === reservation.projectId);
    if (project === undefined || project.sourceId !== reservation.sourceId) {
      throw new Error("New conversation source does not own the project.");
    }
    const folders = project.preferences.context?.folders ?? [];
    const input = workspacePermissionInput({ id: reservation.id, threadId: "",
      projectId: reservation.projectId, sourceId: reservation.sourceId,
      fromWorkspaceId: primary.id, toWorkspaceId: reservation.workspaceId,
      fromPath: primary.path, toPath: reservation.cwd, state: "preparing", expectationJson: null }, folders);
    for (const value of [primary.path, reservation.cwd, ...input.externalFolders.map((folder) => folder.path)]) {
      await this.requireLiteralDirectory(reservation.sourceId, value);
    }
    const client = await this.clients.ensureClient(reservation.sourceId);
    const sourceConfig = await client.request<v2.ConfigReadResponse>("config/read", { cwd: primary.path });
    const configuredProfile = sourceConfig.config.default_permissions;
    const configuredSandbox = sourceConfig.config.sandbox_mode;
    if ((typeof configuredProfile === "string" && configuredProfile !== ":workspace"
        && configuredProfile !== "opencodex-context" && !configuredProfile.startsWith("opencodex-workspace-"))
      || (configuredProfile == null && configuredSandbox != null && configuredSandbox !== "workspace-write")) {
      throw new Error("New workspace conversations cannot replace a custom or read-only source policy.");
    }
    await writeWorkspacePermissionConfiguration(client, input);
    return { permissions: input.profileId, runtimeWorkspaceRoots: [reservation.cwd],
      config: { [`permissions.${input.profileId}`]: { ...buildManagedPermissionProfile(input) } } };
  }

  /** Rejects active sessions and aliases before writing any destination configuration. */
  async requireSupported(transition: WorkspaceTransitionRecord): Promise<void> {
    const client = await this.clients.ensureClient(transition.sourceId);
    const loaded = await client.request<v2.ThreadLoadedListResponse>("thread/loaded/list", { limit: 100 });
    if (loaded.nextCursor !== null || !Array.isArray(loaded.data)) {
      throw new Error("Cannot establish source runtime inactivity: loaded thread inventory is incomplete.");
    }
    for (const threadId of loaded.data) {
      const { thread } = await client.readThread(threadId, false);
      if (thread.id !== threadId || thread.status.type !== "idle") {
        throw new Error("Finish active conversations and sub-agents on this source before switching workspace.");
      }
      if (threadId !== transition.threadId && typeof thread.source === "object"
        && thread.source !== null && "subagent" in thread.source) {
        throw new Error("Close loaded sub-agents before switching their parent's workspace.");
      }
    }
    const project = (await this.repository.listProjects()).find((item) => item.id === transition.projectId);
    if (project === undefined) throw new Error("Workspace project is unavailable.");
    const paths = [transition.fromPath, transition.toPath,
      ...(project.preferences.context?.folders ?? []).filter((folder) => folder.enabled).map((folder) => folder.path)];
    for (const value of paths) await this.requireLiteralDirectory(transition.sourceId, value);
  }

  /** Reads the actual thread approvals; custom policies require an explicit separate migration. */
  async prepare(transition: WorkspaceTransitionRecord): Promise<WorkspaceResumeExpectation> {
    const client = await this.clients.ensureClient(transition.sourceId);
    const snapshot = await client.resumeThread(transition.threadId, { excludeTurns: true });
    if (snapshot.thread.id !== transition.threadId || snapshot.thread.status.type !== "idle"
      || snapshot.thread.canAcceptDirectInput !== true
      || (snapshot.cwd !== transition.fromPath && snapshot.cwd !== transition.toPath)) {
      throw new Error("Thread execution context changed; workspace switching was refused.");
    }
    const profile = snapshot.activePermissionProfile?.id;
    if (snapshot.sandbox.type !== "workspaceWrite"
      || (profile !== undefined && profile !== ":workspace" && profile !== "opencodex-context"
        && !profile.startsWith("opencodex-workspace-"))) {
      throw new Error("Workspace switching requires a workspace policy; custom or unrestricted policies are not replaced.");
    }
    if (transition.expectationJson !== null) {
      const expected = JSON.parse(transition.expectationJson) as WorkspaceResumeExpectation;
      return await this.permissions.prepare(transition, {
        approvalPolicy: expected.approvalPolicy, approvalsReviewer: expected.approvalsReviewer
      });
    }
    return await this.permissions.prepare(transition, {
      approvalPolicy: snapshot.approvalPolicy, approvalsReviewer: snapshot.approvalsReviewer
    });
  }

  /** Checks every ancestor through the source, never through the Electron host filesystem. */
  private async requireLiteralDirectory(sourceId: string, value: string): Promise<void> {
    const client = await this.clients.ensureClient(sourceId);
    let current = normalizePermissionPath(value);
    const api = current.startsWith("/") ? path.posix : path.win32;
    while (true) {
      const metadata = await client.getMetadata(current);
      if (metadata.isDirectory !== true || metadata.isSymlink !== false) {
        throw new Error("Workspace and shared-folder paths must be directories without symbolic-link ancestors.");
      }
      const parent = api.dirname(current);
      if (parent === current) return;
      current = parent;
    }
  }
}
