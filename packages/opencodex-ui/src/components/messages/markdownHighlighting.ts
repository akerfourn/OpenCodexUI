/**
 * Defers expensive syntax highlighting while preserving Markdown interactivity.
 */
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type RefObject
} from "react";

/**
 * Defers syntax highlighting until the rendered Markdown has had a chance to paint.
 *
 * @param isStreaming Whether the message is still receiving content.
 * @param containerRef Rendered Markdown container used to protect selections.
 * @param deferInitialHighlighting Whether initial highlighting should be deferred.
 * @param isMarkdownVisible Whether the Markdown view is currently visible.
 * @returns Whether syntax highlighting should be enabled.
 */
export function useDeferredSyntaxHighlighting(
  isStreaming: boolean,
  containerRef: RefObject<HTMLDivElement>,
  deferInitialHighlighting = false,
  isMarkdownVisible = true
): boolean {
  const [shouldHighlight, setShouldHighlight] = useState(
    !isStreaming && !deferInitialHighlighting && isMarkdownVisible
  );
  const hasStreamedRef = useRef(isStreaming);

  useEffect(() => {
    if (!isMarkdownVisible) {
      setShouldHighlight(false);
      return undefined;
    }

    if (isStreaming) {
      hasStreamedRef.current = true;
      setShouldHighlight(false);
      return undefined;
    }

    if (!deferInitialHighlighting && !hasStreamedRef.current) {
      setShouldHighlight(true);
      return undefined;
    }

    let removeSelectionListener: (() => void) | null = null;

    /** Enables highlighting in a low-priority React transition. */
    function enableHighlighting(): void {
      hasStreamedRef.current = false;
      startTransition(() => {
        setShouldHighlight(true);
      });
    }

    const cancelScheduledHighlighting = scheduleHighlightingAfterPaint(() => {
      if (!hasActiveSelectionWithin(containerRef.current)) {
        enableHighlighting();
        return;
      }

      /** Enables highlighting once the user leaves the rendered block selection. */
      function handleSelectionChange(): void {
        if (hasActiveSelectionWithin(containerRef.current)) {
          return;
        }

        removeSelectionListener?.();
        removeSelectionListener = null;
        enableHighlighting();
      }

      document.addEventListener("selectionchange", handleSelectionChange);
      removeSelectionListener = () => {
        document.removeEventListener("selectionchange", handleSelectionChange);
      };
    });

    return () => {
      cancelScheduledHighlighting();
      removeSelectionListener?.();
    };
  }, [
    containerRef,
    deferInitialHighlighting,
    isMarkdownVisible,
    isStreaming
  ]);

  return isMarkdownVisible && !isStreaming && shouldHighlight;
}

/**
 * Checks whether the current document selection intersects a Markdown block.
 *
 * @param container Rendered Markdown container.
 * @returns Whether an active selection starts or ends inside the container.
 */
export function hasActiveSelectionWithin(container: HTMLElement | null): boolean {
  if (container === null || typeof window.getSelection !== "function") {
    return false;
  }

  const selection = window.getSelection();

  if (selection === null || selection.isCollapsed) {
    return false;
  }

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;

  return (
    (anchorNode !== null && container.contains(anchorNode)) ||
    (focusNode !== null && container.contains(focusNode))
  );
}

/**
 * Schedules syntax highlighting after at least one completed-content paint.
 *
 * @param callback Work that enables syntax highlighting.
 * @returns Cleanup function cancelling all pending browser callbacks.
 */
export function scheduleHighlightingAfterPaint(callback: () => void): () => void {
  let firstFrameId: number | null = null;
  let secondFrameId: number | null = null;
  let idleCallbackId: number | null = null;
  let timeoutId: number | null = null;

  /** Runs the low-priority work and clears its active callback identity. */
  function runCallback(): void {
    idleCallbackId = null;
    timeoutId = null;
    callback();
  }

  firstFrameId = window.requestAnimationFrame(() => {
    firstFrameId = null;
    secondFrameId = window.requestAnimationFrame(() => {
      secondFrameId = null;

      if (typeof window.requestIdleCallback === "function") {
        idleCallbackId = window.requestIdleCallback(runCallback);
        return;
      }

      timeoutId = window.setTimeout(runCallback, 0);
    });
  });

  return () => {
    if (firstFrameId !== null) {
      window.cancelAnimationFrame(firstFrameId);
    }

    if (secondFrameId !== null) {
      window.cancelAnimationFrame(secondFrameId);
    }

    if (idleCallbackId !== null && typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleCallbackId);
    }

    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  };
}
