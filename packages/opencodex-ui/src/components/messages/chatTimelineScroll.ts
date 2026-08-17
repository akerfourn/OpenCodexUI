/**
 * Provides pure calculations for preserving a chat timeline's scroll position.
 */

/**
 * Describes the dimensions and current position of a scroll container.
 */
export interface TimelineScrollMetrics {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
}

/**
 * Captures the scroll state before older timeline content is prepended.
 */
export interface PreviousTimelineScrollState {
  height: number;
  top: number;
}

/**
 * Maximum remaining distance considered close enough to the bottom.
 */
export const BOTTOM_SCROLL_THRESHOLD_PX = 4;

/**
 * Checks whether the timeline is at, or within the threshold of, its bottom.
 *
 * @param metrics Scroll container dimensions and current position.
 * @param threshold Maximum remaining distance accepted as the bottom.
 * @returns Whether the remaining scroll distance is within the threshold.
 */
export function isTimelineAtBottom(
  metrics: TimelineScrollMetrics,
  threshold = BOTTOM_SCROLL_THRESHOLD_PX
): boolean {
  const remainingScroll = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return remainingScroll <= threshold;
}

/**
 * Resolves the scroll position to use when restoring a saved timeline state.
 *
 * @param isPinnedToBottom Whether the saved state was pinned to the bottom.
 * @param savedScrollTop Previously saved scroll position.
 * @param currentScrollHeight Current content height after restoration.
 * @returns Scroll position for the restored timeline.
 */
export function resolveRestoredTimelineScrollTop(
  isPinnedToBottom: boolean,
  savedScrollTop: number,
  currentScrollHeight: number
): number {
  if (isPinnedToBottom) {
    return currentScrollHeight;
  }

  return Math.max(savedScrollTop, 0);
}

/**
 * Resolves the scroll position after older timeline content is prepended.
 *
 * @param previous Scroll state captured before prepending content.
 * @param currentScrollHeight Content height after prepending content.
 * @returns Scroll position that preserves the previous viewport content.
 */
export function resolvePrependedTimelineScrollTop(
  previous: PreviousTimelineScrollState,
  currentScrollHeight: number
): number {
  return currentScrollHeight - previous.height + previous.top;
}
