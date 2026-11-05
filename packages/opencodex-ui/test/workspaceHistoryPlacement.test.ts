import { describe, expect, it } from "vitest";
import type { OpenCodexWorkspaceTransitionEvent } from "@open-codex-ui/opencodex-protocol";
import { placeWorkspaceHistory } from "../src/components/messages/workspaceHistoryPlacement";
import { createTurn } from "./chatStore/chatStoreFixtures";

/** Keeps ordered event fixtures small while testing real boundary placement. */
function event(id: string, afterTurnId: string | null): OpenCodexWorkspaceTransitionEvent {
  return { id, afterTurnId, threadId: "thread", projectId: "project", sourceId: "source",
    occurredAt: "2026-11-05T10:00:00Z",
    from: { workspaceId: "A", name: null, isPrimary: true, path: "/A" },
    to: { workspaceId: "B", name: "Feature", isPrimary: false, path: "/B" } };
}

describe("workspace events in the bounded timeline", () => {
  it("should retain several switches between the same two turns in commit order", () => {
    const first = event("outbound", "turn-a");
    const second = { ...event("return", "turn-a"), from: first.to, to: first.from };
    const turns = [createTurn("turn-a", "completed"), createTurn("turn-b", "completed")];
    const groups = placeWorkspaceHistory([first, second], turns, turns.map(turn => turn.id), false);
    expect(groups.get("turn-a")).toEqual([first, second]);
    expect(groups.has("turn-b")).toBe(false);
  });

  it("should not reveal events from older hidden turns until their boundary is visible", () => {
    const turns = [createTurn("old", "completed"), createTurn("recent", "completed")];
    const history = [event("old-event", "old"), event("initial", null)];
    expect(placeWorkspaceHistory(history, turns, ["recent"], true).size).toBe(0);
    const expanded = placeWorkspaceHistory(history, turns, ["old", "recent"], false);
    expect(expanded.get("old")).toHaveLength(1);
    expect(expanded.get(null)).toHaveLength(1);
  });

  it("should position a rolled-back anchor using retained timestamps rather than the current workspace", () => {
    const earlier = { ...createTurn("earlier", "completed"), startedAt: "2026-11-05T09:00:00Z" };
    const later = { ...createTurn("later", "completed"), startedAt: "2026-11-05T11:00:00Z" };
    const history = [event("transition", "rolled-back-turn")];
    expect(placeWorkspaceHistory(history, [earlier, later], ["earlier", "later"], false).get("earlier")).toEqual(history);
  });
});
