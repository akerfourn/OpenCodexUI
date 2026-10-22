import type { WorkspaceExecutionReservation, OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { buildManagedPermissionProfile } from "../projects/projectContextConfig.js";
import { workspacePermissionInput } from "./workspacePermissionProfile.js";
import { writeWorkspacePermissionConfiguration } from "./workspacePermissionConfiguration.js";
import { WorkspaceRemovalRuntime } from "./WorkspaceRemovalRuntime.js";
import { WorkspaceThreadTransition } from "./WorkspaceThreadTransition.js";
import type { WorkspaceResumeExpectation } from "./workspaceResumeVerification.js";

/** Reloads a relocated conversation's managed policy under its execution reservation, before any turn. */
export async function prepareRelocatedThread(repository: OpenCodexCacheRepository,
  clients: Pick<ClientPort, "ensureClient">, reservation: WorkspaceExecutionReservation, previousPath: string,
  writeConfiguration = writeWorkspacePermissionConfiguration): Promise<void> {
  if (reservation.threadId === null) throw new Error("Relocated thread preparation requires a known conversation.");
  const stored = (await repository.workspaces.listReservations(reservation.workspaceId))
    .find(item => item.id === reservation.id && item.state === "preparing");
  if (stored === undefined) throw new Error("Relocated thread preparation requires its execution reservation.");
  const project = (await repository.listProjects()).find(item => item.id === reservation.projectId);
  if (project === undefined || project.sourceId !== reservation.sourceId) throw new Error("Relocated project is unavailable.");
  const runtime = new WorkspaceRemovalRuntime(clients);
  for (const workspacePath of [previousPath, reservation.cwd]) {
    await runtime.requireIdle({ sourceId: reservation.sourceId, workspacePath, projectPath: reservation.cwd });
  }
  const client = await clients.ensureClient(reservation.sourceId);
  // Read the approval contract from Codex; the renderer cannot supply or weaken it.
  const snapshot = await client.resumeThread(reservation.threadId, { cwd: reservation.cwd, excludeTurns: true });
  const profile = snapshot.activePermissionProfile?.id;
  if (snapshot.thread.id !== reservation.threadId || snapshot.thread.status.type !== "idle"
    || snapshot.thread.canAcceptDirectInput !== true || snapshot.sandbox.type !== "workspaceWrite"
    || (profile !== undefined && profile !== ":workspace" && profile !== "opencodex-context"
      && !profile.startsWith("opencodex-workspace-"))) {
    throw new Error("Relocation cannot replace an active, custom or unrestricted conversation policy.");
  }
  const input = workspacePermissionInput({ id: reservation.id, threadId: reservation.threadId,
    projectId: reservation.projectId, sourceId: reservation.sourceId,
    fromWorkspaceId: reservation.workspaceId, toWorkspaceId: reservation.workspaceId,
    fromPath: previousPath, toPath: reservation.cwd, state: "preparing", expectationJson: null },
  project.preferences.context?.folders ?? [], project.preferences.context?.accessScope);
  for (const folder of input.externalFolders) {
    await runtime.requireDirectories({ sourceId: reservation.sourceId, workspacePath: folder.path, projectPath: reservation.cwd });
  }
  await writeConfiguration(client, input);
  const expected: WorkspaceResumeExpectation = {
    cwd: reservation.cwd, runtimeWorkspaceRoots: [reservation.cwd],
    activePermissionProfile: { id: input.profileId, extends: ":workspace" },
    config: { [`permissions.${input.profileId}`]: { ...buildManagedPermissionProfile(input) } },
    sandbox: { type: "workspaceWrite", networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true,
      writableRoots: input.externalFolders.filter(folder => folder.permission === "write").map(folder => folder.path) },
    approvalPolicy: snapshot.approvalPolicy, approvalsReviewer: snapshot.approvalsReviewer
  };
  // Resuming the same durable association is retryable: no turn or selection is dispatched here.
  await new WorkspaceThreadTransition(client).resume(reservation.threadId, expected, async () => undefined);
}
