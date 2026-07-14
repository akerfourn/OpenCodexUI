/**
 * Renders the markdown message component for the OpenCodex UI.
 */
import { Box } from "@mui/material";
import { memo, startTransition, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

import { InlineCode } from "./InlineCode";
import { MarkdownLink } from "./MarkdownLink";
import { PreBlock } from "./PreBlock";
import {
  createStreamingMarkdownScheduler,
  type StreamingMarkdownScheduler
} from "./streamingMarkdownScheduler";

type MarkdownMessageProps = {
  markdown: string;
  isStreaming?: boolean;
  /** Opens one link rendered from the Markdown content. */
  onOpenLink(href: string): void;
};

type RenderedMarkdownProps = {
  markdown: string;
  shouldHighlightSyntax: boolean;
  /** Opens one link rendered from the Markdown content. */
  onOpenLink(href: string): void;
};

const remarkPlugins = [remarkGfm];
const highlightedRehypePlugins = [rehypeHighlight];
const plainRehypePlugins: [] = [];

/**
 * Renders the markdown message component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function MarkdownMessage({
  markdown,
  isStreaming = false,
  onOpenLink
}: MarkdownMessageProps) {
  const renderedMarkdown = useStreamingMarkdown(markdown, isStreaming);
  const shouldHighlightSyntax = useDeferredSyntaxHighlighting(isStreaming);

  return (
    <RenderedMarkdownM
      markdown={renderedMarkdown}
      shouldHighlightSyntax={shouldHighlightSyntax}
      onOpenLink={onOpenLink}
    />
  );
}

export const MarkdownMessageM = memo(MarkdownMessage);

/**
 * Renders the expensive Markdown parser and syntax-highlighting subtree.
 *
 * @param props Component props.
 * @returns Rendered Markdown content.
 */
function RenderedMarkdown({
  markdown,
  shouldHighlightSyntax,
  onOpenLink
}: RenderedMarkdownProps) {
  const rehypePlugins = shouldHighlightSyntax
    ? highlightedRehypePlugins
    : plainRehypePlugins;

  return (
    <Box
      sx={{
        minWidth: 0,
        lineHeight: 1.45,
        "& > :first-of-type": {
          mt: 0
        },
        "& > :last-child": {
          mb: 0
        },
        "& p": {
          my: 0.5
        },
        "& ul, & ol": {
          my: 0.5,
          pl: 2.5
        },
        "& li + li": {
          mt: 0.25
        },
        "& blockquote": {
          my: 0.75,
          pl: 1.5,
          borderLeft: "3px solid",
          borderColor: "divider",
          color: "text.secondary"
        },
        "& hr": {
          my: 1
        },
        "& h1, & h2, & h3, & h4, & h5, & h6": {
          mt: 1,
          mb: 0.5
        }
      }}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          pre: PreBlock,
          code: InlineCode,
          a: ({ href, children }) => (
            <MarkdownLink href={href} onOpenLink={onOpenLink}>
              {children}
            </MarkdownLink>
          )
        }}
      >
        {markdown}
      </ReactMarkdown>
    </Box>
  );
}

const RenderedMarkdownM = memo(RenderedMarkdown);

/**
 * Returns a cadence-limited Markdown snapshot while content is streaming.
 *
 * Completed and historical content bypasses the scheduler so its final value
 * is rendered during the same React update that marks it as complete.
 *
 * @param markdown Latest Markdown content.
 * @param isStreaming Whether the content is still receiving deltas.
 * @returns Markdown snapshot passed to the expensive rendering subtree.
 */
function useStreamingMarkdown(markdown: string, isStreaming: boolean): string {
  const [streamedMarkdown, setStreamedMarkdown] = useState(markdown);
  const schedulerRef = useRef<StreamingMarkdownScheduler | null>(null);

  if (schedulerRef.current === null) {
    schedulerRef.current = createStreamingMarkdownScheduler(markdown, setStreamedMarkdown);
  }

  useEffect(() => {
    const scheduler = schedulerRef.current;

    if (scheduler === null) {
      return;
    }

    if (isStreaming) {
      scheduler.schedule(markdown);
      return;
    }

    scheduler.flush(markdown);
  }, [isStreaming, markdown]);

  useEffect(() => {
    return () => {
      schedulerRef.current?.cancel();
    };
  }, []);

  return isStreaming ? streamedMarkdown : markdown;
}

/**
 * Defers syntax highlighting until completed content has already been painted.
 *
 * Historical content starts highlighted. Content that transitions from
 * streaming to completed first renders its final plain code blocks, then
 * enables highlighting during an idle low-priority React update.
 *
 * @param isStreaming Whether the content is still receiving deltas.
 * @returns Whether the expensive syntax-highlighting plugin should run.
 */
function useDeferredSyntaxHighlighting(isStreaming: boolean): boolean {
  const [shouldHighlight, setShouldHighlight] = useState(!isStreaming);
  const hasStreamedRef = useRef(isStreaming);

  useEffect(() => {
    if (isStreaming) {
      hasStreamedRef.current = true;
      setShouldHighlight(false);
      return undefined;
    }

    if (!hasStreamedRef.current) {
      setShouldHighlight(true);
      return undefined;
    }

    return scheduleHighlightingAfterPaint(() => {
      hasStreamedRef.current = false;
      startTransition(() => {
        setShouldHighlight(true);
      });
    });
  }, [isStreaming]);

  return !isStreaming && shouldHighlight;
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
