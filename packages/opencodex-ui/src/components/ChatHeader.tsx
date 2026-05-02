import { observer } from "mobx-react-lite";
import { useState } from "react";
import { Box, CircularProgress, IconButton, Stack, Typography } from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";

import type { RootStore } from "../stores/RootStore";
import { RenameModal } from "./RenameModal";

type ChatHeaderProps = {
  store: RootStore;
};

export function ChatHeader({ store }: ChatHeaderProps) {
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const currentThread = store.currentThread;

  if (currentThread === null) {
    return null;
  }

  const title = currentThread.title || currentThread.preview || "Nouvelle conversation";
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
      <header className="chat-header">
        <Box className="chat-title" sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2" noWrap>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {currentThread.projectPath ?? "Workspace non renseigné"}
          </Typography>
          {currentThread.model !== null ? (
            <Typography variant="body2" color="text.secondary" noWrap>
              Modèle: {currentThread.model}
            </Typography>
          ) : null}
          {currentThread.reasoningEffort !== null ? (
            <Typography variant="body2" color="text.secondary" noWrap>
              Raisonnement: {currentThread.reasoningEffort}
            </Typography>
          ) : null}
        </Box>
        <Stack className="chat-header-actions" direction="row" spacing={1}>
          <IconButton
            aria-label="Rafraîchir"
            title="Rafraîchir"
            disabled={store.isRefreshingThread}
            onClick={handleRefreshThread}
          >
            {store.isRefreshingThread ? (
              <CircularProgress size={18} thickness={5} />
            ) : (
              <RefreshOutlinedIcon fontSize="small" />
            )}
          </IconButton>
          <IconButton aria-label="Renommer" title="Renommer" onClick={handleRenameOpen}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Stack>
      </header>
      {renameModal}
    </>
  );
}

export const ChatHeaderX = observer(ChatHeader);
