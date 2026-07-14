/** Number of recent turns mounted during the first chat frame. */
export const INITIAL_VISIBLE_TURN_COUNT = 10;

/** Number of older turns revealed for each upward scroll window. */
export const TURN_WINDOW_INCREMENT = 10;

/**
 * Returns the bounded recent window rendered by a chat timeline.
 *
 * @param turns Loaded turns in chronological order.
 * @param visibleTurnCount Maximum number of recent turns to render.
 * @returns Recent turn window without mutating the source collection.
 */
export function getVisibleTurns<T>(turns: T[], visibleTurnCount: number): T[] {
  if (turns.length <= visibleTurnCount) {
    return turns;
  }

  return turns.slice(-visibleTurnCount);
}

/**
 * Resolves the post-paint window restored for a previously mounted chat.
 *
 * New turns received while the chat was hidden are included so the previous
 * reading position continues to reference the same mounted content.
 *
 * @param savedVisibleTurnCount Visible turns when the chat was hidden.
 * @param savedTurnCount Total turns when the chat was hidden.
 * @param currentTurnCount Total turns available when the chat is restored.
 * @returns Number of turns to mount after the bounded first frame.
 */
export function resolveRestoredVisibleTurnCount(
  savedVisibleTurnCount: number,
  savedTurnCount: number,
  currentTurnCount: number
): number {
  const addedTurnCount = Math.max(currentTurnCount - savedTurnCount, 0);
  const restoredTurnCount = Math.max(
    INITIAL_VISIBLE_TURN_COUNT,
    savedVisibleTurnCount + addedTurnCount
  );

  return Math.min(currentTurnCount, restoredTurnCount);
}
