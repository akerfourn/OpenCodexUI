/** Covers pure turn and item merge value helpers. */
import { describe, expect, it } from "vitest";

import {
  compareTurns,
  mergeTurnItemsPreservingExistingDetails,
  mergeTurnPreservingExistingItems,
  readTurnItemKey
} from "../src/threadTurnMergeValues";

/** Reads the item list from a merged raw turn. */
function readMergedItems(turn: unknown): Record<string, unknown>[] {
  if (typeof turn !== "object" || turn === null || Array.isArray(turn)) {
    return [];
  }

  const items = (turn as { items?: unknown }).items;
  return Array.isArray(items) ? items.filter(isRecord) : [];
}

/** Checks whether an unknown value is a plain object suitable for assertions. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("turn merge values", () => {
  describe("mergeTurnPreservingExistingItems", () => {
    it("should preserve both existing identities after a semantic item match", () => {
      const existingTurn = {
        id: "turn-1",
        items: [
          {
            type: "userMessage",
            id: "user-old",
            call_id: "call-old",
            content: [{ type: "text", text: "Please inspect the project" }],
            locallyEnriched: true
          }
        ]
      };
      const incomingTurn = {
        id: "turn-1",
        items: [
          {
            type: "userMessage",
            id: "user-new",
            call_id: "call-new",
            content: [{ type: "text", text: "Please inspect the project" }],
            serverState: "complete"
          }
        ]
      };

      const [mergedItem] = readMergedItems(
        mergeTurnPreservingExistingItems(existingTurn, incomingTurn)
      );

      expect(mergedItem).toMatchObject({
        id: "user-old",
        call_id: "call-old",
        locallyEnriched: true,
        serverState: "complete"
      });
    });

    it("should match user messages after collapsing surrounding and repeated whitespace", () => {
      const mergedTurn = mergeTurnPreservingExistingItems(
        {
          id: "turn-1",
          items: [
            {
              type: "userMessage",
              id: "user-old",
              content: [
                { type: "text", text: "  Review   the\nimplementation  " },
                { type: "image", url: "attachment://review.png" }
              ]
            }
          ]
        },
        {
          id: "turn-1",
          items: [
            {
              type: "userMessage",
              id: "user-new",
              content: [{ type: "text", text: "Review the implementation" }]
            }
          ]
        }
      );

      expect(readMergedItems(mergedTurn)).toHaveLength(1);
      expect(readMergedItems(mergedTurn)[0]).toMatchObject({ id: "user-old" });
    });

    it("should match agent messages after normalizing text in the same phase", () => {
      const mergedTurn = mergeTurnPreservingExistingItems(
        {
          id: "turn-1",
          items: [
            {
              type: "agentMessage",
              id: "agent-old",
              phase: "commentary",
              text: "  The   answer\ncontains context.  ",
              streamedLocally: true
            }
          ]
        },
        {
          id: "turn-1",
          items: [
            {
              type: "agentMessage",
              id: "agent-new",
              phase: "commentary",
              text: "The answer contains context."
            }
          ]
        }
      );

      expect(readMergedItems(mergedTurn)).toHaveLength(1);
      expect(readMergedItems(mergedTurn)[0]).toMatchObject({
        id: "agent-old",
        streamedLocally: true
      });
    });

    it("should keep agent messages in different phases as separate items", () => {
      const mergedTurn = mergeTurnPreservingExistingItems(
        {
          id: "turn-1",
          items: [
            {
              type: "agentMessage",
              id: "agent-commentary",
              phase: "commentary",
              text: "The answer"
            }
          ]
        },
        {
          id: "turn-1",
          items: [
            {
              type: "agentMessage",
              id: "agent-final",
              phase: "final_answer",
              text: "The answer"
            }
          ]
        }
      );

      expect(readMergedItems(mergedTurn)).toHaveLength(2);
      expect(readMergedItems(mergedTurn).map((item) => item.id)).toEqual([
        "agent-commentary",
        "agent-final"
      ]);
    });

    it("should preserve existing details for empty incoming values but accept zero and false", () => {
      const mergedTurn = mergeTurnPreservingExistingItems(
        {
          id: "turn-1",
          status: "completed",
          note: "keep this note",
          description: "keep this description",
          count: 7,
          enabled: true,
          labels: ["important"],
          items: []
        },
        {
          id: "turn-1",
          status: null,
          note: "",
          description: undefined,
          count: 0,
          enabled: false,
          labels: [],
          items: []
        }
      );

      expect(mergedTurn).toEqual({
        id: "turn-1",
        status: "completed",
        note: "keep this note",
        description: "keep this description",
        count: 0,
        enabled: false,
        labels: ["important"],
        items: []
      });
    });
  });

  describe("mergeTurnItemsPreservingExistingDetails", () => {
    it("should not deduplicate unrelated items that have no identifier", () => {
      const existingItems = [{ type: "commandExecution", command: "pwd" }];
      const incomingItems = [{ type: "commandExecution", command: "pwd" }];

      const mergedItems = mergeTurnItemsPreservingExistingDetails(
        existingItems,
        incomingItems
      );

      expect(mergedItems).toHaveLength(2);
      expect(mergedItems).toEqual([...existingItems, ...incomingItems]);
    });
  });

  describe("compareTurns", () => {
    it("should order turns by numeric timestamps", () => {
      expect(compareTurns({ startedAt: 10 }, { startedAt: 20 }, "a", "b")).toBeLessThan(0);
      expect(compareTurns({ startedAt: 20 }, { startedAt: 10 }, "a", "b")).toBeGreaterThan(0);
    });

    it("should order turns by ISO timestamps", () => {
      expect(
        compareTurns(
          { startedAt: "2026-01-01T00:00:00.000Z" },
          { startedAt: "2026-01-02T00:00:00.000Z" },
          "a",
          "b"
        )
      ).toBeLessThan(0);
    });

    it("should use completedAt when startedAt is unavailable", () => {
      expect(
        compareTurns(
          { completedAt: "2026-01-01T00:00:00.000Z" },
          { completedAt: "2026-01-02T00:00:00.000Z" },
          "a",
          "b"
        )
      ).toBeLessThan(0);
    });

    it("should fall back to identifiers when timestamps are tied or invalid", () => {
      expect(compareTurns({ startedAt: 10 }, { startedAt: 10 }, "turn-a", "turn-b")).toBeLessThan(0);
      expect(
        compareTurns(
          { startedAt: "not-a-date" },
          { completedAt: Number.NaN },
          "turn-a",
          "turn-b"
        )
      ).toBeLessThan(0);
    });
  });

  describe("readTurnItemKey", () => {
    it("should prefer id over call_id and use call_id as the fallback", () => {
      expect(readTurnItemKey({ id: "item-1", call_id: "call-1" })).toBe("item-1");
      expect(readTurnItemKey({ call_id: "call-1" })).toBe("call-1");
      expect(readTurnItemKey({ id: "", call_id: "call-2" })).toBe("call-2");
      expect(readTurnItemKey({})).toBe("");
    });
  });
});
