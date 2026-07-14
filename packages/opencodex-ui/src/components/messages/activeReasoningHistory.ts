/** Maximum number of recent reasoning items mounted by default. */
export const ACTIVE_REASONING_ITEM_LIMIT = 5;

/**
 * Selects the reasoning items that should be mounted while a turn is active.
 *
 * @param items Complete reasoning history in display order.
 * @param isFullHistoryVisible Whether the user requested the complete history.
 *
 * @returns The complete history or its most recent bounded window.
 */
export function selectActiveReasoningItems<T>(
  items: readonly T[],
  isFullHistoryVisible: boolean
): readonly T[] {
  if (isFullHistoryVisible || items.length <= ACTIVE_REASONING_ITEM_LIMIT) {
    return items;
  }

  return items.slice(-ACTIVE_REASONING_ITEM_LIMIT);
}
