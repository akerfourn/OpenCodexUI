import { observer } from "mobx-react-lite";
import {
  useEffect,
  useMemo,
  useState,
  type RefObject,
  type SyntheticEvent
} from "react";
import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Stack
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import type {
  OpenCodexCollaborationEvent,
  OpenCodexThread,
  OpenCodexTurn,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

import {
  ACTIVE_REASONING_ITEM_LIMIT,
  selectActiveReasoningItems
} from "./activeReasoningHistory";
import { buildReasoningTimelineEntries } from "./collaborationReasoningTimeline";
import { ReasoningBlockTitleM } from "./ReasoningBlockTitle";
import { ReasoningTimelineEntryM } from "./ReasoningTimelineEntry";
import {
  readLatestStructuredPlan,
  shouldIncludeActivityItemInTimeline,
  shouldShowPersistentPlan
} from "./assistantTurnPlan";

type ReasoningTimelineProps = {
  turn: OpenCodexTurn;
  preludeItems: OpenCodexTurnItem[];
  collaborationEvents: readonly OpenCodexCollaborationEvent[];
  currentThread: OpenCodexThread;
  navigableThreadIds?: readonly string[];
  isRunning: boolean;
  lastMessageRef: RefObject<HTMLElement>;
  onOpenLink(href: string): void;
  onNavigateThread(threadId: string): void;
};

/** Renders the expandable reasoning history without owning the duration timer. */
export function ReasoningTimeline({
  turn,
  preludeItems,
  collaborationEvents,
  currentThread,
  navigableThreadIds,
  isRunning,
  lastMessageRef,
  onOpenLink,
  onNavigateThread
}: ReasoningTimelineProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [isFullActiveHistoryVisible, setIsFullActiveHistoryVisible] = useState(false);
  const persistentPlan = readLatestStructuredPlan(preludeItems);
  const showPersistentPlan = shouldShowPersistentPlan(isRunning, persistentPlan);
  const timelineEntries = useMemo(
    () => buildReasoningTimelineEntries(preludeItems, collaborationEvents).filter((entry) => (
      entry.type === "collaboration"
      || shouldIncludeActivityItemInTimeline(entry.item, showPersistentPlan)
    )),
    [collaborationEvents, preludeItems, showPersistentPlan]
  );
  const visibleTimelineEntries = isRunning
    ? selectActiveReasoningItems(timelineEntries, isFullActiveHistoryVisible)
    : timelineEntries;
  const visibleTimelineStartIndex = timelineEntries.length - visibleTimelineEntries.length;
  const hasLimitedActiveHistory = isRunning
    && timelineEntries.length > ACTIVE_REASONING_ITEM_LIMIT;
  const historyToggleLabel = isFullActiveHistoryVisible
    ? t("reasoningBlock.limitHistory")
    : t("reasoningBlock.showFullHistory", { count: timelineEntries.length });
  const blockKind = getBlockKind(preludeItems);
  const fallbackStartedAt = readFirstCreatedAt(preludeItems);
  const isExpanded = isRunning || expanded;

  useEffect(() => {
    if (isRunning) {
      return;
    }

    setExpanded(false);
    setIsFullActiveHistoryVisible(false);
  }, [isRunning]);

  function handleToggleActiveHistory(): void {
    setIsFullActiveHistoryVisible((isVisible) => !isVisible);
  }

  function handleAccordionChange(_event: SyntheticEvent, nextExpanded: boolean): void {
    if (!isRunning) {
      setExpanded(nextExpanded);
    }
  }

  const historyToggle = hasLimitedActiveHistory ? (
    <Button
      size="small"
      variant="text"
      onClick={handleToggleActiveHistory}
      sx={{ alignSelf: "flex-start" }}
    >
      {historyToggleLabel}
    </Button>
  ) : null;

  return (
    <Accordion
      expanded={isExpanded}
      elevation={0}
      disableGutters
      square
      onChange={handleAccordionChange}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        bgcolor: "background.paper",
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        "&:before": {
          display: "none"
        }
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon fontSize="small" />}
        sx={{
          minHeight: 36,
          px: 1.25,
          position: isRunning ? "sticky" : "static",
          top: 0,
          zIndex: isRunning ? 2 : "auto",
          bgcolor: "background.paper",
          "& .MuiAccordionSummary-content": {
            alignItems: "center",
            gap: 1,
            minWidth: 0,
            my: 0.75
          }
        }}
      >
        <ReasoningBlockTitleM
          kind={blockKind}
          isRunning={isRunning}
          startedAt={turn.startedAt}
          fallbackStartedAt={fallbackStartedAt}
          durationMs={turn.durationMs}
          entryCount={timelineEntries.length}
        />
      </AccordionSummary>
      {isExpanded ? (
        <AccordionDetails sx={{ pt: 0, pb: 1.25, px: 1.25, minWidth: 0, maxWidth: "100%" }}>
          <Stack spacing={1} sx={{ minWidth: 0, maxWidth: "100%" }}>
            {historyToggle}
            {visibleTimelineEntries.map((entry, index) => (
              <ReasoningTimelineEntryM
                key={buildTimelineEntryKey(entry, visibleTimelineStartIndex + index)}
                entry={entry}
                turn={turn}
                currentThread={currentThread}
                navigableThreadIds={navigableThreadIds}
                isRunning={isRunning}
                lastMessageRef={lastMessageRef}
                onOpenLink={onOpenLink}
                onNavigateThread={onNavigateThread}
              />
            ))}
          </Stack>
        </AccordionDetails>
      ) : null}
    </Accordion>
  );
}

export const ReasoningTimelineX = observer(ReasoningTimeline);

/** Classifies a reasoning block without reading its changing text content. */
function getBlockKind(items: readonly OpenCodexTurnItem[]): "reasoning" | "activity" | "mixed" {
  const hasCommentary = items.some(
    (item) => item.role === "assistant" && item.phase === "commentary"
  );
  const hasActivities = items.some((item) => item.role === "activity");

  if (hasCommentary && hasActivities) {
    return "mixed";
  }

  if (hasCommentary) {
    return "reasoning";
  }

  return "activity";
}

/** Reads the first available activity timestamp for pending turns. */
function readFirstCreatedAt(items: readonly OpenCodexTurnItem[]): string | null {
  for (const item of items) {
    if (item.createdAt !== null) {
      return item.createdAt;
    }
  }

  return null;
}

/** Builds a stable key for one visible reasoning entry. */
function buildTimelineEntryKey(
  entry: { type: "item"; item: OpenCodexTurnItem } | {
    type: "collaboration";
    event: OpenCodexCollaborationEvent;
  },
  index: number
): string {
  if (entry.type === "collaboration") {
    return ["assistantTurn", "collaboration", entry.event.id, index].join(":");
  }

  return [
    "assistantTurn",
    entry.item.role,
    entry.item.phase ?? "none",
    entry.item.kind ?? "none",
    entry.item.id,
    index
  ].join(":");
}
