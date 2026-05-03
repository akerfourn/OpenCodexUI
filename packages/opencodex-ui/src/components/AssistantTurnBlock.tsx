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
  isRunning: boolean;
  lastMessageRef: RefObject<HTMLElement>;
  isLast: boolean;
  onOpenLink(href: string): void;
};

export function AssistantTurnBlock({
  turn,
  isRunning,
  lastMessageRef,
  isLast,
  onOpenLink
}: AssistantTurnBlockProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const blockRef = isLast ? lastMessageRef : undefined;
  const preludeItems = turn.items.filter(isPreludeItem);
  const displayedDurationMs = isRunning
    ? Math.max(0, now - readStartedAtTime(turn.startedAt))
    : turn.durationMs;
  const label = isRunning
    ? t("reasoningBlock.active", { duration: formatDuration(displayedDurationMs) ?? "0 s" })
    : formatBlockLabel(getBlockKind(preludeItems), turn.durationMs, t);
  const isExpanded = isRunning || expanded;
  const detailsContent = isExpanded ? (
    <AccordionDetails sx={{ pt: 0, pb: 1.25, px: 1.25 }}>
      <Stack spacing={1}>
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

    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRunning]);

  return (
    <Box ref={blockRef} component="article">
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
          bgcolor: "grey.50",
          overflow: "hidden",
          "&:before": {
            display: "none"
          }
        }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon fontSize="small" />}
          sx={{
            minHeight: 0,
            px: 1.25,
            position: isRunning ? "sticky" : "static",
            top: 0,
            zIndex: isRunning ? 2 : "auto",
            bgcolor: "grey.50",
            "& .MuiAccordionSummary-content": {
              alignItems: "center",
              gap: 1,
              my: 1
            }
          }}
        >
          {isRunning ? (
            <CircularProgress size={16} thickness={5} />
          ) : (
            <PsychologyOutlinedIcon fontSize="small" />
          )}
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
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

function readStartedAtTime(value: string | null): number {
  if (value === null) {
    return Date.now();
  }

  const time = Date.parse(value);
  return Number.isNaN(time) ? Date.now() : time;
}

function isPreludeItem(item: OpenCodexTurnItem): boolean {
  return item.role === "activity" || (item.role === "assistant" && item.phase === "commentary");
}

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
