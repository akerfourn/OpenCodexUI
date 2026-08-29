/**
 * Provides pure sizing helpers for the resizable chat composer.
 */

/** Minimum height of the composer editor in pixels. */
export const COMPOSER_MIN_HEIGHT_PX = 122;

const COMPOSER_BOTTOM_SCROLL_THRESHOLD_PX = 4;

/**
 * Resolves the maximum composer height from the current viewport.
 *
 * @param viewportHeight Current viewport height in pixels.
 * @returns Maximum editor height in pixels.
 */
export function readComposerMaxHeight(
  viewportHeight: number,
  minHeight = COMPOSER_MIN_HEIGHT_PX
): number {
  return Math.max(minHeight, Math.floor(viewportHeight * 0.5));
}

/**
 * Constrains a requested composer height to its usable bounds.
 *
 * @param value Requested height in pixels.
 * @param maxHeight Maximum allowed height in pixels.
 * @param minHeight Minimum allowed height in pixels.
 * @returns Rounded height between the minimum and maximum bounds.
 */
export function clampComposerHeight(
  value: number,
  maxHeight: number,
  minHeight = COMPOSER_MIN_HEIGHT_PX
): number {
  const resolvedMaxHeight = Math.max(minHeight, maxHeight);
  const roundedValue = Math.round(value);

  return Math.min(
    Math.max(roundedValue, minHeight),
    resolvedMaxHeight
  );
}

/**
 * Checks whether a scrollable composer is close enough to its bottom edge to keep following content.
 *
 * @param editorElement Scrollable composer element.
 * @returns `true` when the bottom of the current content is visible.
 */
export function isComposerEditorAtBottom(
  editorElement: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">
): boolean {
  const remainingScroll = (
    editorElement.scrollHeight - editorElement.scrollTop - editorElement.clientHeight
  );

  return remainingScroll <= COMPOSER_BOTTOM_SCROLL_THRESHOLD_PX;
}
