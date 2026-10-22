import type { OpenCodexProjectCommand } from "./messages/automation.js";

/** Fixed source, directory and command reviewed before a manual preparation run. */
export interface OpenCodexWorkspacePreparationInput {
  projectId: string;
  workspaceId: string;
  sourceId: string;
  workspacePath: string;
  command: Pick<OpenCodexProjectCommand,
    "id" | "name" | "command" | "executionMode" | "persistLogs" | "updatedAt">;
}
