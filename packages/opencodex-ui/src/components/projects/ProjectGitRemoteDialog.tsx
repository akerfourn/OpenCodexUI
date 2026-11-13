import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Stack, Tooltip, Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexGitRemote } from "@open-codex-ui/opencodex-protocol";
import type { ProjectGitReferencesStore } from "../../stores/project/git/ProjectGitReferencesStore";
import { ProjectGitRemoteEditorX } from "./ProjectGitRemoteEditor";
import { ProjectGitRemoteRowX } from "./ProjectGitRemoteRow";

interface ProjectGitRemoteDialogProps {
  referencesStore: ProjectGitReferencesStore;
  open: boolean;
  onClose(): void;
}

/** Lists all remotes with separate creation, URL editing, and confirmed removal. */
export function ProjectGitRemoteDialog({ referencesStore, open, onClose }: ProjectGitRemoteDialogProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<OpenCodexGitRemote | "new" | null>(null);
  const [removing, setRemoving] = useState<OpenCodexGitRemote | null>(null);
  const busy = !referencesStore.canManageRemotes;
  const canManage = !busy && referencesStore.hasLoadedRemotes;

  useEffect(() => {
    setEditing(null);
    setRemoving(null);
    if (open) void referencesStore.loadRemotes();
  }, [referencesStore, open]);

  /** Keeps the dialog open while Git is acknowledging a mutation. */
  function handleClose(): void {
    if (!referencesStore.isSavingRemote) onClose();
  }

  /** Opens an empty form without reusing another remote's address. */
  function handleAdd(): void {
    referencesStore.clearRemoteError();
    setEditing("new");
  }

  /** Edits the selected remote rather than the publication default. */
  function handleEdit(remote: OpenCodexGitRemote): void {
    referencesStore.clearRemoteError();
    setEditing({ ...remote });
  }

  /** Captures the remote named in the removal confirmation. */
  function handleRemove(remote: OpenCodexGitRemote): void {
    referencesStore.clearRemoteError();
    setRemoving({ ...remote });
  }

  /** Returns to the list after cancellation or a confirmed save. */
  function handleCancel(): void {
    referencesStore.clearRemoteError();
    setEditing(null);
    setRemoving(null);
  }

  /** Removes only the remote named in the visible confirmation. */
  async function handleConfirmRemove(): Promise<void> {
    if (removing === null) return;
    if (await referencesStore.removeRemote(removing.name)) setRemoving(null);
  }

  /** Reloads local configuration without fetching remote references. */
  function handleRefresh(): void { void referencesStore.loadRemotes(); }

  let content = (
    <Stack spacing={1}>
      {referencesStore.remotes.map((remote) => (
        <ProjectGitRemoteRowX key={remote.name} remote={remote}
          disabled={!canManage || removing !== null} onEdit={handleEdit} onRemove={handleRemove} />
      ))}
    </Stack>
  );
  if (referencesStore.remotes.length === 0 && referencesStore.hasLoadedRemotes) {
    content = <Typography color="text.secondary">{t("git.remoteEmpty")}</Typography>;
  }
  if (editing !== null) {
    let remote: OpenCodexGitRemote | null = null;
    if (editing !== "new") remote = editing;
    content = <ProjectGitRemoteEditorX referencesStore={referencesStore} remote={remote} onDone={handleCancel} />;
  }

  let confirmation = null;
  if (removing !== null) {
    confirmation = (
      <Alert severity="warning">
        <Stack spacing={1}>
          <Typography variant="body2">{t("git.remoteRemoveDescription", { name: removing.name })}</Typography>
          <Stack direction="row" spacing={1}>
            <Button disabled={referencesStore.isSavingRemote} onClick={handleCancel}>{t("git.cancel")}</Button>
            <Button color="error" variant="contained" disabled={!canManage} onClick={handleConfirmRemove}>
              {t("git.remoteRemoveConfirm")}
            </Button>
          </Stack>
        </Stack>
      </Alert>
    );
  }

  let addAction = null;
  if (editing === null) {
    addAction = (
      <Button startIcon={<AddOutlinedIcon />} disabled={!canManage || removing !== null} onClick={handleAdd}>
        {t("git.remoteAdd")}
      </Button>
    );
  }
  let progress = null;
  if (referencesStore.isLoadingRemotes || referencesStore.isSavingRemote) {
    progress = <CircularProgress size={18} aria-label={t("git.remoteLoading")} />;
  }
  let error = null;
  if (referencesStore.remoteErrorMessage !== null) {
    error = <Alert severity="error">{referencesStore.remoteErrorMessage}</Alert>;
  }

  let toolbar = progress;
  if (editing === null) {
    toolbar = (
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
        {addAction}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {progress}
          <Tooltip title={t("git.remoteRefresh")}>
            <span><IconButton aria-label={t("git.remoteRefresh")} onClick={handleRefresh}
              disabled={busy || removing !== null}><RefreshOutlinedIcon /></IconButton></span>
          </Tooltip>
        </Stack>
      </Stack>
    );
  }

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={handleClose}>
      <DialogTitle>{t("git.remoteConfigureTitle")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {toolbar}
          {error}
          {confirmation}
          {content}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={referencesStore.isSavingRemote} onClick={handleClose}>{t("git.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

export const ProjectGitRemoteDialogX = observer(ProjectGitRemoteDialog);
