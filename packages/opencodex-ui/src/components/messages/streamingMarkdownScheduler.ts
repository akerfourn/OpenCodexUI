/** Maximum cadence used to refresh Markdown while content is streaming. */
export const STREAMING_MARKDOWN_INTERVAL_MS = 150;

/** Operations exposed by a trailing streaming Markdown scheduler. */
export interface StreamingMarkdownScheduler {
  schedule(markdown: string): void;
  flush(markdown: string): void;
  cancel(): void;
}

/**
 * Creates a trailing scheduler that emits only the latest streamed Markdown.
 *
 * @param initialMarkdown Markdown already rendered before scheduling begins.
 * @param onUpdate Callback receiving a Markdown snapshot to render.
 * @param intervalMs Minimum interval between streamed updates.
 * @returns Scheduler used by the React rendering boundary.
 */
export function createStreamingMarkdownScheduler(
  initialMarkdown: string,
  onUpdate: (markdown: string) => void,
  intervalMs = STREAMING_MARKDOWN_INTERVAL_MS
): StreamingMarkdownScheduler {
  let lastRenderedMarkdown = initialMarkdown;
  let lastUpdateAt = Date.now();
  let pendingMarkdown: string | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  /** Emits one snapshot unless it is already rendered. */
  function emit(markdown: string): void {
    lastUpdateAt = Date.now();

    if (markdown === lastRenderedMarkdown) {
      return;
    }

    lastRenderedMarkdown = markdown;
    onUpdate(markdown);
  }

  /** Emits the latest pending snapshot when the cadence window ends. */
  function emitPending(): void {
    timeoutId = null;
    const markdown = pendingMarkdown;
    pendingMarkdown = null;

    if (markdown === null) {
      return;
    }

    emit(markdown);
  }

  /** Schedules the latest snapshot within the current cadence window. */
  function schedule(markdown: string): void {
    pendingMarkdown = markdown;

    if (timeoutId !== null) {
      return;
    }

    const elapsedMs = Math.max(Date.now() - lastUpdateAt, 0);
    const delayMs = Math.max(intervalMs - elapsedMs, 0);
    timeoutId = setTimeout(emitPending, delayMs);
  }

  /** Emits a final snapshot immediately and clears pending streamed work. */
  function flush(markdown: string): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    pendingMarkdown = null;
    emit(markdown);
  }

  /** Cancels pending streamed work without emitting it. */
  function cancel(): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    pendingMarkdown = null;
  }

  return {
    schedule,
    flush,
    cancel
  };
}
