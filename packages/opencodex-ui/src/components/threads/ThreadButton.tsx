import { observer } from "mobx-react-lite";
import { Box, CircularProgress, ListItemButton, ListItemIcon, Stack, Typography } from "@mui/material";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
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
  const setupPending = projectStore.project.kind === "discussion" && projectStore.project.path.length > 0
    && projectStore.chatsById.get(thread.id)?.isLocalDraft === true;
  const title = getThreadTitle(thread, setupPending ? t("discussions.setupPending") : t("chat.untitled"));
  let metadata = getThreadMetadata(thread);
  const isDiscussion = projectStore.project.kind === "discussion";
  if (isDiscussion) {
    const sourceName = root.sourcesStore.findSource(thread.sourceId)?.name;
    metadata = [sourceName, thread.model, thread.reasoningEffort].filter(isNonEmptyString).join(" · ");
  }
  const isSelected = projectStore.selectedChatId === thread.id
    && (!isDiscussion || root.discussionsStore.selectedEnvironmentId === projectStore.project.id);
  const loading = list.loadingThreadId === thread.id;
  const archiving = list.archivingThreadId === thread.id;
  const indicator = projectStore.getThreadIndicatorState(thread.id);
  const iconClassName = indicator === "unseen" ? "work-indicator-pulse" : undefined;
  let icon = loading || archiving || indicator === "running"
    ? <CircularProgress size={16} thickness={5} />
    : <ChatBubbleOutlineOutlinedIcon className={iconClassName} fontSize="small" />;
  if (setupPending) icon = <WarningAmberOutlinedIcon color="warning" fontSize="small" />;
  const metadataContent = metadata === null ? null
    : <Typography variant="caption" component="div" color="text.secondary" noWrap>{metadata}</Typography>;
  /** Archived conversations retain their existing catalogue-only behavior. */
  function handleOpenThread(): void {
    if (isDiscussion) {
      root.discussionsStore.open(projectStore, thread);
      return;
    }
    if (!list.isShowingArchivedThreads) projectStore.openThread(thread.id);
  }
  return (
    <ListItemButton component="div" selected={isSelected}
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
