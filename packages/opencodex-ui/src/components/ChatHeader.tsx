import { observer } from "mobx-react-lite";
import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";

import type { RootStore } from "../stores/RootStore";

type ChatHeaderProps = {
  store: RootStore;
};

export const ChatHeader = observer(function ChatHeader({ store }: ChatHeaderProps) {
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
          <IconActionButton
            label="Rafraîchir"
            icon="refresh"
            disabled={store.isRefreshingThread}
            onClick={handleRefreshThread}
          />
          <IconActionButton label="Renommer" icon="edit" onClick={handleRenameOpen} />
        </Stack>
      </header>
      {renameModal}
    </>
  );
});

function RenameModal({ value, title, onCancel, onChange, onSubmit }: RenameModalProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onCancel}>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>Renommer le chat</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {title}
          </Typography>
          <TextField value={value} autoFocus fullWidth onChange={handleChange} />
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={onCancel}>
            Annuler
          </Button>
          <Button variant="contained" type="submit">
            Renommer
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

type RenameModalProps = {
  value: string;
  title: string;
  onCancel(): void;
  onChange(value: string): void;
  onSubmit(): void;
};

type IconActionButtonProps = {
  label: string;
  icon: "refresh" | "edit";
  disabled?: boolean;
  onClick(): void;
};

function IconActionButton({ label, icon, disabled = false, onClick }: IconActionButtonProps) {
  return (
    <IconButton
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon === "refresh" ? <RefreshOutlinedIcon fontSize="small" /> : <EditOutlinedIcon fontSize="small" />}
    </IconButton>
  );
}
