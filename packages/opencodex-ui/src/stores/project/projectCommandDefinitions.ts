import type {
  OpenCodexCommandExecutionMode,
  OpenCodexProjectCommand
} from "@open-codex-ui/opencodex-protocol";

/** Editable project command form shape. */
export type ProjectCommandFormInput = {
  name: string;
  command: string;
  executionMode: OpenCodexCommandExecutionMode;
  persistLogs: boolean;
};

/** Orders known commands once by requested IDs, then retains unmentioned commands in order. */
export function orderCommandsByIds(
  commands: OpenCodexProjectCommand[],
  commandIds: string[]
): OpenCodexProjectCommand[] {
  const commandsById = new Map(commands.map((command) => [command.id, command]));
  const orderedCommands: OpenCodexProjectCommand[] = [];

  for (const commandId of commandIds) {
    const command = commandsById.get(commandId);

    if (command !== undefined) {
      orderedCommands.push(command);
      commandsById.delete(commandId);
    }
  }

  return [...orderedCommands, ...commandsById.values()];
}

/** Compares command identities and order without treating metadata changes as reordering. */
export function haveSameCommandOrder(
  currentCommands: OpenCodexProjectCommand[],
  nextCommands: OpenCodexProjectCommand[]
): boolean {
  if (currentCommands.length !== nextCommands.length) {
    return false;
  }

  return currentCommands.every((command, index) => command.id === nextCommands[index]?.id);
}

/** Copies editable fields and trims command text before persistence. */
export function normalizeCommandFormInput(input: ProjectCommandFormInput): ProjectCommandFormInput {
  return {
    name: input.name.trim(),
    command: input.command.trim(),
    executionMode: input.executionMode,
    persistLogs: input.persistLogs
  };
}
