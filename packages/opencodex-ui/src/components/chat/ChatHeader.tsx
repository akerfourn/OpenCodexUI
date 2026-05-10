/**
 * Renders the chat header component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { Box, CircularProgress, IconButton, LinearProgress, Typography } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { useTranslation } from "react-i18next";

import type { ChatStore } from "../../stores/ChatStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { RenameModal } from "../dialogs/RenameModal";

type ChatHeaderProps = {
  projectStore: ProjectStore;
  chatStore: ChatStore;
};

/**
 * Renders the chat header component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ChatHeader({ projectStore, chatStore }: ChatHeaderProps) {
  const { t } = useTranslation();
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const currentThread = chatStore.thread;
  const isOrphanProject = projectStore.isOrphan;

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
    if (isOrphanProject) {
      return;
    }

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
      chatStore.rename(renameValue);
      setIsRenameModalOpen(false);
      setRenameValue("");
    }
  }

  function handleRefreshThread(): void {
    chatStore.refresh();
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
            disabled={isOrphanProject}
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
              disabled={isOrphanProject || chatStore.isRefreshing || chatStore.isSyncing}
              onClick={handleRefreshThread}
            >
              {chatStore.isRefreshing || chatStore.isSyncing ? (
                <CircularProgress size={18} thickness={5} />
              ) : (
                <RefreshOutlinedIcon fontSize="small" />
              )}
            </IconButton>
          </Box>
        </Box>
        {chatStore.isSyncing ? (
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
