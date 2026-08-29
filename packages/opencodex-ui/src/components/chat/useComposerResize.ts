/**
 * Provides automatic and manual height management for the chat composer.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type {
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject
} from "react";

import {
  clampComposerHeight,
  COMPOSER_MIN_HEIGHT_PX,
  isComposerEditorAtBottom,
  readComposerMaxHeight
} from "./composerResize";

type EditorResizeSession = {
  startHeight: number;
  startY: number;
};

type ResizeScrollSnapshot = {
  scrollTop: number;
  shouldStickToBottom: boolean;
};

/** Height change applied by one keyboard step. */
const COMPOSER_RESIZE_KEYBOARD_STEP_PX = 16;

/** Number of keyboard steps applied by PageUp and PageDown. */
const COMPOSER_RESIZE_PAGE_STEP_COUNT = 4;

export interface ComposerResizeState {
  editorHeight: number;
  manualEditorHeight: number | null;
  isEditorResizeEnabled: boolean;
  scrollEditorToBottom(): void;
  handleEditorResizeStart(event: ReactPointerEvent<HTMLDivElement>): void;
  handleEditorResizeKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
}

/**
 * Manages the composer's natural growth and its optional user-defined height.
 *
 * @param editorRef Reference to the Lexical content-editable element.
 * @param value Current plain-text composer value.
 * @param minHeight Minimum editor height in pixels.
 * @returns Height state and handlers for the resize affordance.
 */
