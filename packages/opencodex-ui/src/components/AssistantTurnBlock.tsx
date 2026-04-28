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

import type { OpenCodexMessage } from "@open-codex-ui/opencodex-protocol";

import { MessageRowM } from "./MessageRow";

type AssistantTurnBlockProps = {
  messages: OpenCodexMessage[];
  lastMessageRef: RefObject<HTMLElement>;
  isLast: boolean;
  onOpenLink(href: string): void;
};

export function AssistantTurnBlock({
  messages,
  lastMessageRef,
  isLast,
  onOpenLink
}: AssistantTurnBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const blockRef = isLast ? lastMessageRef : undefined;
  const durationMs = getBlockDuration(messages);
  const label = formatBlockLabel(getBlockKind(messages), durationMs);

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
            ({messages.length})
          </Typography>
        </AccordionSummary>
        <AccordionDetails sx={{ pt: 0, pb: 1.25, px: 1.25 }}>
          <Stack spacing={1}>
            {messages.map((message, index) => (
              <MessageRowM
                key={buildMessageKey(message, index)}
                isLast={false}
                lastMessageRef={lastMessageRef}
                onOpenLink={onOpenLink}
                role={message.role}
                phase={message.phase}
                kind={message.kind}
                content={message.content}
              />
            ))}
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}

function getBlockKind(messages: OpenCodexMessage[]): "reasoning" | "activity" | "mixed" {
  const hasCommentary = messages.some(
    (message) => message.role === "assistant" && message.phase === "commentary"
  );
  const hasActivities = messages.some((message) => message.role === "activity");

  if (hasCommentary && hasActivities) {
    return "mixed";
  }

  if (hasCommentary) {
    return "reasoning";
  }

  return "activity";
}

function getBlockDuration(messages: OpenCodexMessage[]): number | null {
  const duration = messages.find((message) => message.turnDurationMs !== undefined && message.turnDurationMs !== null);

  return duration?.turnDurationMs ?? null;
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

function buildMessageKey(message: OpenCodexMessage, index: number): string {
  return [
    "assistantTurn",
    message.turnId ?? "no-turn",
    message.role,
    message.phase ?? "none",
    message.kind ?? "none",
    message.itemId ?? message.id,
    message.id,
    index
  ].join(":");
}
