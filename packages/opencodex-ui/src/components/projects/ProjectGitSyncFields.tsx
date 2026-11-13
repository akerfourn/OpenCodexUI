import { Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectGitSyncStore } from "../../stores/project/git/ProjectGitSyncStore";

interface ProjectGitSyncFieldsProps { sync: ProjectGitSyncStore }

/** Collects an explicit destination and integration strategy before fetching a review. */
export function ProjectGitSyncFields({ sync }: ProjectGitSyncFieldsProps) {
  const { t } = useTranslation();
  const remotes = sync.inspection?.status.remotes ?? [];
  const disabled = sync.isBusy || sync.isSavingPreference;
  /** Invalidates a review when another remote is chosen. */
  function handleRemote(event: ChangeEvent<HTMLInputElement>): void { sync.setTarget({ remoteName: event.target.value }); }
  /** Keeps the destination branch explicit instead of guessing from the push configuration. */
  function handleBranch(event: ChangeEvent<HTMLInputElement>): void { sync.setTarget({ branchName: event.target.value }); }
  /** Applies one supported project integration strategy to the next review. */
  function handleStrategy(event: ChangeEvent<HTMLInputElement>): void {
    if (event.target.value === "rebase" || event.target.value === "merge") sync.setStrategy(event.target.value);
  }
  /** Requests tracking configuration only as an explicit part of the reviewed action. */
  function handleTracking(event: ChangeEvent<HTMLInputElement>): void { sync.setTarget({ setUpstream: event.target.checked }); }
  /** Persists the strategy separately from executing a Git synchronization. */
  function handleSaveDefault(): void { void sync.saveDefaultStrategy(); }

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2">{t("gitSync.localBranch", { branch: sync.inspection?.status.branchName ?? "—" })}</Typography>
      <TextField select label={t("gitSync.remote")} value={sync.remoteName} disabled={disabled} fullWidth onChange={handleRemote}>
        {remotes.map((remote) => <MenuItem key={remote.name} value={remote.name}>{remote.name}</MenuItem>)}
      </TextField>
      <TextField label={t("gitSync.branch")} value={sync.branchName} disabled={disabled} fullWidth onChange={handleBranch} />
      <TextField select label={t("gitSync.strategy")} value={sync.strategy} disabled={disabled} fullWidth onChange={handleStrategy}>
        <MenuItem value="rebase">{t("gitSync.rebase")}</MenuItem>
        <MenuItem value="merge">{t("gitSync.merge")}</MenuItem>
      </TextField>
      <Button size="small" onClick={handleSaveDefault} disabled={disabled || sync.strategy === sync.defaultStrategy}>
        {t("gitSync.saveDefault")}
      </Button>
      <FormControlLabel control={<Checkbox checked={sync.setUpstream} disabled={disabled} onChange={handleTracking} />}
        label={t("gitSync.setUpstream")} />
    </Stack>
  );
}

export const ProjectGitSyncFieldsX = observer(ProjectGitSyncFields);
