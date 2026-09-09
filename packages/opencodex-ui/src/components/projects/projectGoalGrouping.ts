/** Provides the ownership groups used by the project goal catalogue. */
import type { OpenCodexProjectGoal } from "@open-codex-ui/opencodex-protocol";

/** Goal groups displayed by the project catalogue. */
export type ProjectGoalGroups = {
  currentChat: OpenCodexProjectGoal[];
  unassigned: OpenCodexProjectGoal[];
  otherChats: OpenCodexProjectGoal[];
};

/**
 * Splits project goals by their chat association while preserving catalogue order.
 *
 * @param goals Goals loaded for one project.
 * @param currentChatId Selected chat identifier, or `null` when no chat is selected.
 * @returns Goals for the current chat, unassigned goals, and goals from other chats.
 */
export function groupProjectGoals(
  goals: OpenCodexProjectGoal[],
  currentChatId: string | null
): ProjectGoalGroups {
  const groups: ProjectGoalGroups = {
    currentChat: [],
    unassigned: [],
    otherChats: []
  };

  for (const goal of goals) {
    if (currentChatId !== null && goal.threadId === currentChatId) {
      groups.currentChat.push(goal);
      continue;
    }

    if (goal.threadId === null) {
      groups.unassigned.push(goal);
      continue;
    }

    groups.otherChats.push(goal);
  }

  return groups;
}
