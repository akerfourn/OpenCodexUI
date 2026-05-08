/**
 * Renders the thread button component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import { Box, CircularProgress, ListItemButton, ListItemIcon, Typography } from "@mui/material";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import { useTranslation } from "react-i18next";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";

type ThreadButtonProps = {
  store: RootStore;
  thread: OpenCodexThread;
};

/**
 * Renders the thread button component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ThreadButton({ store, thread }: ThreadButtonProps) {
  const { t } = useTranslation();

  function handleOpenThread(): void {
    store.openThread(thread.id);
  }

  const isActive = store.currentThread?.id === thread.id;
  const isLoading = store.loadingThreadId === thread.id;
  const metadata = getThreadMetadata(thread);

  return (
    <ListItemButton
      selected={isActive}
      disabled={isLoading}
      onClick={handleOpenThread}
      sx={{ mb: 0.5, alignItems: "flex-start", borderRadius: 1 }}
    >
      <ListItemIcon sx={{ minWidth: 28, color: "inherit", mt: "2px" }}>
        {isLoading ? (
          <CircularProgress size={16} thickness={5} />
        ) : (
          <ChatBubbleOutlineOutlinedIcon fontSize="small" />
        )}
      </ListItemIcon>
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
