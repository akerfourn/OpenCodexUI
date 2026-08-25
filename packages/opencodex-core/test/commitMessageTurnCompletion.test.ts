import type { v2 } from "@open-codex-ui/codex-rpc";
import { describe, expect, it } from "vitest";

import { readTurnFailureMessageOrNull } from "../src/backend/commit/commitMessageTurnCompletion";

describe("readTurnFailureMessageOrNull", () => {
  it("should return the Codex error message when generation fails", () => {
    const turn = createTurn({
      status: "failed",
      error: {
        message: "Codex ran out of room in the model's context window.",
        codexErrorInfo: null,
        additionalDetails: null
      }
    });

    expect(readTurnFailureMessageOrNull(turn)).toBe(
      "Codex ran out of room in the model's context window."
    );
  });

  it("should provide a status-specific fallback when Codex has no error message", () => {
    const turn = createTurn({ status: "interrupted", error: null });

    expect(readTurnFailureMessageOrNull(turn)).toBe("Commit message generation interrupted.");
  });

  it("should return null when generation completes successfully", () => {
    const turn = createTurn({ status: "completed", error: null });

    expect(readTurnFailureMessageOrNull(turn)).toBeNull();
  });
});

/** Creates the minimal completed turn needed to verify terminal error handling. */
function createTurn(overrides: Partial<v2.Turn>): v2.Turn {
  return {
    id: "turn-1",
    items: [],
    itemsView: "full",
    status: "completed",
    error: null,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    ...overrides
  };
}
