import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import HourglassEmptyOutlinedIcon from "@mui/icons-material/HourglassEmptyOutlined";
import PauseCircleOutlineOutlinedIcon from "@mui/icons-material/PauseCircleOutlineOutlined";
import PersonOffOutlinedIcon from "@mui/icons-material/PersonOffOutlined";
import PlayCircleOutlineOutlinedIcon from "@mui/icons-material/PlayCircleOutlineOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexCollaborationAction,
  OpenCodexCollaborationEvent,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { createBoundedTextPreview } from "./boundedTextPreview";
import { EmbeddedCollaborationEventCard } from "./EmbeddedCollaborationEventCard";

const COLLABORATION_PREVIEW_MAX_LINES = 18;
const COLLABORATION_PREVIEW_MAX_CHARACTERS = 4_000;
const EMBEDDED_COLLABORATION_PREVIEW_MAX_LINES = 2;
const EMBEDDED_COLLABORATION_PREVIEW_MAX_CHARACTERS = 600;

type CollaborationEventCardProps = {
  event: OpenCodexCollaborationEvent;
  currentThread: OpenCodexThread;
  displayMode?: "standalone" | "embedded";
  navigableThreadIds?: readonly string[];
  onNavigateThread(threadId: string): void;
};

type CollaborationEventListProps = {
  events: readonly OpenCodexCollaborationEvent[];
  currentThread: OpenCodexThread;
  isThreadContext?: boolean;
  navigableThreadIds?: readonly string[];
  onNavigateThread(threadId: string): void;
};

/**
 * Renders a group of normalized collaboration events.
 *
 * @param props Event collection, current thread, and navigation callback.
 * @returns Nothing when the collection is empty, otherwise dedicated event cards.
 */
export function CollaborationEventList({
  events,
  currentThread,
  isThreadContext = false,
  navigableThreadIds,
  onNavigateThread
}: CollaborationEventListProps) {
  const { t } = useTranslation();

  if (events.length === 0) {
    return null;
  }

  return (
    <Stack
      component="section"
      aria-label={t("collaboration.timelineLabel")}
      spacing={0.75}
      sx={{ minWidth: 0, width: "100%" }}
    >
      {isThreadContext ? (
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ px: 0.5, letterSpacing: "0.08em" }}
        >
          {t("collaboration.threadContext")}
        </Typography>
      ) : null}
      {events.map((event) => (
        <CollaborationEventCard
          key={event.id}
          event={event}
          currentThread={currentThread}
          navigableThreadIds={navigableThreadIds}
          onNavigateThread={onNavigateThread}
        />
      ))}
    </Stack>
  );
}

/**
 * Renders one delegation or inter-agent communication as a distinct timeline item.
 *
 * @param props Normalized event, current thread, and navigation callback.
 * @returns Collaboration event card.
 */
