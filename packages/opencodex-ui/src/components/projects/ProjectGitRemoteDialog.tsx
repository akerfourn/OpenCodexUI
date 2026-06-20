/**
 * Renders Git remote configuration controls.
 */
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { type ChangeEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectGitStore } from "../../stores/ProjectGitStore";

type ProjectGitRemoteDialogProps = {
  gitStore: ProjectGitStore;
  open: boolean;
  onClose(): void;
};

/**
 * Renders a modal used to add or update a Git remote.
 *
 * @param props Component props.
 * @returns Rendered remote configuration dialog.
 */
export function ProjectGitRemoteDialog({
  gitStore,
  open,
  onClose
}: ProjectGitRemoteDialogProps) {
  const { t } = useTranslation();
  const [remoteName, setRemoteName] = useState("origin");
  const [remoteUrl, setRemoteUrl] = useState("");
  const primaryRemote = gitStore.primaryRemote;
  const canSave = remoteName.trim().length > 0 &&
    remoteUrl.trim().length > 0 &&
    !gitStore.isSavingRemote;

  useEffect(() => {
    if (!open) {
      return;
    }

    void gitStore.loadRemotes();
    setRemoteName(primaryRemote?.name ?? "origin");
    setRemoteUrl(primaryRemote?.pushUrl ?? primaryRemote?.fetchUrl ?? "");
  }, [gitStore, open]);

  function handleNameChange(event: ChangeEvent<HTMLInputElement>): void {
    setRemoteName(event.target.value);
  }

  function handleUrlChange(event: ChangeEvent<HTMLInputElement>): void {
    setRemoteUrl(event.target.value);
  }

  async function handleSubmit(): Promise<void> {
    const didSave = await gitStore.upsertRemote(remoteName, remoteUrl);

    if (didSave) {
      onClose();
    }
  }

  const currentRemoteContent = primaryRemote === null ? (
    <Typography variant="body2" color="text.secondary">
      {t("git.remoteEmpty")}
    </Typography>
  ) : (
    <Stack spacing={0.25}>
      <Typography variant="body2">
        {primaryRemote.name}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
        {primaryRemote.pushUrl ?? primaryRemote.fetchUrl}
      </Typography>
    </Stack>
  );

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{t("git.remoteConfigureTitle")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack spacing={0.75}>
            <Typography variant="subtitle2">
              {t("git.remoteCurrent")}
            </Typography>
            {currentRemoteContent}
          </Stack>
          {gitStore.remoteErrorMessage !== null ? (
            <Alert severity="error">{gitStore.remoteErrorMessage}</Alert>
          ) : null}
          <TextField
            label={t("git.remoteName")}
            value={remoteName}
            autoFocus
            fullWidth
            disabled={gitStore.isSavingRemote}
            onChange={handleNameChange}
          />
          <TextField
            label={t("git.remoteUrl")}
            value={remoteUrl}
            fullWidth
            disabled={gitStore.isSavingRemote}
            onChange={handleUrlChange}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={gitStore.isSavingRemote} onClick={onClose}>
          {t("git.close")}
        </Button>
        <Button
          variant="contained"
          disabled={!canSave}
          startIcon={gitStore.isSavingRemote ? <CircularProgress color="inherit" size={14} /> : undefined}
          onClick={handleSubmit}
        >
          {t("git.remoteSave")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const ProjectGitRemoteDialogX = observer(ProjectGitRemoteDialog);
