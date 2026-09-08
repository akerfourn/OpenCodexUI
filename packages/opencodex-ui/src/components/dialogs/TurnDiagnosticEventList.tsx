/**
 * Renders the causal events retained for one developer-mode turn diagnostic.
 */
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexTurnDiagnosticEvent } from "@open-codex-ui/opencodex-protocol";

import { CopyIconButton } from "../common/CopyIconButton";
import { TurnDiagnosticEventFilter } from "./TurnDiagnosticEventFilter";

type TurnDiagnosticEventListProps = {
  events: OpenCodexTurnDiagnosticEvent[];
};

/** Renders an expandable chronological list of diagnostic events. */
export function TurnDiagnosticEventList({ events }: TurnDiagnosticEventListProps) {
  const { t } = useTranslation();
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [hiddenEventNames, setHiddenEventNames] = useState<string[]>([]);
  const eventNames = useMemo(
    () => Array.from(new Set(events.map((event) => event.eventName))),
    [events]
  );
  const selectedEventNames = eventNames.filter((eventName) => !hiddenEventNames.includes(eventName));
  const visibleEvents = events.filter((event) => !hiddenEventNames.includes(event.eventName));

  useEffect(() => {
    if (expandedEventId !== null && !visibleEvents.some((event) => event.id === expandedEventId)) {
      setExpandedEventId(null);
    }
  }, [expandedEventId, visibleEvents]);

  function handleToggle(eventId: string): void {
    setExpandedEventId((currentId) => currentId === eventId ? null : eventId);
  }

  function handleEventNameChange(selectedNames: string[]): void {
    setHiddenEventNames(eventNames.filter((eventName) => !selectedNames.includes(eventName)));
  }

  function handleShowAllEventNames(): void {
    setHiddenEventNames([]);
  }

  return (
    <Stack spacing={1}>
      {eventNames.length > 0 ? (
        <TurnDiagnosticEventFilter
          eventNames={eventNames}
          selectedEventNames={selectedEventNames}
          visibleCount={visibleEvents.length}
          totalCount={events.length}
          onChange={handleEventNameChange}
          onShowAll={handleShowAllEventNames}
        />
      ) : null}

      {visibleEvents.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2, textAlign: "center" }}>
          {t("turnDiagnostics.noMatchingEvents")}
        </Typography>
      ) : null}

      <List disablePadding>
        {visibleEvents.map((event) => {
          const isExpanded = expandedEventId === event.id;
          const sourceLabel = event.source === "request"
            ? t("turnDiagnostics.request")
            : event.source === "notification"
              ? t("turnDiagnostics.notification")
              : t("turnDiagnostics.backendEvent");
          const countLabel = t("turnDiagnostics.eventCount", { count: event.count });
          const eventDetails = JSON.stringify(event, null, 2);

          return (
            <Box key={event.id}>
              <ListItemButton
                dense
                selected={isExpanded}
                onClick={() => handleToggle(event.id)}
                sx={{ alignItems: "flex-start", py: 0.75 }}
              >
                <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
                  {isExpanded
                    ? <ExpandLessOutlinedIcon fontSize="small" />
                    : <ExpandMoreOutlinedIcon fontSize="small" />}
                </ListItemIcon>
                <ListItemText
                  primary={(
                    <Stack
                      direction="row"
                      spacing={1}
                      useFlexGap
                      sx={{ alignItems: "center", flexWrap: "wrap", minWidth: 0 }}
                    >
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{ fontFamily: "monospace", fontWeight: 600, overflowWrap: "anywhere" }}
                      >
                        {event.eventName}
                      </Typography>
                      <Typography component="span" variant="caption" color="text.secondary">
                        {sourceLabel}
                      </Typography>
                      <Typography component="span" variant="caption" color="text.secondary">
                        {countLabel}
                      </Typography>
                    </Stack>
                  )}
                  secondary={(
                    <Typography component="span" variant="caption" color="text.secondary">
                      #{event.sequence} · {formatEventTime(event.occurredAt)}
                      {event.lastOccurredAt !== event.occurredAt
                        ? ` → ${formatEventTime(event.lastOccurredAt)}`
                        : ""}
                    </Typography>
                  )}
                />
              </ListItemButton>
              {isExpanded ? (
                <Box sx={{ bgcolor: "action.hover", px: 2, py: 1, pl: 7 }}>
                  <Stack spacing={0.75}>
                    <Typography variant="caption" color="text.secondary">
                      {t("turnDiagnostics.details")}
                    </Typography>
                    <Typography
                      component="pre"
                      variant="body2"
                      sx={{
                        fontFamily: "monospace",
                        m: 0,
                        maxHeight: 220,
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere"
                      }}
                    >
                      {eventDetails}
                    </Typography>
                    <CopyIconButton
                      value={eventDetails}
                      label={t("turnDiagnostics.copy")}
                      copiedLabel={t("message.copied")}
                      sx={{ alignSelf: "flex-end" }}
                    />
                  </Stack>
                </Box>
              ) : null}
            </Box>
          );
        })}
      </List>
    </Stack>
  );
}

/** Formats a diagnostic timestamp without failing on malformed historical data. */
function formatEventTime(value: string): string {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return timestamp.toLocaleString();
}