export function CollaborationEventCard({
  event,
  currentThread,
  displayMode = "standalone",
  navigableThreadIds,
  onNavigateThread
}: CollaborationEventCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setExpanded] = useState(false);
  const content = resolveEventContent(event);
  const previewMaxLines = displayMode === "embedded"
    ? EMBEDDED_COLLABORATION_PREVIEW_MAX_LINES
    : COLLABORATION_PREVIEW_MAX_LINES;
  const previewMaxCharacters = displayMode === "embedded"
    ? EMBEDDED_COLLABORATION_PREVIEW_MAX_CHARACTERS
    : COLLABORATION_PREVIEW_MAX_CHARACTERS;
  const preview = useMemo(() => (
    content === null
      ? null
      : createBoundedTextPreview(content, {
        strategy: "head-tail",
        maxLines: previewMaxLines,
        maxCharacters: previewMaxCharacters
      })
  ), [content, previewMaxCharacters, previewMaxLines]);
  const senderLabel = resolveSenderLabel(event, currentThread);
  const receiverLabels = resolveReceiverLabels(event, currentThread);
  const receiverLabel = receiverLabels.length > 0
    ? receiverLabels.join(", ")
    : t("collaboration.unknownAgent");
  const relatedThreadId = resolveNavigableThreadId(
    event,
    currentThread.id,
    navigableThreadIds
  );
  const visibleContent = preview === null || isExpanded || !preview.isLimited
    ? content
    : joinPreviewSegments(preview.leadingText, preview.trailingText);
  const unavailableLabel = resolveUnavailableContentLabel(event.action, t);
  const metadata = resolveMetadata(event);
  const actionLabel = t(`collaboration.action.${event.action}`);
  const routeLabel = t("collaboration.route", {
    sender: senderLabel,
    receiver: receiverLabel
  });
  const statusLabel = t(`collaboration.status.${event.status}`);

  function handleToggleExpanded(): void {
    setExpanded((currentValue) => !currentValue);
  }

  function handleNavigate(): void {
    if (relatedThreadId !== null) {
      onNavigateThread(relatedThreadId);
    }
  }

  if (displayMode === "embedded") {
    const detailsLabel = [routeLabel, ...metadata].join(" · ");
    const prompt = visibleContent !== null && visibleContent.trim().length > 0
      ? visibleContent
      : unavailableLabel;

    return (
      <EmbeddedCollaborationEventCard
        actionIcon={renderActionIcon(event.action)}
        actionLabel={actionLabel}
        detailsLabel={detailsLabel}
        statusLabel={statusLabel}
        prompt={prompt}
        isPromptUnavailable={
          unavailableLabel !== null
          && (visibleContent === null || visibleContent.trim().length === 0)
        }
        isPromptLimited={preview?.isLimited === true}
        isPromptExpanded={isExpanded}
        relatedThreadId={relatedThreadId}
        onTogglePrompt={handleToggleExpanded}
        onNavigateThread={onNavigateThread}
      />
    );
  }

  return (
    <Paper
      component="article"
      variant="outlined"
      sx={{
        borderColor: "secondary.light",
        borderLeftWidth: 3,
        bgcolor: "action.hover",
        minWidth: 0,
        px: 1.5,
        py: 1.25,
        width: "100%"
      }}
    >
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={0.75}
          sx={{ alignItems: { xs: "flex-start", sm: "center" }, minWidth: 0 }}
        >
          <Box sx={{ color: "secondary.main", display: "inline-flex", flex: "0 0 auto" }}>
            {renderActionIcon(event.action)}
          </Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {actionLabel}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ minWidth: 0, overflowWrap: "anywhere" }}
          >
            {routeLabel}
          </Typography>
          <Chip
            size="small"
            variant="outlined"
            label={statusLabel}
            sx={{ ml: { sm: "auto" } }}
          />
        </Stack>

        {visibleContent !== null && visibleContent.trim().length > 0 ? (
          <Typography
            component="div"
            variant="body2"
            sx={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}
          >
            {visibleContent}
          </Typography>
        ) : unavailableLabel !== null ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
            {unavailableLabel}
          </Typography>
        ) : null}

        {metadata.length > 0 ? (
          <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
            {metadata.map((entry) => (
              <Chip key={entry} size="small" label={entry} />
            ))}
          </Stack>
        ) : null}

        {preview?.isLimited === true || relatedThreadId !== null ? (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {preview?.isLimited === true ? (
              <Button
                size="small"
                aria-expanded={isExpanded}
                onClick={handleToggleExpanded}
              >
                {isExpanded
                  ? t("collaboration.limitContent")
                  : t("collaboration.showFullContent")}
              </Button>
            ) : null}
            {relatedThreadId !== null ? (
              <Button
                size="small"
                startIcon={<ChatBubbleOutlineOutlinedIcon fontSize="small" />}
                onClick={handleNavigate}
              >
                {t("collaboration.openSubAgentChat")}
              </Button>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}

/**
 * Resolves the thread on the other side of an event for source-aware navigation.
 *
 * @param event Collaboration event.
 * @param currentThreadId Thread whose timeline is being rendered.
 * @returns Related thread identifier, or `null` when unavailable.
 */
export function resolveRelatedThreadId(
  event: OpenCodexCollaborationEvent,
  currentThreadId: string
): string | null {
  if (event.receiverThreadIds.includes(currentThreadId)) {
    if (event.senderThreadId !== null && event.senderThreadId !== currentThreadId) {
      return event.senderThreadId;
    }

    if (event.threadId !== currentThreadId) {
      return event.threadId;
    }
  }

  const otherReceivers = event.receiverThreadIds.filter((threadId) => (
    threadId !== currentThreadId
  ));

  if (otherReceivers.length === 1) {
    return otherReceivers[0] ?? null;
  }

  if (otherReceivers.length > 1) {
    return null;
  }

  if (event.senderThreadId !== null && event.senderThreadId !== currentThreadId) {
    return event.senderThreadId;
  }

  return event.threadId === currentThreadId ? null : event.threadId;
}

/** Restricts a related-thread action to threads inspectable in the current hierarchy. */
export function resolveNavigableThreadId(
  event: OpenCodexCollaborationEvent,
  currentThreadId: string,
  navigableThreadIds: readonly string[] | undefined
): string | null {
  const relatedThreadId = resolveRelatedThreadId(event, currentThreadId);

  if (relatedThreadId === null || navigableThreadIds === undefined) {
    return relatedThreadId;
  }

  return navigableThreadIds.includes(relatedThreadId) ? relatedThreadId : null;
}

/** Resolves the primary text carried by an event. */
function resolveEventContent(event: OpenCodexCollaborationEvent): string | null {
  if (event.action === "result") {
    return event.result;
  }

  return event.prompt;
}

/** Resolves an explicit fallback when semantic content was not retained. */
function resolveUnavailableContentLabel(
  action: OpenCodexCollaborationAction,
  translate: (key: string) => string
): string | null {
  if (action === "spawn") {
    return translate("collaboration.instructionUnavailable");
  }

  if (action === "message" || action === "followup") {
    return translate("collaboration.messageUnavailable");
  }

  if (action === "result") {
    return translate("collaboration.resultUnavailable");
  }

  return null;
}

/** Resolves the sender label without fabricating unavailable identity data. */
function resolveSenderLabel(
  event: OpenCodexCollaborationEvent,
  currentThread: OpenCodexThread
): string {
  if (event.senderThreadId === currentThread.id) {
    return resolveCurrentThreadLabel(currentThread);
  }

  return formatAgentPath(event.senderAgentPath)
    ?? event.senderThreadId
    ?? formatAgentPath(event.threadId)
    ?? event.threadId;
}

/** Resolves unique receiver labels while preferring agent paths over opaque IDs. */
function resolveReceiverLabels(
  event: OpenCodexCollaborationEvent,
  currentThread: OpenCodexThread
): string[] {
  const labels: string[] = [];
  const count = Math.max(event.receiverThreadIds.length, event.receiverAgentPaths.length);

  for (let index = 0; index < count; index += 1) {
    const threadId = event.receiverThreadIds[index] ?? null;
    const agentPath = event.receiverAgentPaths[index] ?? null;
    const label = threadId === currentThread.id
      ? resolveCurrentThreadLabel(currentThread)
      : formatAgentPath(agentPath) ?? threadId;

    if (label !== null && !labels.includes(label)) {
      labels.push(label);
    }
  }

  return labels;
}

/** Resolves the most specific available label for the current thread. */
function resolveCurrentThreadLabel(thread: OpenCodexThread): string {
  return thread.agentNickname
    ?? thread.agentRole
    ?? formatAgentPath(thread.subAgentSource?.agentPath ?? null)
    ?? thread.title;
}

/** Converts an agent path to its readable leaf segment. */
function formatAgentPath(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const segments = value.split("/").filter((segment) => segment.length > 0);
  return segments[segments.length - 1] ?? null;
}

/** Builds compact metadata labels from optional event attributes. */
function resolveMetadata(event: OpenCodexCollaborationEvent): string[] {
  const entries = [
    event.taskName,
    event.agentRole,
    event.model,
    event.reasoningEffort
  ];

  return Array.from(new Set(entries.filter((entry): entry is string => (
    entry !== null && entry.trim().length > 0
  ))));
}

/** Joins a bounded head/tail preview with an explicit omission marker. */
function joinPreviewSegments(leadingText: string, trailingText: string): string {
  return [leadingText.trimEnd(), "…", trailingText.trimStart()]
    .filter((segment) => segment.length > 0)
    .join("\n");
}

/** Resolves the icon associated with one normalized action. */
function renderActionIcon(action: OpenCodexCollaborationAction): ReactNode {
  switch (action) {
    case "spawn":
      return <AccountTreeOutlinedIcon fontSize="small" />;
    case "message":
      return <ChatBubbleOutlineOutlinedIcon fontSize="small" />;
    case "followup":
      return <AddCommentOutlinedIcon fontSize="small" />;
    case "interrupt":
      return <PauseCircleOutlineOutlinedIcon fontSize="small" />;
    case "wait":
      return <HourglassEmptyOutlinedIcon fontSize="small" />;
    case "resume":
      return <PlayCircleOutlineOutlinedIcon fontSize="small" />;
    case "close":
      return <PersonOffOutlinedIcon fontSize="small" />;
    case "result":
      return <TaskAltOutlinedIcon fontSize="small" />;
  }
}
