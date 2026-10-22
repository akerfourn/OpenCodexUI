import type { CachedProjectCommand, OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexWorkspacePreparationInput } from "@open-codex-ui/opencodex-protocol";
import type { v2 } from "@open-codex-ui/codex-rpc";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { readObject } from "../../mapping.js";
import { requireToolWorkspace } from "./workspaceToolContext.js";
import { WorkspaceRemovalRuntime } from "./WorkspaceRemovalRuntime.js";

/** Validates source trust and the reviewed hook without executing or copying anything. */
export async function readWorkspacePreparation(
  repository: OpenCodexCacheRepository,
  clients: Pick<ClientPort, "ensureClient">,
  input: OpenCodexWorkspacePreparationInput
): Promise<CachedProjectCommand> {
  const workspace = await requireToolWorkspace(repository, input.workspaceId, input.projectId);
  if (workspace.sourceId !== input.sourceId || workspace.path !== input.workspacePath) {
    throw new Error("Workspace preparation context changed; reopen the preparation dialog.");
  }
  const project = (await repository.listProjects()).find(item => item.id === input.projectId);
  if (project === undefined || project.sourceId !== input.sourceId) {
    throw new Error("Workspace preparation requires the project's explicit source.");
  }
  const client = await clients.ensureClient(input.sourceId);
  const response = await client.request<v2.ConfigReadResponse>("config/read", { cwd: project.path });
  if (readObject(readObject(response.config.projects)[project.path]).trust_level !== "trusted") {
    throw new Error("Trust the project in its Codex source before preparing a workspace.");
  }
  await new WorkspaceRemovalRuntime(clients).requireDirectories({
    sourceId: input.sourceId, workspacePath: input.workspacePath, projectPath: project.path
  });
  const current = (await repository.listProjects()).find(item => item.id === input.projectId);
  if (current?.sourceId !== input.sourceId || current.path !== project.path) {
    throw new Error("The workspace preparation project changed; reopen the preparation dialog.");
  }
  if (current?.preferences.workspacePreparation?.commandId !== input.command.id) {
    throw new Error("The configured preparation command changed; reopen the preparation dialog.");
  }
  const command = await repository.getProjectCommand(input.command.id);
  const expected = input.command;
  if (command.projectId !== input.projectId || command.command !== expected.command
    || command.name !== expected.name || command.updatedAt !== expected.updatedAt
    || command.executionMode !== expected.executionMode || command.persistLogs !== expected.persistLogs) {
    throw new Error("The preparation command changed; review its new contents before running it.");
  }
  const latest = await requireToolWorkspace(repository, input.workspaceId, input.projectId);
  if (latest.sourceId !== input.sourceId || latest.path !== input.workspacePath) {
    throw new Error("Workspace preparation context changed; reopen the preparation dialog.");
  }
  return { ...command };
}
