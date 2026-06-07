/**
 * Renders the thread button component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import { useState, type MouseEvent } from "react";
import { Box, CircularProgress, IconButton, ListItemButton, ListItemIcon, Menu, MenuItem, Stack, Typography } from "@mui/material";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import { useTranslation } from "react-i18next";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "../../stores/ProjectStore";

type ThreadButtonProps = {
  projectStore: ProjectStore;
  thread: OpenCodexThread;
};

/**
 * Renders the thread button component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ThreadButton({ projectStore, thread }: ThreadButtonProps) {
  const { t } = useTranslation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const threadListStore = projectStore.threadListStore;
  const isMenuOpen = menuAnchor !== null;

  function handleOpenThread(): void {
    if (threadListStore.isShowingArchivedThreads) {
      return;
    }

    projectStore.openThread(thread.id);
  }

  function handleOpenMenu(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  }

  function handleCloseMenu(): void {
    setMenuAnchor(null);
  }

  function handleArchiveThread(): void {
    handleCloseMenu();
    threadListStore.archiveThread(thread.id);
  }

  function handleUnarchiveThread(): void {
    handleCloseMenu();
    threadListStore.unarchiveThread(thread.id);
  }

  const isActive = projectStore.selectedChatId === thread.id;
  const isLoading = projectStore.loadingThreadId === thread.id;
  const isArchiving = threadListStore.archivingThreadId === thread.id;
  const indicatorState = projectStore.getThreadIndicatorState(thread.id);
  const shouldShowLoading = isLoading || isArchiving || indicatorState === "running";
  const chatIconClassName = indicatorState === "unseen" ? "work-indicator-pulse" : undefined;
  const metadata = getThreadMetadata(thread);
  const archiveAction = threadListStore.isShowingArchivedThreads
    ? (
        <MenuItem onClick={handleUnarchiveThread}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <UnarchiveOutlinedIcon fontSize="small" />
          </ListItemIcon>
          {t("sidebar.unarchiveThread")}
        </MenuItem>
      )
    : (
        <MenuItem onClick={handleArchiveThread}>
          <ListItemIcon sx={{ minWidth: 32 }}>
            <ArchiveOutlinedIcon fontSize="small" />
          </ListItemIcon>
          {t("sidebar.archiveThread")}
        </MenuItem>
      );

  return (
    <ListItemButton
      component="div"
      selected={isActive}
      disabled={isLoading || isArchiving}
      onClick={handleOpenThread}
      sx={{ mb: 0.5, alignItems: "flex-start", borderRadius: 1 }}
    >
      <ListItemIcon sx={{ minWidth: 28, color: "inherit", mt: "2px" }}>
        {shouldShowLoading ? (
          <CircularProgress size={16} thickness={5} />
        ) : (
          <ChatBubbleOutlineOutlinedIcon className={chatIconClassName} fontSize="small" />
        )}
      </ListItemIcon>
      <Stack direction="row" spacing={0.5} sx={{ minWidth: 0, flex: 1, alignItems: "flex-start" }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" noWrap>
            {getThreadTitle(thread, t("chat.untitled"))}
          </Typography>
          {metadata !== null ? (
            <Typography variant="caption" component="div" color="text.secondary" noWrap>
              {metadata}
            </Typography>
          ) : null}
        </Box>
        <IconButton
          aria-label={t("sidebar.threadActions")}
          size="small"
          disabled={isArchiving}
          onClick={handleOpenMenu}
          sx={{ mt: -0.5 }}
        >
          <MoreVertOutlinedIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Menu
        anchorEl={menuAnchor}
        open={isMenuOpen}
        onClose={handleCloseMenu}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {archiveAction}
      </Menu>
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
