import { describe, expect, it } from "vitest";

import type { OpenCodexTurn, OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";

import { buildChatTurnStructure } from "../src/stores/chatTurnStructure";

describe("chat turn structure", () => {
  it("should group user messages with their following reasoning items", () => {
    const structure = buildChatTurnStructure(createTurn([
      createItem("user-1", "user", "initial request"),
      createItem("commentary-1", "assistant", "thinking", "commentary"),
      createItem("command-1", "activity", "npm test", null, "commandExecution"),
      createItem("user-2", "user", "extra guidance", null, "steer"),
      createItem("commentary-2", "assistant", "more thinking", "commentary"),
      createItem("final-1", "assistant", "done", "final_answer")
    ]));

    expect(structure.subTurns).toHaveLength(2);
    expect(structure.subTurns[0]?.userMessage?.id).toBe("user-1");
    expect(structure.subTurns[0]?.reasoningItems.map((item) => item.id)).toEqual([
      "commentary-1",
      "command-1"
    ]);
    expect(structure.subTurns[1]?.userMessage?.id).toBe("user-2");
    expect(structure.subTurns[1]?.reasoningItems.map((item) => item.id)).toEqual([
      "commentary-2"
    ]);
    expect(structure.subTurns[1]?.assistantAnswer?.id).toBe("final-1");
    expect(structure.finalAnswer?.id).toBe("final-1");
  });

  it("should preserve orphan reasoning and final-only recovery turns", () => {
    const orphanStructure = buildChatTurnStructure(createTurn([
      createItem("command-1", "activity", "npm test", null, "commandExecution"),
      createItem("final-1", "assistant", "done", "final_answer")
    ]));
    const finalOnlyStructure = buildChatTurnStructure(createTurn([
      createItem("final-1", "assistant", "done", "final_answer")
    ]));

    expect(orphanStructure.subTurns).toHaveLength(1);
    expect(orphanStructure.subTurns[0]?.userMessage).toBeNull();
    expect(orphanStructure.subTurns[0]?.reasoningItems[0]?.id).toBe("command-1");
    expect(orphanStructure.subTurns[0]?.assistantAnswer?.id).toBe("final-1");
    expect(orphanStructure.finalAnswer?.id).toBe("final-1");
    expect(finalOnlyStructure.subTurns).toHaveLength(1);
    expect(finalOnlyStructure.subTurns[0]?.userMessage).toBeNull();
    expect(finalOnlyStructure.subTurns[0]?.assistantAnswer?.id).toBe("final-1");
    expect(finalOnlyStructure.finalAnswer?.id).toBe("final-1");
  });

  it("should treat the last unphased assistant message as a legacy final answer", () => {
    const structure = buildChatTurnStructure(createTurn([
      createItem("user-1", "user", "question"),
      createItem("assistant-1", "assistant", "legacy answer")
    ]));

    expect(structure.subTurns).toHaveLength(1);
    expect(structure.subTurns[0]?.reasoningItems).toHaveLength(0);
    expect(structure.subTurns[0]?.assistantAnswer?.id).toBe("assistant-1");
    expect(structure.finalAnswer?.id).toBe("assistant-1");
  });

  it("should hide empty reasoning payloads and duplicate final commentary", () => {
    const structure = buildChatTurnStructure(createTurn([
      createItem("user-1", "user", "question"),
      createItem("reasoning-1", "activity", JSON.stringify({
        type: "reasoning",
        summary: [],
        content: []
      }), null, "reasoning"),
      createItem("commentary-1", "assistant", "done", "commentary"),
      createItem("final-1", "assistant", "done", "final_answer")
    ]));

    expect(structure.subTurns).toHaveLength(1);
    expect(structure.subTurns[0]?.reasoningItems).toHaveLength(0);
    expect(structure.subTurns[0]?.assistantAnswer?.id).toBe("final-1");
    expect(structure.finalAnswer?.id).toBe("final-1");
  });

  it("should keep final answers before and after steering in the same turn", () => {
    const structure = buildChatTurnStructure(createTurn([
      createItem("user-1", "user", "question"),
      createItem("commentary-1", "assistant", "thinking", "commentary"),
      createItem("final-1", "assistant", "first answer", "final_answer"),
      createItem("steer-1", "user", "extra guidance", null, "steer"),
      createItem("commentary-2", "assistant", "thinking again", "commentary"),
      createItem("final-2", "assistant", "second answer", "final_answer")
    ]));

    expect(structure.subTurns).toHaveLength(2);
    expect(structure.subTurns[0]?.userMessage?.id).toBe("user-1");
    expect(structure.subTurns[0]?.reasoningItems.map((item) => item.id)).toEqual([
      "commentary-1"
    ]);
    expect(structure.subTurns[0]?.assistantAnswer?.id).toBe("final-1");
    expect(structure.subTurns[1]?.userMessage?.id).toBe("steer-1");
    expect(structure.subTurns[1]?.reasoningItems.map((item) => item.id)).toEqual([
      "commentary-2"
    ]);
    expect(structure.subTurns[1]?.assistantAnswer?.id).toBe("final-2");
    expect(structure.finalAnswer?.id).toBe("final-2");
  });

  it("should infer steer kind for additional user messages", () => {
    const structure = buildChatTurnStructure(createTurn([
      createItem("user-1", "user", "question"),
      createItem("final-1", "assistant", "first answer", "final_answer"),
      createItem("user-2", "user", "extra guidance"),
      createItem("final-2", "assistant", "second answer", "final_answer")
    ]));

    expect(structure.subTurns[0]?.userMessage?.kind).toBeUndefined();
    expect(structure.subTurns[1]?.userMessage).toMatchObject({
      id: "user-2",
      kind: "steer"
    });
  });
});

function createTurn(items: OpenCodexTurnItem[]): OpenCodexTurn {
  return {
    id: "turn-1",
    threadId: "thread-1",
    status: "completed",
    startedAt: null,
    completedAt: null,
    durationMs: null,
    items
  };
}

function createItem(
  id: string,
  role: OpenCodexTurnItem["role"],
  content: string,
  phase: OpenCodexTurnItem["phase"] = null,
  kind?: string
): OpenCodexTurnItem {
  return {
    id,
    role,
    content,
    status: "completed",
    createdAt: null,
    phase,
    kind
  };
}
