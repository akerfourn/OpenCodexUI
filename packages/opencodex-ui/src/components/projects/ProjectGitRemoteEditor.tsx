import { Button, Stack, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexGitRemote } from "@open-codex-ui/opencodex-protocol";
import type { ProjectGitReferencesStore } from "../../stores/project/git/ProjectGitReferencesStore";

interface ProjectGitRemoteEditorProps {
  referencesStore: ProjectGitReferencesStore;
  remote: OpenCodexGitRemote | null;
  onDone(): void;
}

/** Edits a named fetch URL while preserving a separately configured push URL. */
export function ProjectGitRemoteEditor({ referencesStore, remote, onDone }: ProjectGitRemoteEditorProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(remote?.name ?? "");
  const [url, setUrl] = useState(remote?.fetchUrl ?? "");
  const isAdding = remote === null;
  const nameExists = isAdding && referencesStore.remotes.some((item) => item.name === name.trim());
  const canSave = referencesStore.canManageRemotes && name.trim().length > 0
    && url.trim().length > 0 && !nameExists;
  let title: string = t("git.remoteEdit", { name: remote?.name });
  let nameHint: string = t("git.remoteNameFixed");
  if (isAdding) {
    title = t("git.remoteAdd");
    nameHint = "";
  }
  if (nameExists) nameHint = t("git.remoteNameExists");

  /** Keeps the new remote name local until explicit submission. */
  function handleNameChange(event: ChangeEvent<HTMLInputElement>): void { setName(event.target.value); }
  /** Keeps URL edits local without changing the selected remote identity. */
  function handleUrlChange(event: ChangeEvent<HTMLInputElement>): void { setUrl(event.target.value); }
  /** Constrains existence so stale forms cannot overwrite or recreate a remote. */
  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canSave) return;
    let mode: "add" | "update" = "update";
    if (isAdding) mode = "add";
    if (await referencesStore.upsertRemote(name.trim(), url.trim(), mode)) onDone();
  }

  let pushUrl = null;
  if (remote?.pushUrl != null && remote.pushUrl !== remote.fetchUrl) {
    pushUrl = <TextField label={t("git.remotePushUrl")} value={remote.pushUrl} fullWidth
      helperText={t("git.remotePushPreserved")} slotProps={{ input: { readOnly: true } }} />;
  }

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={2}>
      <Typography variant="subtitle2">{title}</Typography>
      <TextField label={t("git.remoteName")} value={name} autoFocus={isAdding} fullWidth
        error={nameExists} helperText={nameHint} disabled={!referencesStore.canManageRemotes}
        slotProps={{ input: { readOnly: !isAdding } }} onChange={handleNameChange} />
      <TextField label={t("git.remoteFetchUrl")} value={url} autoFocus={!isAdding} fullWidth
        disabled={!referencesStore.canManageRemotes} onChange={handleUrlChange} />
      {pushUrl}
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
        <Button disabled={referencesStore.isSavingRemote} onClick={onDone}>{t("git.cancel")}</Button>
        <Button variant="contained" type="submit" disabled={!canSave}>{t("git.remoteSave")}</Button>
      </Stack>
    </Stack>
  );
}

export const ProjectGitRemoteEditorX = observer(ProjectGitRemoteEditor);
