/** Covers project goal grouping and the default collapsed state for other chats. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OpenCodexProjectGoal } from "@open-codex-ui/opencodex-protocol";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { chat?: string }) => options?.chat === undefined
      ? key
      : `${key}:${options.chat}`
  })
}));

import { ProjectGoalSections } from "../src/components/projects/ProjectGoalSections";
import { groupProjectGoals } from "../src/components/projects/projectGoalSections";

describe("ProjectGoalSections", () => {
  it("should split current, unassigned, and other-chat goals", () => {
    const goals = [
      createGoal("current", "chat-current"),
      createGoal("unassigned", null),
      createGoal("other", "chat-other")
    ];

    const groups = groupProjectGoals(goals, "chat-current");

    expect(groups.currentChat.map((goal) => goal.id)).toEqual(["current"]);
    expect(groups.unassigned.map((goal) => goal.id)).toEqual(["unassigned"]);
    expect(groups.otherChats.map((goal) => goal.id)).toEqual(["other"]);
  });

  it("should keep other-chat goals collapsed by default", () => {
    const markup = renderToStaticMarkup(
      <ProjectGoalSections
        goals={[
          createGoal("current", "chat-current"),
          createGoal("unassigned", null),
          createGoal("other", "chat-other")
        ]}
        currentChatId="chat-current"
        currentChatTitle="Current chat"
        disabled={false}
        onOpen={vi.fn()}
        onLaunch={vi.fn()}
        onPause={vi.fn()}
        onArchive={vi.fn()}
        onUnarchive={vi.fn()}
      />
    );

    expect(markup).toContain("goals.currentChatSection:Current chat");
    expect(markup).toContain("Current");
    expect(markup).toContain("Unassigned");
    expect(markup).toContain("goals.otherChatsSection");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup.match(/project-goal-row/gu)).toHaveLength(2);
  });
});

/** Creates a complete goal fixture for grouping and rendering tests. */
function createGoal(id: string, threadId: string | null): OpenCodexProjectGoal {
  return {
    id,
    projectId: "project-1",
    name: id === "current" ? "Current" : id === "unassigned" ? "Unassigned" : "Other",
    objective: "Prepare the project.",
    tokenBudget: null,
    status: "draft",
    isArchived: false,
    sourceId: null,
    threadId,
    workspaceId: null,
    cwd: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    launchedAt: null,
    pausedAt: null,
    completedAt: null,
    archivedAt: null,
    lastSyncedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
