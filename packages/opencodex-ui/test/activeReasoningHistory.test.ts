import { describe, expect, it } from "vitest";

import {
  ACTIVE_REASONING_ITEM_LIMIT,
  selectActiveReasoningItems
} from "../src/components/messages/activeReasoningHistory";

describe("active reasoning history", () => {
  it("should keep only the most recent items when history is limited", () => {
    const items = ["item-1", "item-2", "item-3", "item-4", "item-5", "item-6"];

    const visibleItems = selectActiveReasoningItems(items, false);

    expect(visibleItems).toEqual(["item-2", "item-3", "item-4", "item-5", "item-6"]);
    expect(visibleItems).toHaveLength(ACTIVE_REASONING_ITEM_LIMIT);
  });

  it("should preserve the complete ordered history when explicitly requested", () => {
    const items = ["item-1", "item-2", "item-3", "item-4", "item-5", "item-6"];

    const visibleItems = selectActiveReasoningItems(items, true);

    expect(visibleItems).toBe(items);
  });

  it("should preserve short histories without allocating a new array", () => {
    const items = ["item-1", "item-2"];

    const visibleItems = selectActiveReasoningItems(items, false);

    expect(visibleItems).toBe(items);
  });
});
