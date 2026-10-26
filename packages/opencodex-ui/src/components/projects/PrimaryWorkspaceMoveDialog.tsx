import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";

/** Defaults to a free project destination; workspace storage remains an explicit optional shortcut. */
export function PrimaryWorkspaceMoveDialog({ project, workspace, onClose }: {
  project: ProjectStore; workspace: OpenCodexProjectWorkspace; onClose(): void;
}) {
  const { t } = useTranslation();
  const store = project.workspaces;
  const [destination, setDestination] = useState("");
  const [useStorage, setUseStorage] = useState(false);
  const [rootId, setRootId] = useState(store.storageRoots.find(root => root.isDefault)?.id ?? store.storageRoots[0]?.id ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const current = store.workspaces.find(item => item.id === workspace.id);
  const unsaved = store.workspaces.some(item => project.files.hasUnsavedWorkspaceDocuments(item.id));
  const stale = current === undefined || current.path !== workspace.path || current.sourceId !== workspace.sourceId;
  const blocked = picking || store.isBusy || project.isReadOnlyFromCache || unsaved || stale
    || current?.isPrimary !== true || current.removedAt !== null || current.movePending === true || current.removalPending === true;
  const error = store.error ?? pickerError;
  const errorContent = error === null ? null : <Alert severity="error">{error}</Alert>;
  const unsavedContent = unsaved ? <Alert severity="warning">{t("primaryWorkspaceMove.unsaved")}</Alert> : null;
  const selectedRoot = store.storageRoots.find(root => root.id === rootId);
  const invalid = useStorage ? selectedRoot === undefined : destination.trim().length === 0;
  const options = store.storageRoots.map(root => <MenuItem key={root.id} value={root.id}>{root.label}</MenuItem>);
  let destinationInput;
  if (useStorage) {
    destinationInput = <>
      <TextField select label={t("workspaceStorage.location")} value={selectedRoot?.id ?? ""} fullWidth margin="normal"
        disabled={blocked} onChange={event => { setRootId(event.target.value); setConfirmed(false); }}>{options}</TextField>
      <TextField label={t("workspaceStorage.pathPreview")} value={store.storagePreview(rootId, workspace.id)} fullWidth
        margin="normal" slotProps={{ input: { readOnly: true } }} />
    </>;
  } else {
    let picker = null;
    if (store.canPickMoveParent) picker = <Button disabled={blocked} onClick={handlePick}>{t("primaryWorkspaceMove.browseParent")}</Button>;
    destinationInput = <>
      <TextField label={t("workspaces.destination")} value={destination} fullWidth margin="normal" disabled={blocked}
        helperText={t("primaryWorkspaceMove.destinationHelp")}
        onChange={event => { setDestination(event.target.value); setConfirmed(false); }} />{picker}
    </>;
  }

  /** A host selection is valid only for local sources, and remains an editable, unconfirmed draft. */
  async function handlePick(): Promise<void> {
    setPicking(true); setPickerError(null); setConfirmed(false);
    try {
      const parent = await store.pickMoveParent();
      if (parent !== null) {
        const separator = workspace.path.startsWith("/") ? "/" : "\\";
        const name = workspace.path.replace(/[\\/]+$/u, "").split(/[\\/]/u).at(-1) ?? "";
        setDestination(parent.replace(/[\\/]+$/u, "") + separator + name);
      }
    } catch (error) { setPickerError(error instanceof Error ? error.message : String(error)); }
    finally { setPicking(false); }
  }

  /** Sends only reviewed identity and destination scalars; all recovery evidence belongs to the backend. */
  async function handleMove(): Promise<void> {
    if (blocked || invalid || !confirmed) return;
    if (useStorage) await store.move(workspace.id, rootId, undefined, workspace.path);
    else await store.move(workspace.id, undefined, destination, workspace.path);
    if (store.error === null) onClose();
  }

  return <Dialog open fullWidth maxWidth="sm" onClose={store.isBusy || picking ? undefined : onClose}>
    <DialogTitle>{t("primaryWorkspaceMove.title")}</DialogTitle>
    <DialogContent>
      <Alert severity="info">{t("primaryWorkspaceMove.help")}</Alert>
      <TextField label={t("workspaces.previousPath")} value={workspace.path} fullWidth margin="normal"
        slotProps={{ input: { readOnly: true } }} />
      {destinationInput}
      <FormControlLabel control={<Checkbox checked={useStorage} disabled={blocked || store.storageRoots.length === 0}
        onChange={event => { setUseStorage(event.target.checked); setConfirmed(false); }} />} label={t("primaryWorkspaceMove.storage")}/>
      <FormControlLabel control={<Checkbox checked={confirmed} disabled={blocked}
        onChange={event => setConfirmed(event.target.checked)} />} label={t("primaryWorkspaceMove.confirm")} />
      {unsavedContent}{errorContent}
    </DialogContent>
    <DialogActions>
      <Button disabled={store.isBusy || picking} onClick={onClose}>{t("workspaces.close")}</Button>
      <Button disabled={blocked || invalid || !confirmed} onClick={handleMove}>{t("primaryWorkspaceMove.title")}</Button>
    </DialogActions>
  </Dialog>;
}
export const PrimaryWorkspaceMoveDialogX = observer(PrimaryWorkspaceMoveDialog);
