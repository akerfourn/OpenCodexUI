import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Stack, Tooltip, Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useGitTranslation } from "../../i18n/useGitTranslation";

import type { OpenCodexGitRemote } from "@open-codex-ui/opencodex-protocol";
import type { ProjectGitReferencesStore } from "../../stores/project/git/ProjectGitReferencesStore";
import { ProjectGitRemoteEditorX } from "./ProjectGitRemoteEditor";
import { ProjectGitRemoteRowX } from "./ProjectGitRemoteRow";
import { ProjectGitBranchRemoteX } from "./ProjectGitBranchRemote";
import type { ProjectGitSyncStore } from "../../stores/project/git/ProjectGitSyncStore";

interface ProjectGitRemoteDialogProps {
  referencesStore: ProjectGitReferencesStore;
  open: boolean;
  onClose(): void;
  syncStore?: ProjectGitSyncStore;
}

/** Lists all remotes with separate creation, URL editing, and confirmed removal. */
export function ProjectGitRemoteDialog({ referencesStore, open, onClose, syncStore }: ProjectGitRemoteDialogProps) {
  const { t } = useGitTranslation(syncStore?.vocabulary);
  const [editing, setEditing] = useState<OpenCodexGitRemote | "new" | null>(null);
  const [removing, setRemoving] = useState<OpenCodexGitRemote | null>(null);
  const isSaving = referencesStore.isSavingRemote || syncStore?.isMutating === true;
  const busy = !referencesStore.canManageRemotes || syncStore?.isBusy === true;
  const canManage = !busy && referencesStore.hasLoadedRemotes;

  useEffect(() => {
    setEditing(null);
    setRemoving(null);
    if (open) void referencesStore.loadRemotes();
  }, [referencesStore, open]);

  /** Keeps the dialog open while Git is acknowledging a mutation. */
  function handleClose(): void {
    if (!isSaving) onClose();
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
  /** Persists the chosen favorite in the current source's repository. */
  function handleFavorite(remote: OpenCodexGitRemote): void { void syncStore?.configure({ favoriteRemote: remote.name }); }
  let preferences = null;
  let configurationError = null;
  if (syncStore !== undefined) {
    preferences = <>
      <Typography variant="body2" color="text.secondary">{t("gitSync.favoriteHelp")}</Typography>
      <ProjectGitBranchRemoteX sync={syncStore} remotes={referencesStore.remotes} disabled={!canManage} />
    </>;
    if (syncStore.result?.issue != null) configurationError = <Alert severity="warning">{t(`gitSync.issues.${syncStore.result.issue}`)}</Alert>;
  }

  let content = (
    <Stack spacing={1}>
      {referencesStore.remotes.map((remote) => (
        <ProjectGitRemoteRowX key={remote.name} remote={remote}
          favorite={syncStore?.configuration?.favoriteRemote === remote.name}
          onFavorite={syncStore === undefined ? undefined : handleFavorite}
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
  if (referencesStore.isLoadingRemotes || isSaving) {
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
          {configurationError}
          {confirmation}
          {content}
          {preferences}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={isSaving} onClick={handleClose}>{t("git.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

export const ProjectGitRemoteDialogX = observer(ProjectGitRemoteDialog);
