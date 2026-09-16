/**
 * Renders Markdown messages with bounded previews and lazy expensive work.
 */
import { Box, Button, Stack, Typography } from "@mui/material";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react";
import { useTranslation } from "react-i18next";

import {
  createMarkdownContentProfile,
  type MarkdownContentProfile
} from "./markdownMessageOptimization";
import {
  createMarkdownRenderTree,
  MarkdownLinkContext,
  type MarkdownLinkContextValue,
  type MarkdownRenderVariant
} from "./markdownRenderTree";
import {
  hasActiveSelectionWithin,
  scheduleHighlightingAfterPaint,
  useDeferredSyntaxHighlighting
} from "./markdownHighlighting";
import {
  isMarkdownRenderPerformanceRecordingEnabled,
  recordMarkdownRenderPerformance
} from "../../performance/rendererPerformanceRecorder";
import { normalizeLatexDelimiters } from "./latexMarkdown";
import {
  createStreamingMarkdownScheduler,
  type StreamingMarkdownScheduler
} from "./streamingMarkdownScheduler";

export type MarkdownMessageProps = {
  markdown: string;
  isStreaming?: boolean;
  /** Requires a modifier key before opening links in the rendered Markdown. */
  requireModifiedClick?: boolean;
  /** Opens one link rendered from the Markdown content. */
  onOpenLink(href: string): void;
  /** Enables progressive rendering for completed large content. */
  optimizeLargeContent?: boolean;
};

type RenderedMarkdownProps = {
  markdown: string;
  isStreaming: boolean;
  shouldHighlightSyntax: boolean;
  containerRef: RefObject<HTMLDivElement>;
  /** Requires a modifier key before opening links in the rendered Markdown. */
  requireModifiedClick: boolean;
  /** Opens one link rendered from the Markdown content. */
  onOpenLink(href: string): void;
};

type MarkdownViewMode = "markdown" | "plainText";

/**
 * Renders a Markdown message and avoids mounting its entire expensive form by default.
 *
 * @param props Message content and link behavior.
 * @returns Rendered message content and optional display controls.
 */
export function MarkdownMessage({
  markdown,
  isStreaming = false,
  requireModifiedClick = false,
  onOpenLink,
  optimizeLargeContent = true
}: MarkdownMessageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentProfile = useMemo<MarkdownContentProfile>(
    () => createMarkdownContentProfile(markdown),
    [markdown]
  );
  const isLargeContent = optimizeLargeContent && contentProfile.isLarge && !isStreaming;
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<MarkdownViewMode>("markdown");
  const isPlainTextVisible = isLargeContent && viewMode === "plainText";
  const displayedMarkdown = isLargeContent && !isExpanded
    ? contentProfile.preview.markdown
    : markdown;
  const renderedMarkdown = useStreamingMarkdown(displayedMarkdown, isStreaming);
  const shouldHighlightSyntax = useDeferredSyntaxHighlighting(
    isStreaming,
    containerRef,
    isLargeContent,
    !isPlainTextVisible
  );

  useEffect(() => {
    if (isLargeContent) {
      return;
    }

    setIsExpanded(false);
    setViewMode("markdown");
  }, [isLargeContent]);

  const content = isPlainTextVisible ? (
    <PlainTextMessage markdown={displayedMarkdown} />
  ) : (
    <RenderedMarkdownM
      markdown={renderedMarkdown}
      isStreaming={isStreaming}
      shouldHighlightSyntax={shouldHighlightSyntax}
      containerRef={containerRef}
      requireModifiedClick={requireModifiedClick}
      onOpenLink={onOpenLink}
    />
  );

  return (
    <>
      {content}
      {isLargeContent ? (
        <LargeMarkdownControls
          profile={contentProfile}
          isExpanded={isExpanded}
          viewMode={viewMode}
          onToggleExpanded={() => setIsExpanded((current) => !current)}
          onToggleViewMode={() => setViewMode((current) => (
            current === "markdown" ? "plainText" : "markdown"
          ))}
        />
      ) : null}
    </>
  );
}

export const MarkdownMessageM = memo(MarkdownMessage);

/**
 * Renders the expensive Markdown parser and syntax-highlighting subtree.
 *
 * @param props Render state and link behavior.
 * @returns Rendered Markdown content.
 */