export function useComposerResize(
  editorRef: RefObject<HTMLDivElement | null>,
  value: string,
  minHeight = COMPOSER_MIN_HEIGHT_PX
): ComposerResizeState {
  const manualEditorHeightRef = useRef<number | null>(null);
  const editorResizeSessionRef = useRef<EditorResizeSession | null>(null);
  const resizeScrollSnapshotRef = useRef<ResizeScrollSnapshot | null>(null);
  const [editorHeight, setEditorHeight] = useState(minHeight);
  const [manualEditorHeight, setManualEditorHeight] = useState<number | null>(null);
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const [isResizingEditor, setIsResizingEditor] = useState(false);

  manualEditorHeightRef.current = manualEditorHeight;

  useEffect(() => {
    const editor = editorRef.current;

    if (editor === null || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      const nextHeight = Math.round(editor.getBoundingClientRect().height);

      setEditorHeight((currentHeight) => (
        currentHeight === nextHeight ? currentHeight : nextHeight
      ));

      if (manualEditorHeightRef.current === null) {
        setIsEditorExpanded(nextHeight > minHeight + 1);
      }
    });
    resizeObserver.observe(editor);

    return () => {
      resizeObserver.disconnect();
    };
  }, [editorRef, minHeight]);

  useEffect(() => {
    function handleViewportResize(): void {
      const currentHeight = manualEditorHeightRef.current;

      if (currentHeight === null) {
        return;
      }

      const nextHeight = clampComposerHeight(
        currentHeight,
        readComposerMaxHeight(window.innerHeight, minHeight),
        minHeight
      );

      if (nextHeight === currentHeight) {
        return;
      }

      captureResizeScrollPosition();
      applyManualEditorHeight(nextHeight);
    }

    window.addEventListener("resize", handleViewportResize);

    return () => {
      window.removeEventListener("resize", handleViewportResize);
    };
  }, [minHeight]);

  useEffect(() => {
    if (!isResizingEditor) {
      return undefined;
    }

    function handlePointerMove(event: PointerEvent): void {
      const session = editorResizeSessionRef.current;

      if (session === null) {
        return;
      }

      const requestedHeight = session.startHeight - (event.clientY - session.startY);
      const nextHeight = clampComposerHeight(
        requestedHeight,
        readComposerMaxHeight(window.innerHeight, minHeight),
        minHeight
      );

      applyManualEditorHeight(nextHeight);
    }

    function handlePointerEnd(): void {
      editorResizeSessionRef.current = null;
      setIsResizingEditor(false);
    }

    document.body.classList.add("is-resizing-composer");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      document.body.classList.remove("is-resizing-composer");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      editorResizeSessionRef.current = null;
    };
  }, [isResizingEditor, minHeight]);

  useEffect(() => {
    if (value.length > 0) {
      return;
    }

    manualEditorHeightRef.current = null;
    editorResizeSessionRef.current = null;
    resizeScrollSnapshotRef.current = null;
    setManualEditorHeight(null);
    setIsEditorExpanded(false);
    setIsResizingEditor(false);
  }, [value]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    const snapshot = resizeScrollSnapshotRef.current;

    if (editor === null || snapshot === null || manualEditorHeight === null) {
      return;
    }

    if (snapshot.shouldStickToBottom) {
      scrollEditorToBottom();
      return;
    }

    const maximumScrollTop = Math.max(editor.scrollHeight - editor.clientHeight, 0);
    editor.scrollTop = Math.min(snapshot.scrollTop, maximumScrollTop);
  }, [editorRef, manualEditorHeight]);

  /**
   * Captures the editor position before a height change.
   */
  function captureResizeScrollPosition(): void {
    const editor = editorRef.current;

    if (editor === null) {
      return;
    }

    resizeScrollSnapshotRef.current = {
      scrollTop: editor.scrollTop,
      shouldStickToBottom: isComposerEditorAtBottom(editor)
    };
  }

  /**
   * Applies a bounded manual height and keeps the resize affordance active.
   *
   * @param height Requested height in pixels.
   */
  function applyManualEditorHeight(height: number): void {
    manualEditorHeightRef.current = height;
    setManualEditorHeight((currentHeight) => (
      currentHeight === height ? currentHeight : height
    ));
    setIsEditorExpanded(true);
  }

  /**
   * Starts a pointer-based resize session from the current editor height.
   *
   * @param event Pointer event received by the resize handle.
   */
  function handleEditorResizeStart(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!isEditorResizeEnabled) {
      return;
    }

    const editor = editorRef.current;

    if (editor === null) {
      return;
    }

    const startHeight = clampComposerHeight(
      editor.getBoundingClientRect().height,
      readComposerMaxHeight(window.innerHeight, minHeight),
      minHeight
    );

    event.preventDefault();
    captureResizeScrollPosition();
    editorResizeSessionRef.current = {
      startHeight,
      startY: event.clientY
    };
    applyManualEditorHeight(startHeight);
    setIsResizingEditor(true);
  }

  /**
   * Adjusts the editor height from keyboard commands on the resize handle.
   *
   * @param event Keyboard event received by the resize handle.
   */
  function handleEditorResizeKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!isEditorResizeEnabled) {
      return;
    }

    const currentHeight = manualEditorHeight ?? editorHeight;
    const maxHeight = readComposerMaxHeight(window.innerHeight, minHeight);
    const pageStep = COMPOSER_RESIZE_KEYBOARD_STEP_PX * COMPOSER_RESIZE_PAGE_STEP_COUNT;
    let nextHeight: number;

    switch (event.key) {
      case "ArrowUp":
        nextHeight = currentHeight + COMPOSER_RESIZE_KEYBOARD_STEP_PX;
        break;
      case "ArrowDown":
        nextHeight = currentHeight - COMPOSER_RESIZE_KEYBOARD_STEP_PX;
        break;
      case "PageUp":
        nextHeight = currentHeight + pageStep;
        break;
      case "PageDown":
        nextHeight = currentHeight - pageStep;
        break;
      case "Home":
        nextHeight = minHeight;
        break;
      case "End":
        nextHeight = maxHeight;
        break;
      default:
        return;
    }

    event.preventDefault();
    captureResizeScrollPosition();
    applyManualEditorHeight(clampComposerHeight(nextHeight, maxHeight, minHeight));
  }

  /**
   * Scrolls the composer to the end when its content overflows.
   */
  function scrollEditorToBottom(): void {
    const editor = editorRef.current;

    if (editor === null || editor.scrollHeight <= editor.clientHeight) {
      return;
    }

    editor.scrollTop = editor.scrollHeight;
  }

  const isEditorResizeEnabled = isEditorExpanded || manualEditorHeight !== null;

  return {
    editorHeight,
    manualEditorHeight,
    isEditorResizeEnabled,
    scrollEditorToBottom,
    handleEditorResizeStart,
    handleEditorResizeKeyDown
  };
}
