/**
 * Renders the chat header component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { Box, CircularProgress, IconButton, LinearProgress, Typography } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import { RenameModal } from "../dialogs/RenameModal";

type ChatHeaderProps = {
  store: RootStore;
};

/**
 * Renders the chat header component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ChatHeader({ store }: ChatHeaderProps) {
  const { t } = useTranslation();
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const currentThread = store.currentThread;

  if (currentThread === null) {
    return null;
  }

  const title = currentThread.title || currentThread.preview || t("chat.newConversation");
  const renameModal = isRenameModalOpen ? (
    <RenameModal
      value={renameValue}
      title={title}
      onCancel={handleRenameCancel}
      onChange={handleRenameChange}
      onSubmit={handleRenameSubmit}
    />
  ) : null;

  function handleRenameOpen(): void {
    setRenameValue(title);
    setIsRenameModalOpen(true);
  }

  function handleRenameCancel(): void {
    setIsRenameModalOpen(false);
    setRenameValue("");
  }

  function handleRenameChange(value: string): void {
    setRenameValue(value);
  }

  function handleRenameSubmit(): void {
    if (renameValue.trim().length > 0) {
      store.renameCurrentThread(renameValue);
      setIsRenameModalOpen(false);
      setRenameValue("");
    }
  }

  function handleRefreshThread(): void {
    store.refreshCurrentThread();
  }

  return (
    <>
      <Box component="header" className="chat-header" sx={{ position: "relative" }}>
        <Box className="chat-title" sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography variant="h6" component="h2" noWrap>
            {title}
          </Typography>
          <IconButton
            className="chat-title-inline-action"
            aria-label={t("header.rename")}
            title={t("header.rename")}
            size="small"
            onClick={handleRenameOpen}
          >
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
          <Box className="chat-title-spacer" />
          <Box className="chat-header-actions">
            <IconButton
              aria-label={t("header.refresh")}
              title={t("header.refresh")}
              size="small"
              disabled={store.isRefreshingThread || store.isSyncingCurrentThread}
              onClick={handleRefreshThread}
            >
              {store.isRefreshingThread || store.isSyncingCurrentThread ? (
                <CircularProgress size={18} thickness={5} />
              ) : (
                <RefreshOutlinedIcon fontSize="small" />
              )}
            </IconButton>
          </Box>
        </Box>
        {store.isSyncingCurrentThread ? (
          <LinearProgress
            sx={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 2
            }}
          />
        ) : null}
      </Box>
      {renameModal}
    </>
  );
}

export const ChatHeaderX = observer(ChatHeader);
