/**
 * Covers post-paint scheduling used by completed syntax highlighting.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hasActiveSelectionWithin,
  scheduleHighlightingAfterPaint
} from "../src/components/messages/MarkdownMessage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deferred syntax highlighting", () => {
  it("should wait for two frames and an idle callback", () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const idleCallbacks: IdleRequestCallback[] = [];
    const callback = vi.fn();

    vi.stubGlobal("window", createWindowScheduler(frameCallbacks, idleCallbacks));

    scheduleHighlightingAfterPaint(callback);

    expect(callback).not.toHaveBeenCalled();
    runNextFrame(frameCallbacks);
    expect(callback).not.toHaveBeenCalled();
    runNextFrame(frameCallbacks);
    expect(callback).not.toHaveBeenCalled();

    const idleCallback = idleCallbacks.shift();
    idleCallback?.({
      didTimeout: false,
      timeRemaining: () => 10
    });

    expect(callback).toHaveBeenCalledOnce();
  });

  it("should cancel work that has not reached the first frame", () => {
    const frameCallbacks: FrameRequestCallback[] = [];
    const idleCallbacks: IdleRequestCallback[] = [];
    const callback = vi.fn();
    const windowScheduler = createWindowScheduler(frameCallbacks, idleCallbacks);

    vi.stubGlobal("window", windowScheduler);

    const cancel = scheduleHighlightingAfterPaint(callback);
    cancel();

    expect(windowScheduler.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it("should detect an active selection inside the Markdown container", () => {
    const anchorNode = {} as Node;
    const container = {
      contains: vi.fn((node: Node) => node === anchorNode)
    } as unknown as HTMLElement;

    vi.stubGlobal("window", {
      getSelection: () => ({
        isCollapsed: false,
        anchorNode,
        focusNode: null
      })
    });

    expect(hasActiveSelectionWithin(container)).toBe(true);
  });

  it("should ignore a collapsed selection", () => {
    vi.stubGlobal("window", {
      getSelection: () => ({
        isCollapsed: true,
        anchorNode: null,
        focusNode: null
      })
    });

    expect(hasActiveSelectionWithin({ contains: vi.fn() } as unknown as HTMLElement)).toBe(false);
  });
});

/**
 * Creates a deterministic browser scheduling surface for unit tests.
 *
 * @param frameCallbacks Captured animation-frame callbacks.
 * @param idleCallbacks Captured idle callbacks.
 * @returns Minimal window scheduling fixture.
 */
function createWindowScheduler(
  frameCallbacks: FrameRequestCallback[],
  idleCallbacks: IdleRequestCallback[]
) {
  return {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    }),
    cancelAnimationFrame: vi.fn(),
    requestIdleCallback: vi.fn((callback: IdleRequestCallback) => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    }),
    cancelIdleCallback: vi.fn(),
    setTimeout: vi.fn(),
    clearTimeout: vi.fn()
  };
}

/** Runs the next captured animation-frame callback. */
function runNextFrame(frameCallbacks: FrameRequestCallback[]): void {
  const callback = frameCallbacks.shift();

  if (callback === undefined) {
    throw new Error("Expected a pending animation-frame callback.");
  }

  callback(0);
}