function RenderedMarkdown({
  markdown,
  isStreaming,
  shouldHighlightSyntax,
  containerRef,
  requireModifiedClick,
  onOpenLink
}: RenderedMarkdownProps) {
  const renderStartedAt = isMarkdownRenderPerformanceRecordingEnabled()
    ? performance.now()
    : null;
  const markdownForRendering = useMemo(
    () => (isStreaming ? markdown : normalizeLatexDelimiters(markdown)),
    [isStreaming, markdown]
  );
  const renderVariant: MarkdownRenderVariant = isStreaming
    ? "streaming"
    : shouldHighlightSyntax
      ? "highlighted"
      : "standard";
  const markdownTree = useMemo(
    () => createMarkdownRenderTree(markdownForRendering, renderVariant),
    [markdownForRendering, renderVariant]
  );
  const linkContext = useMemo<MarkdownLinkContextValue>(() => ({
    requireModifiedClick,
    onOpenLink
  }), [onOpenLink, requireModifiedClick]);

  return (
    <Box
      ref={containerRef}
      className="markdown-message"
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
        },
        "& table": {
          width: "100%",
          my: 1,
          borderCollapse: "collapse",
          borderSpacing: 0
        },
        "& th, & td": {
          px: 1,
          py: 0.75,
          border: "1px solid",
          borderColor: "divider",
          textAlign: "left",
          verticalAlign: "top"
        },
        "& th": {
          bgcolor: "action.hover",
          fontWeight: 600
        }
      }}
    >
      <MarkdownLinkContext.Provider value={linkContext}>
        {markdownTree}
      </MarkdownLinkContext.Provider>
      {renderStartedAt !== null ? (
        <MarkdownRenderTiming
          startedAt={renderStartedAt}
          markdownLength={markdown.length}
          isSyntaxHighlighted={shouldHighlightSyntax}
        />
      ) : null}
    </Box>
  );
}

const RenderedMarkdownM = memo(RenderedMarkdown);

type PlainTextMessageProps = {
  markdown: string;
};

/**
 * Renders raw Markdown without invoking the Markdown parser.
 *
 * @param props Raw message content.
 * @returns Plain text message content.
 */
function PlainTextMessage({ markdown }: PlainTextMessageProps) {
  return (
    <Box
      component="pre"
      className="markdown-message markdown-message-plain"
      sx={{
        m: 0,
        minWidth: 0,
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
        font: "inherit",
        lineHeight: 1.45
      }}
    >
      {markdown}
    </Box>
  );
}

type LargeMarkdownControlsProps = {
  profile: MarkdownContentProfile;
  isExpanded: boolean;
  viewMode: MarkdownViewMode;
  onToggleExpanded(): void;
  onToggleViewMode(): void;
};

/**
 * Renders controls for expanding and switching a large message to raw text.
 *
 * @param props Large-content state and event handlers.
 * @returns Display controls.
 */
function LargeMarkdownControls({
  profile,
  isExpanded,
  viewMode,
  onToggleExpanded,
  onToggleViewMode
}: LargeMarkdownControlsProps) {
  const { t } = useTranslation();
  const omissionLabel = t("message.contentOmitted", {
    count: profile.preview.omittedCharacterCount,
    formattedCount: profile.preview.omittedCharacterCount.toLocaleString()
  });

  return (
    <Stack
      direction="row"
      spacing={0.75}
      useFlexGap
      sx={{
        mt: 0.75,
        flexWrap: "wrap",
        alignItems: "center"
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {omissionLabel}
      </Typography>
      <Button size="small" onClick={onToggleExpanded}>
        {isExpanded ? t("message.limitContent") : t("message.showAllContent")}
      </Button>
      <Button
        size="small"
        aria-pressed={viewMode === "plainText"}
        onClick={onToggleViewMode}
      >
        {viewMode === "markdown"
          ? t("message.showPlainText")
          : t("message.showMarkdown")}
      </Button>
    </Stack>
  );
}

type MarkdownRenderTimingProps = {
  startedAt: number;
  markdownLength: number;
  isSyntaxHighlighted: boolean;
};

/**
 * Reports one Markdown commit latency without rendering UI content.
 *
 * @param props Content-free timing metadata.
 * @returns No rendered content.
 */
function MarkdownRenderTiming({
  startedAt,
  markdownLength,
  isSyntaxHighlighted
}: MarkdownRenderTimingProps) {
  useLayoutEffect(() => {
    recordMarkdownRenderPerformance({
      durationMs: performance.now() - startedAt,
      markdownLength,
      isSyntaxHighlighted
    });
  });

  return null;
}

/**
 * Returns a cadence-limited Markdown snapshot while content is streaming.
 *
 * Completed and historical content bypass the scheduler so their final value
 * is rendered during the same React update that marks them as complete.
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

export {
  hasActiveSelectionWithin,
  scheduleHighlightingAfterPaint,
  useDeferredSyntaxHighlighting
} from "./markdownHighlighting";
