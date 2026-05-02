import { useState, type RefObject } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Stack,
  Typography
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";

import type { OpenCodexTurn, OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";

import { MessageRowM } from "./MessageRow";

type AssistantTurnBlockProps = {
  turn: OpenCodexTurn;
  lastMessageRef: RefObject<HTMLElement>;
  isLast: boolean;
  onOpenLink(href: string): void;
};

export function AssistantTurnBlock({
  turn,
  lastMessageRef,
  isLast,
  onOpenLink
}: AssistantTurnBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const blockRef = isLast ? lastMessageRef : undefined;
  const preludeItems = turn.items.filter(isPreludeItem);
  const label = formatBlockLabel(getBlockKind(preludeItems), turn.durationMs);

  return (
    <Box ref={blockRef} component="article">
      <Accordion
        expanded={expanded}
        elevation={0}
        disableGutters
        square
        onChange={(_event, nextExpanded) => {
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
            "& .MuiAccordionSummary-content": {
              alignItems: "center",
              gap: 1,
              my: 1
            }
          }}
        >
          <PsychologyOutlinedIcon fontSize="small" />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ({preludeItems.length})
          </Typography>
        </AccordionSummary>
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
  durationMs: number | null
): string {
  const baseLabel = kind === "reasoning"
    ? "Réflexion"
    : kind === "mixed"
      ? "Réflexion et activités"
      : "Activités";

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
