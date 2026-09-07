import { observer } from "mobx-react-lite";
import { Box, CircularProgress, ListItemButton, ListItemIcon, Stack, Typography } from "@mui/material";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import { useTranslation } from "react-i18next";
import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import type { RootStore } from "../../stores/RootStore";
import type { OpenSubAgentDialog } from "./subAgentDialog";
import { ThreadActionsMenuX } from "./ThreadActionsMenu";

/** Displays a conversation row; properties and lifecycle actions live in its menu. */
export function ThreadButton({ projectStore, root, thread, onOpenSubAgentDialog }: {
  projectStore: ProjectStore; root: RootStore; thread: OpenCodexThread;
  onOpenSubAgentDialog: OpenSubAgentDialog;
}) {
  const { t } = useTranslation();
  const list = projectStore.threadListStore;
  const title = getThreadTitle(thread, t("chat.untitled"));
  const metadata = getThreadMetadata(thread);
  const loading = list.loadingThreadId === thread.id;
  const archiving = list.archivingThreadId === thread.id;
  const indicator = projectStore.getThreadIndicatorState(thread.id);
  const iconClassName = indicator === "unseen" ? "work-indicator-pulse" : undefined;
  const icon = loading || archiving || indicator === "running"
    ? <CircularProgress size={16} thickness={5} />
    : <ChatBubbleOutlineOutlinedIcon className={iconClassName} fontSize="small" />;
  const metadataContent = metadata === null ? null
    : <Typography variant="caption" component="div" color="text.secondary" noWrap>{metadata}</Typography>;
  /** Archived conversations retain their existing catalogue-only behavior. */
  function handleOpenThread(): void {
    if (!list.isShowingArchivedThreads) projectStore.openThread(thread.id);
  }
  return (
    <ListItemButton component="div" selected={projectStore.selectedChatId === thread.id}
      disabled={loading || archiving} onClick={handleOpenThread}
      sx={{ mb: 0.5, alignItems: "flex-start", borderRadius: 1 }}>
      <ListItemIcon sx={{ minWidth: 28, color: "inherit", mt: "2px" }}>{icon}</ListItemIcon>
      <Stack direction="row" spacing={0.5} sx={{ minWidth: 0, flex: 1, alignItems: "flex-start" }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" noWrap>{title}</Typography>
          {metadataContent}
        </Box>
        <ThreadActionsMenuX project={projectStore} root={root} thread={thread} title={title}
          onOpenSubAgentDialog={onOpenSubAgentDialog} />
      </Stack>
    </ListItemButton>
  );
}
export const ThreadButtonX = observer(ThreadButton);

/**
 * Returns thread metadata.
 *
 * @param thread Thread payload to process.
 *
 * @returns String value, or `null` when unavailable.
 */
function getThreadMetadata(thread: OpenCodexThread): string | null {
  const parts = [
    thread.branchName,
    thread.model,
    thread.reasoningEffort
  ].filter(isNonEmptyString);

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" - ");
}

/**
 * Returns thread title.
 *
 * @param thread Thread payload to process.
 * @param fallbackTitle Fallback title.
 *
 * @returns Computed string value.
 */
function getThreadTitle(thread: OpenCodexThread, fallbackTitle: string): string {
  if (thread.title.trim().length > 0) {
    return thread.title;
  }

  if (thread.preview.trim().length > 0) {
    return thread.preview;
  }

  return fallbackTitle;
}

/**
 * Checks whether non empty string.
 *
 * @param value Value to normalize.
 *
 * @returns Computed value.
 */
function isNonEmptyString(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim().length > 0;
}
