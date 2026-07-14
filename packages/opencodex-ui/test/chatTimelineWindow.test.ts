/**
 * Covers the bounded initial and incremental chat timeline windows.
 */
import { describe, expect, it } from "vitest";

import {
  getVisibleTurns,
  INITIAL_VISIBLE_TURN_COUNT,
  resolveRestoredVisibleTurnCount,
  TURN_WINDOW_INCREMENT
} from "../src/components/messages/chatTimelineWindow";

describe("chat timeline window", () => {
  it("should render only the most recent turns in the first frame", () => {
    const turns = createTurns(25);

    const visibleTurns = getVisibleTurns(turns, INITIAL_VISIBLE_TURN_COUNT);

    expect(visibleTurns).toEqual(createTurns(10, 15));
  });

  it("should preserve a short source collection without copying it", () => {
    const turns = createTurns(5);

    const visibleTurns = getVisibleTurns(turns, INITIAL_VISIBLE_TURN_COUNT);

    expect(visibleTurns).toBe(turns);
  });

  it("should reveal older turns by one bounded increment", () => {
    const turns = createTurns(25);
    const visibleTurnCount = INITIAL_VISIBLE_TURN_COUNT + TURN_WINDOW_INCREMENT;

    const visibleTurns = getVisibleTurns(turns, visibleTurnCount);

    expect(visibleTurns).toEqual(createTurns(20, 5));
  });

  it("should include turns received while restoring a reading window", () => {
    const visibleTurnCount = resolveRestoredVisibleTurnCount(20, 25, 28);

    expect(visibleTurnCount).toBe(23);
  });

  it("should keep the first frame bounded when no wider window was saved", () => {
    const visibleTurnCount = resolveRestoredVisibleTurnCount(10, 25, 25);

    expect(visibleTurnCount).toBe(INITIAL_VISIBLE_TURN_COUNT);
  });

  it("should clamp a restored reading window to the available turns", () => {
    const visibleTurnCount = resolveRestoredVisibleTurnCount(20, 25, 8);

    expect(visibleTurnCount).toBe(8);
  });
});

/**
 * Creates deterministic chronological turn identifiers.
 *
 * @param count Number of identifiers.
 * @param offset Starting numeric offset.
 * @returns Ordered turn identifiers.
 */
function createTurns(count: number, offset = 0): string[] {
  return Array.from({ length: count }, (_, index) => `turn-${index + offset}`);
}
