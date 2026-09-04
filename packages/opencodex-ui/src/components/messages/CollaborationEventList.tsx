import { Stack, Typography } from "@mui/material";
import { memo } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexCollaborationEvent,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { CollaborationEventCardM } from "./CollaborationEventCard";

type CollaborationEventListProps = {
  events: readonly OpenCodexCollaborationEvent[];
  currentThread: OpenCodexThread;
  isThreadContext?: boolean;
  navigableThreadIds?: readonly string[];
  onNavigateThread(threadId: string): void;
};

/** Renders one stable collection of collaboration cards. */
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
        <CollaborationEventCardM
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

export const CollaborationEventListM = memo(CollaborationEventList);
