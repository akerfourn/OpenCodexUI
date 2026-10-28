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
  groupName?: string | null;
  isFavorite?: boolean;
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
    ...(input.groupName === undefined ? {} : { groupName: input.groupName?.trim() || null }),
    ...(input.isFavorite === undefined ? {} : { isFavorite: input.isFavorite }),
    name: input.name.trim(),
    command: input.command.trim(),
    executionMode: input.executionMode,
    persistLogs: input.persistLogs
  };
}

/** Matches visible ordering sections; favoriting preserves membership without duplicating the command. */
export function sameCommandSection(first: OpenCodexProjectCommand, second: OpenCodexProjectCommand): boolean {
  if (first.isFavorite === true || second.isFavorite === true) return first.isFavorite === true && second.isFavorite === true;
  return (first.groupName ?? null) === (second.groupName ?? null);
}

/** Partitions commands once, preserving saved ordering inside each displayed section. */
export function commandSections(commands: OpenCodexProjectCommand[]): {
  favorites: OpenCodexProjectCommand[];
  ungrouped: OpenCodexProjectCommand[];
  groups: Array<{ name: string; commands: OpenCodexProjectCommand[] }>;
} {
  const favorites: OpenCodexProjectCommand[] = [];
  const ungrouped: OpenCodexProjectCommand[] = [];
  const groups = new Map<string, OpenCodexProjectCommand[]>();
  for (const command of commands) {
    if (command.isFavorite === true) favorites.push(command);
    else if (command.groupName == null) ungrouped.push(command);
    else {
      const entries = groups.get(command.groupName) ?? [];
      entries.push(command);
      groups.set(command.groupName, entries);
    }
  }
  return { favorites, ungrouped, groups: [...groups].map(([name, entries]) => ({ name, commands: entries })) };
}
