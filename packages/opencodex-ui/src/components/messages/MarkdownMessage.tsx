/**
 * Renders the markdown message component for the OpenCodex UI.
 */
import { Box } from "@mui/material";
import { memo, useEffect, useRef, useState } from "react";
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
  /** Opens one link rendered from the Markdown content. */
  onOpenLink(href: string): void;
};

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

  return (
    <RenderedMarkdownM markdown={renderedMarkdown} onOpenLink={onOpenLink} />
  );
}

export const MarkdownMessageM = memo(MarkdownMessage);

/**
 * Renders the expensive Markdown parser and syntax-highlighting subtree.
 *
 * @param props Component props.
 * @returns Rendered Markdown content.
 */
function RenderedMarkdown({ markdown, onOpenLink }: RenderedMarkdownProps) {
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
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
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
