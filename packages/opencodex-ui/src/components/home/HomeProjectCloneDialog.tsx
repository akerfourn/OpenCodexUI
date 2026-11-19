import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent, FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectCloneStore } from "../../stores/project/ProjectCloneStore";

interface HomeProjectCloneDialogProps { cloneStore: ProjectCloneStore; open: boolean; onClose(): void }

/** Collects an address and source-owned destination before cloning, keeping failures editable. */
export function HomeProjectCloneDialog({ cloneStore, open, onClose }: HomeProjectCloneDialogProps) {
  const { t } = useTranslation();
  /** Keeps an import visible until Git acknowledges completion. */
  function handleClose(): void { if (!cloneStore.isBusy) onClose(); }
  /** Changes only the remote address; the chosen destination remains explicit. */
  function handleRepository(event: ChangeEvent<HTMLInputElement>): void { cloneStore.setRepositoryUrl(event.target.value); }
  /** Keeps filesystem selection explicit instead of following the Home filter. */
  function handleSource(event: ChangeEvent<HTMLInputElement>): void { cloneStore.setSourceId(event.target.value); }
  /** Allows remote paths to be entered without host-side conversion. */
  function handleDestination(event: ChangeEvent<HTMLInputElement>): void { cloneStore.setDestinationPath(event.target.value); }
  /** Opens only the folder picker appropriate to a host-visible source. */
  function handlePick(): void { void cloneStore.pickFolder(); }
  /** Submits a clone once and closes only after a successful response. */
  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (await cloneStore.clone()) onClose();
  }
  let picker = null;
  if (cloneStore.canPickFolder) {
    picker = <Button size="small" onClick={handlePick} disabled={cloneStore.isBusy}>{t("home.clonePickFolder")}</Button>;
  }

  let progress = null;
  if (cloneStore.isCloning) progress = <CircularProgress size={16} color="inherit" />;
  return <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
    <form onSubmit={handleSubmit}>
      <DialogTitle>{t("home.addGitProject")}</DialogTitle>
      <DialogContent dividers><Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">{t("home.cloneDescription")}</Typography>

        <TextField select label={t("sources.source")} value={cloneStore.sourceId} onChange={handleSource}
          disabled={cloneStore.isBusy} required fullWidth>
          {cloneStore.sources.map(source => <MenuItem key={source.id} value={source.id}>{source.name}</MenuItem>)}
        </TextField>
        <TextField label={t("home.cloneRepository")} value={cloneStore.repositoryUrl} onChange={handleRepository}
          disabled={cloneStore.isBusy} placeholder="https://github.com/owner/repository.git" required fullWidth autoFocus />
        <TextField label={t("home.cloneDestination")} value={cloneStore.destinationPath} onChange={handleDestination}
          helperText={t("home.cloneDestinationHelp")} disabled={cloneStore.isBusy} required fullWidth />
        {picker}
      </Stack></DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={cloneStore.isBusy}>{t("home.cloneCancel")}</Button>
        <Button variant="contained" type="submit" disabled={!cloneStore.canClone} startIcon={progress}>
          {t("home.cloneSubmit")}
        </Button>
      </DialogActions>
    </form>
  </Dialog>;
}

export const HomeProjectCloneDialogX = observer(HomeProjectCloneDialog);
