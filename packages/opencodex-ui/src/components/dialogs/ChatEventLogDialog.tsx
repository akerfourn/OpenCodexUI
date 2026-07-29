/**
 * Displays the bounded metadata-only Codex event trace for one chat.
 */
import ExpandLessOutlinedIcon from "@mui/icons-material/ExpandLessOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexThreadEventLogEntry,
  OpenCodexThreadEventLogValue
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";

import { CopyIconButton } from "../common/CopyIconButton";

type ChatEventLogDialogProps = {
  open: boolean;
  threadId: string;
  threadTitle: string;
  sourceId: string | null;
  store: RootStore;
  onClose(): void;
};

/**
 * Renders one chat event log dialog.
 *
 * @param props Dialog properties.
 * @returns Rendered dialog.
 */
export function ChatEventLogDialog({
  open,
  threadId,
  threadTitle,
  sourceId,
  store,
  onClose
}: ChatEventLogDialogProps) {
  const { t } = useTranslation();
  const eventLogStore = store.chatEventLogStore;
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      eventLogStore.open(threadId, sourceId);
      setExpandedEntryId(null);
      return;
    }

    if (eventLogStore.activeThreadId === threadId) {
      eventLogStore.close();
    }
  }, [eventLogStore, open, sourceId, threadId]);

  function handleClose(): void {
    eventLogStore.close();
    onClose();
  }

  function handleRefresh(): void {
    void eventLogStore.refresh();
  }

  function handleToggleEntry(entryId: string): void {
    setExpandedEntryId((currentId) => currentId === entryId ? null : entryId);
  }

  const displayedEntries = eventLogStore.entries.slice().reverse();

  const body = eventLogStore.isLoading && eventLogStore.entries.length === 0 ? (
    <Stack spacing={1} sx={{ alignItems: "center", justifyContent: "center", minHeight: 220 }}>
      <CircularProgress size={24} />
      <Typography color="text.secondary">{t("chatEventLog.loading")}</Typography>
    </Stack>
  ) : (
    <Stack spacing={1}>
      {eventLogStore.error !== null ? (
        <Alert severity="error">{t("chatEventLog.loadError", { message: eventLogStore.error })}</Alert>
      ) : null}
      {eventLogStore.truncated ? (
        <Alert severity="info">{t("chatEventLog.truncated")}</Alert>
      ) : null}
      {eventLogStore.entries.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 3, textAlign: "center" }}>
          {t("chatEventLog.empty")}
        </Typography>
      ) : (
        <List disablePadding>
          {displayedEntries.map((entry) => (
            <ChatEventLogRow
              key={entry.id}
              entry={entry}
              expanded={expandedEntryId === entry.id}
              onToggle={handleToggleEntry}
            />
          ))}
        </List>
      )}
    </Stack>
  );

  return (
    <Dialog open={open} fullWidth maxWidth="md" onClose={handleClose}>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
          <EventNoteOutlinedIcon color="primary" sx={{ mt: 0.25 }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="h6" component="div" noWrap>
              {t("chatEventLog.title", { thread: threadTitle })}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
              {t("chatEventLog.description")}
            </Typography>
          </Box>
          <IconButton
            aria-label={t("chatEventLog.refresh")}
            title={t("chatEventLog.refresh")}
            disabled={eventLogStore.isLoading}
            onClick={handleRefresh}
          >
            {eventLogStore.isLoading ? <CircularProgress size={20} /> : <RefreshOutlinedIcon />}
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {body}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t("chatEventLog.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Renders one compact event row and its optional metadata details.
 *
 * @param props Row properties.
 * @returns Rendered event row.
 */
function ChatEventLogRow({
  entry,
  expanded,
  onToggle
}: {
  entry: OpenCodexThreadEventLogEntry;
  expanded: boolean;
  onToggle(entryId: string): void;
}) {
  const { t } = useTranslation();
  const stageLabel = entry.stage === "received"
    ? t("chatEventLog.received")
    : t("chatEventLog.uiEmitted");
  const timeLabel = formatTime(entry.occurredAt);
  const countLabel = entry.count > 1
    ? t("chatEventLog.occurrences", { count: entry.count })
    : null;
  const metadata = createMetadataRows(entry, t);
  const serializedMetadata = serializeEventMetadata(entry);

  return (
    <>
      <ListItemButton
        dense
        selected={expanded}
        onClick={() => onToggle(entry.id)}
        sx={{ alignItems: "flex-start", py: 1 }}
      >
        <ListItemIcon sx={{ minWidth: 34, mt: 0.25 }}>
          {expanded ? <ExpandLessOutlinedIcon fontSize="small" /> : <ExpandMoreOutlinedIcon fontSize="small" />}
        </ListItemIcon>
        <ListItemText
          primary={(
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
              <Typography component="span" variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                {entry.eventName}
              </Typography>
              <Typography component="span" variant="caption" color="text.secondary">
                {stageLabel}
              </Typography>
              {countLabel !== null ? (
                <Typography component="span" variant="caption" color="text.secondary">
                  {countLabel}
                </Typography>
              ) : null}
            </Stack>
          )}
          secondary={(
            <Typography component="span" variant="caption" color="text.secondary">
              {timeLabel}
              {entry.turnId === null ? "" : ` · turn ${entry.turnId}`}
              {entry.itemId === null ? "" : ` · item ${entry.itemId}`}
            </Typography>
          )}
        />
      </ListItemButton>
      {expanded ? (
        <Box sx={{ bgcolor: "action.hover", px: 3, py: 1.25 }}>
          <Stack spacing={0.5}>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "flex-end" }}>
              <CopyIconButton
                value={serializedMetadata}
                label={t("chatEventLog.copyMetadata")}
                copiedLabel={t("message.copied")}
              />
            </Stack>
            {metadata.map(([label, value]) => (
              <Stack key={label} direction="row" spacing={1} sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 150 }}>
                  {label}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}
                >
                  {formatMetadataValue(value)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      ) : null}
      <Divider component="li" />
    </>
  );
}

/**
 * Serializes the safe metadata retained for an event-log entry.
 *
 * @param entry Event entry to serialize.
 * @returns Human-readable JSON metadata.
 */
function serializeEventMetadata(entry: OpenCodexThreadEventLogEntry): string {
  return JSON.stringify({
    id: entry.id,
    sequence: entry.sequence,
    stage: entry.stage,
    eventName: entry.eventName,
    sourceId: entry.sourceId,
    threadId: entry.threadId,
    turnId: entry.turnId,
    itemId: entry.itemId,
    occurredAt: entry.occurredAt,
    lastOccurredAt: entry.lastOccurredAt,
    count: entry.count,
    details: entry.details
  }, null, 2);
}

/**
 * Builds the visible detail rows for one event.
 *
 * @param entry Event entry.
 * @param t Translation function.
 * @returns Label/value pairs.
 */
function createMetadataRows(
  entry: OpenCodexThreadEventLogEntry,
  t: (key: string, options?: Record<string, unknown>) => string
): Array<[string, OpenCodexThreadEventLogValue]> {
  const metadata: Array<[string, OpenCodexThreadEventLogValue]> = [
    [t("chatEventLog.sequence"), entry.sequence],
    [t("chatEventLog.source"), entry.sourceId],
    [t("chatEventLog.thread"), entry.threadId],
    [t("chatEventLog.turn"), entry.turnId],
    [t("chatEventLog.item"), entry.itemId],
    [t("chatEventLog.occurredAt"), entry.occurredAt],
    [t("chatEventLog.lastOccurredAt"), entry.lastOccurredAt],
    [t("chatEventLog.count"), entry.count]
  ];

  for (const [key, value] of Object.entries(entry.details)) {
    metadata.push([key, value]);
  }

  return metadata;
}

/**
 * Formats a metadata value without exposing structured raw payloads.
 *
 * @param value Metadata value.
 * @returns Display string.
 */
function formatMetadataValue(value: OpenCodexThreadEventLogValue): string {
  if (value === null) {
    return "—";
  }

  return String(value);
}

/**
 * Formats an ISO timestamp for compact local display.
 *
 * @param timestamp ISO timestamp.
 * @returns Local time string.
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleTimeString();
}

export const ChatEventLogDialogX = observer(ChatEventLogDialog);
