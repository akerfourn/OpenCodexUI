/**
 * Coordinates bounded chat timeline rendering with scroll position retention.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
  type UIEvent
} from "react";

import type { ChatStore, ChatTimelineViewState } from "../../stores/ChatStore";
import {
  INITIAL_VISIBLE_TURN_COUNT,
  resolveRestoredVisibleTurnCount,
  TURN_WINDOW_INCREMENT
} from "./chatTimelineWindow";
import {
  isTimelineAtBottom,
  resolvePrependedTimelineScrollTop,
  resolveRestoredTimelineScrollTop
} from "./chatTimelineScroll";

type TimelineContainerRef = MutableRefObject<HTMLDivElement | null>;

type ChatTimelineScrollState = {
  containerRef: TimelineContainerRef;
  contentRef: TimelineContainerRef;
  visibleTurnCount: number;
  hiddenOlderTurnCount: number;
  showScrollToBottom: boolean;
  handleScroll: (event: UIEvent<HTMLDivElement>) => void;
  handleScrollToBottom: () => void;
};

/**
 * Owns timeline refs, bounded-window state, and scroll position effects.
 *
 * @param chatStore Chat store whose turns and timeline state drive scrolling.
 * @returns Timeline refs, window counts, and scroll event handlers.
 */
export function useChatTimelineScroll(chatStore: ChatStore): ChatTimelineScrollState {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const previousScrollStateRef = useRef<{ height: number; top: number } | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousOlderMessagesRevealVersionRef = useRef(chatStore.olderMessagesPrependVersion);
  const previousTurnCountRef = useRef(chatStore.turns.length);
  const resizeFrameRef = useRef<number | null>(null);
  const restorationFrameRef = useRef<number | null>(null);
  const pendingTimelineRestorationRef = useRef<ChatTimelineViewState | null>(null);
  const visibleTurnCountRef = useRef(INITIAL_VISIBLE_TURN_COUNT);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [visibleTurnCount, setVisibleTurnCount] = useState(INITIAL_VISIBLE_TURN_COUNT);
  visibleTurnCountRef.current = visibleTurnCount;
  const hiddenOlderTurnCount = Math.max(chatStore.turnStores.length - visibleTurnCount, 0);

  useEffect(() => {
    previousTurnCountRef.current = chatStore.turns.length;
    const savedViewState = chatStore.timelineViewState;

    if (savedViewState === null) {
      setVisibleTurnCount(INITIAL_VISIBLE_TURN_COUNT);
      return undefined;
    }

    pendingTimelineRestorationRef.current = savedViewState;
    restorationFrameRef.current = requestAnimationFrame(() => {
      restorationFrameRef.current = requestAnimationFrame(() => {
        restorationFrameRef.current = null;
        const pendingState = pendingTimelineRestorationRef.current;

        if (pendingState === null) {
          return;
        }

        const restoredVisibleTurnCount = resolveRestoredVisibleTurnCount(
          pendingState.visibleTurnCount,
          pendingState.turnCount,
          chatStore.turnStores.length
        );

        if (restoredVisibleTurnCount !== visibleTurnCountRef.current) {
          setVisibleTurnCount(restoredVisibleTurnCount);
          return;
        }

        const container = containerRef.current;

        if (container === null) {
          return;
        }

        pendingTimelineRestorationRef.current = null;
        const isPinnedToBottom = restoreTimelinePosition(container, pendingState);
        shouldStickToBottomRef.current = isPinnedToBottom;
        setShowScrollToBottom(!isPinnedToBottom);
      });
    });

    return () => {
      if (restorationFrameRef.current === null) {
        return;
      }

      cancelAnimationFrame(restorationFrameRef.current);
      restorationFrameRef.current = null;
    };
  }, [chatStore, chatStore.thread.id]);

  useLayoutEffect(() => {
    return () => {
      const container = containerRef.current;

      if (
        container === null ||
        pendingTimelineRestorationRef.current !== null
      ) {
        return;
      }

      chatStore.setTimelineViewState({
        visibleTurnCount: visibleTurnCountRef.current,
        turnCount: chatStore.turnStores.length,
        scrollTop: container.scrollTop,
        isPinnedToBottom: shouldStickToBottomRef.current
      });
    };
  }, [chatStore]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;

    if (container === null || content === null || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (
        !shouldStickToBottomRef.current ||
        previousScrollStateRef.current !== null ||
        resizeFrameRef.current !== null
      ) {
        return;
      }

      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        const currentContainer = containerRef.current;

        if (
          currentContainer === null ||
          !shouldStickToBottomRef.current ||
          previousScrollStateRef.current !== null
        ) {
          return;
        }

        scrollToBottom(currentContainer);
      });
    });

    resizeObserver.observe(container);
    resizeObserver.observe(content);

    return () => {
      resizeObserver.disconnect();

      if (resizeFrameRef.current === null) {
        return;
      }

      cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      scrollToBottom(container);
      shouldStickToBottomRef.current = true;
      setShowScrollToBottom(false);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [chatStore.thread.id, chatStore.scrollToBottomVersion]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const pendingRestoration = pendingTimelineRestorationRef.current;

    if (container !== null && pendingRestoration !== null) {
      pendingTimelineRestorationRef.current = null;
      const isPinnedToBottom = restoreTimelinePosition(container, pendingRestoration);
      shouldStickToBottomRef.current = isPinnedToBottom;
      setShowScrollToBottom(!isPinnedToBottom);
      return;
    }

    const previousState = previousScrollStateRef.current;

    if (container === null || previousState === null) {
      return;
    }

    container.scrollTop = resolvePrependedTimelineScrollTop(
      previousState,
      container.scrollHeight
    );
    const isPinnedToBottom = isContainerAtBottom(container);
    shouldStickToBottomRef.current = isPinnedToBottom;
    setShowScrollToBottom(!isPinnedToBottom);
    previousScrollStateRef.current = null;
  }, [chatStore.olderMessagesPrependVersion, visibleTurnCount]);

  useLayoutEffect(() => {
    const didPrependOlderMessages = (
      previousOlderMessagesRevealVersionRef.current !== chatStore.olderMessagesPrependVersion
    );
    const previousTurnCount = previousTurnCountRef.current;

    previousOlderMessagesRevealVersionRef.current = chatStore.olderMessagesPrependVersion;
    previousTurnCountRef.current = chatStore.turns.length;

    if (!didPrependOlderMessages) {
      return;
    }

    const addedTurnCount = Math.max(chatStore.turns.length - previousTurnCount, 0);

    if (addedTurnCount === 0) {
      return;
    }

    setVisibleTurnCount((currentCount) => (
      Math.min(chatStore.turns.length, currentCount + addedTurnCount)
    ));
  }, [chatStore.olderMessagesPrependVersion, chatStore.turns.length]);

  /**
   * Scrolls to the latest message and pins the timeline there.
   *
   * @returns Nothing.
   */
  function handleScrollToBottom(): void {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    scrollToBottom(container);
    shouldStickToBottomRef.current = true;
    setShowScrollToBottom(false);
  }

  /**
   * Updates pin state and reveals or loads older turns near the top edge.
   *
   * @param event Scroll event from the timeline container.
   * @returns Nothing.
   */
  function handleScroll(event: UIEvent<HTMLDivElement>): void {
    const container = event.currentTarget;
    const isPinnedToBottom = isContainerAtBottom(container);
    shouldStickToBottomRef.current = isPinnedToBottom;
    setShowScrollToBottom(!isPinnedToBottom);

    if (
      container.scrollTop > 80 ||
      chatStore.isLoadingOlderMessages
    ) {
      return;
    }

    if (hiddenOlderTurnCount > 0) {
      previousScrollStateRef.current = {
        height: container.scrollHeight,
        top: container.scrollTop
      };
      setVisibleTurnCount((currentCount) => (
        Math.min(chatStore.turns.length, currentCount + TURN_WINDOW_INCREMENT)
      ));
      return;
    }

    if (!chatStore.hasMoreOlderMessages) {
      return;
    }

    previousScrollStateRef.current = {
      height: container.scrollHeight,
      top: container.scrollTop
    };
    chatStore.loadOlderMessages();
  }

  return {
    containerRef,
    contentRef,
    visibleTurnCount,
    hiddenOlderTurnCount,
    showScrollToBottom,
    handleScroll,
    handleScrollToBottom
  };
}

/**
 * Scrolls a message container to its bottom edge.
 *
 * @param container Message scroll container.
 * @returns Nothing.
 */
function scrollToBottom(container: HTMLDivElement): void {
  container.scrollTop = container.scrollHeight;
}

/**
 * Checks whether a message container is at its bottom edge.
 *
 * @param container Message scroll container.
 * @returns Whether the remaining scroll distance is within the bottom threshold.
 */
function isContainerAtBottom(container: HTMLDivElement): boolean {
  return isTimelineAtBottom({
    scrollHeight: container.scrollHeight,
    scrollTop: container.scrollTop,
    clientHeight: container.clientHeight
  });
}

/**
 * Applies a saved timeline position to a mounted container.
 *
 * @param container Message scroll container.
 * @param state Previously retained timeline state.
 * @returns Whether the resulting position is pinned to the bottom.
 */
function restoreTimelinePosition(
  container: HTMLDivElement,
  state: ChatTimelineViewState
): boolean {
  container.scrollTop = resolveRestoredTimelineScrollTop(
    state.isPinnedToBottom,
    state.scrollTop,
    container.scrollHeight
  );
  return state.isPinnedToBottom || isContainerAtBottom(container);
}
