/**
 * Renders the assistant turn block component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import { useEffect, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  CircularProgress,
  Stack,
  Typography
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";

import type { OpenCodexTurn, OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";

import { MessageRowM } from "./MessageRow";

type AssistantTurnBlockProps = {
  turn: OpenCodexTurn;
  preludeItems: OpenCodexTurnItem[];
  isRunning: boolean;
  lastMessageRef: RefObject<HTMLElement>;
  isLast: boolean;
  onOpenLink(href: string): void;
};

/**
 * Renders the assistant turn block component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function AssistantTurnBlock({
  turn,
  preludeItems,
  isRunning,
  lastMessageRef,
  isLast,
  onOpenLink
}: AssistantTurnBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const blockRef = isLast ? lastMessageRef : undefined;
  const runningStartedAt = turn.startedAt ?? readFirstCreatedAt(preludeItems);
  const displayedDurationMs = isRunning
    ? Math.max(0, now - readStartedAtTime(runningStartedAt))
    : turn.durationMs;
  const label = isRunning
    ? t("reasoningBlock.active", { duration: formatDuration(displayedDurationMs) ?? "0 s" })
    : formatBlockLabel(getBlockKind(preludeItems), turn.durationMs, t);
  const isExpanded = isRunning || expanded;
  const detailsContent = isExpanded ? (
    <AccordionDetails sx={{ pt: 0, pb: 1.25, px: 1.25, minWidth: 0, maxWidth: "100%" }}>
      <Stack spacing={1} sx={{ minWidth: 0, maxWidth: "100%" }}>
        {preludeItems.map((item, index) => (
          <MessageRowM
            key={buildMessageKey(item, index)}
            isLast={false}
            lastMessageRef={lastMessageRef}
            onOpenLink={onOpenLink}
            role={item.role}
            phase={item.phase}
            kind={item.kind}
            content={item.content}
            createdAt={item.createdAt}
            details={item.details}
            attachments={item.attachments ?? []}
          />
        ))}
      </Stack>
    </AccordionDetails>
  ) : null;

  useEffect(() => {
    if (!isRunning) {
      setExpanded(false);
      return undefined;
    }

    setNow(Date.now());
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning]);

  return (
    <Box
      ref={blockRef}
      component="article"
      sx={{
        display: "block",
        flex: "0 0 auto",
        minWidth: 0,
        minHeight: 36,
        width: "100%",
        maxWidth: "100%",
        overflow: "visible"
      }}
    >
      <Accordion
        expanded={isExpanded}
        elevation={0}
        disableGutters
        square
        onChange={(_event, nextExpanded) => {
          if (isRunning) {
            return;
          }

          setExpanded(nextExpanded);
        }}
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
          {isRunning ? (
            <CircularProgress size={16} thickness={5} />
          ) : (
            <PsychologyOutlinedIcon fontSize="small" />
          )}
          <Typography variant="body2" noWrap sx={{ fontWeight: 600, minWidth: 0 }}>
            {label}
          </Typography>
          {preludeItems.length > 0 ? (
            <Typography variant="caption" color="text.secondary">
              ({preludeItems.length})
            </Typography>
          ) : null}
        </AccordionSummary>
        {detailsContent}
      </Accordion>
    </Box>
  );
}

export const AssistantTurnBlockX = observer(AssistantTurnBlock);

/**
 * Returns block kind.
 *
 * @param items Items.
 *
 * @returns Computed value.
 */
function getBlockKind(items: OpenCodexTurnItem[]): "reasoning" | "activity" | "mixed" {
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

/**
 * Handles format block label.
 *
 * @param kind Kind.
 * @param durationMs Duration ms.
 * @param t T.
 *
 * @returns Computed string value.
 */
function formatBlockLabel(
  kind: "reasoning" | "activity" | "mixed",
  durationMs: number | null,
  t: ReturnType<typeof useTranslation>["t"]
): string {
  const baseLabel = kind === "reasoning"
    ? t("reasoningBlock.reasoning")
    : kind === "mixed"
      ? t("reasoningBlock.mixed")
      : t("reasoningBlock.activity");

  const durationLabel = formatDuration(durationMs);

  return durationLabel === null ? baseLabel : `${baseLabel} (${durationLabel})`;
}

/**
 * Handles format duration.
 *
 * @param durationMs Duration ms.
 *
 * @returns String value, or `null` when unavailable.
 */
function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null || durationMs <= 0) {
    return null;
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const segments: string[] = [];

  if (hours > 0) {
    segments.push(`${hours} h`);
  }

  if (hours > 0 || minutes > 0) {
    segments.push(`${minutes} min`);
  }

  segments.push(`${seconds} s`);
  return segments.join(" ");
}

/**
 * Reads started at time.
 *
 * @param value Value to normalize.
 *
 * @returns Computed value.
 */
function readStartedAtTime(value: string | null): number {
  if (value === null) {
    return Date.now();
  }

  const time = Date.parse(value);
  return Number.isNaN(time) ? Date.now() : time;
}

function readFirstCreatedAt(items: OpenCodexTurnItem[]): string | null {
  for (const item of items) {
    if (item.createdAt !== null) {
      return item.createdAt;
    }
  }

  return null;
}

/**
 * Checks whether prelude item.
 *
 * @param item Item payload.
 *
 * @returns `true` when the condition is met.
 */
/**
 * Builds message key.
 *
 * @param item Item payload.
 * @param index Index.
 *
 * @returns Computed string value.
 */
function buildMessageKey(item: OpenCodexTurnItem, index: number): string {
  return [
    "assistantTurn",
    item.role,
    item.phase ?? "none",
    item.kind ?? "none",
    item.id,
    index
  ].join(":");
}
