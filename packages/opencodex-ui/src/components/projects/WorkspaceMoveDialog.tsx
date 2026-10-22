import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";

/** Offers configured source storage first, with a separate advanced custom-path choice. */
export function WorkspaceMoveDialog({ project, workspace, onClose }: {
  project: ProjectStore; workspace: OpenCodexProjectWorkspace; onClose(): void;
}) {
  const { t } = useTranslation();
  const store = project.workspaces;
  const roots = store.storageRoots;
  const available = roots.filter(root => !samePath(store.storagePreview(root.id, workspace.id), workspace.path));
  const [rootId, setRootId] = useState(available.find(root => root.isDefault)?.id ?? available[0]?.id ?? "");
  const [custom, setCustom] = useState(false);
  const [destination, setDestination] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const current = store.workspaces.find(item => item.id === workspace.id) ?? workspace;
  const unsaved = project.files.hasUnsavedWorkspaceDocuments(workspace.id);
  const blocked = store.isBusy || project.isReadOnlyFromCache || unsaved || current.sourceId === null
    || current.isPrimary || !current.managed || current.removedAt !== null
    || current.removalPending === true || current.movePending === true;
  const selectedRoot = available.find(root => root.id === rootId);
  const invalid = custom ? destination.length === 0 || samePath(destination, current.path) : selectedRoot === undefined;
  const error = store.error === null ? null : <Alert severity="error">{store.error}</Alert>;
  const unsavedNotice = unsaved ? <Alert severity="warning">{t("workspaces.moveUnsaved")}</Alert> : null;
  const noStorage = available.length === 0 && !custom
    ? <Alert severity="info">{t("workspaces.moveConfigureStorage")}</Alert> : null;
  const options = available.map(root => <MenuItem key={root.id} value={root.id}>{root.label}</MenuItem>);
  const storageInput = custom ? (
    <TextField label={t("workspaces.destination")} value={destination} disabled={blocked} fullWidth margin="normal"
      onChange={event => { setDestination(event.target.value); setConfirmed(false); }} />
  ) : (
    <>
      <TextField select label={t("workspaceStorage.location")} value={selectedRoot?.id ?? ""} fullWidth margin="normal"
        disabled={blocked || available.length === 0} onChange={event => { setRootId(event.target.value); setConfirmed(false); }}>
        {options}
      </TextField>
      <TextField label={t("workspaceStorage.pathPreview")} value={store.storagePreview(rootId, workspace.id)} fullWidth
        margin="normal" slotProps={{ input: { readOnly: true } }} />
    </>
  );

  /** Sends a root identity or an explicit advanced path, never the computed preview as authority. */
  async function handleMove(): Promise<void> {
    if (blocked || invalid || !confirmed) return;
    if (custom) await store.move(workspace.id, undefined, destination);
    else await store.move(workspace.id, rootId);
    if (store.error === null) onClose();
  }

  return (
    <Dialog open onClose={store.isBusy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("workspaces.move")}</DialogTitle>
      <DialogContent>
        <Alert severity="info">{t("workspaces.moveHelp")}</Alert>
        <TextField label={t("workspaces.previousPath")} value={current.path} fullWidth margin="normal"
          slotProps={{ input: { readOnly: true } }} />
        {noStorage}{storageInput}
        <FormControlLabel control={<Checkbox checked={custom} disabled={blocked}
          onChange={event => { setCustom(event.target.checked); setConfirmed(false); }} />} label={t("workspaces.moveCustom")} />
        <FormControlLabel control={<Checkbox checked={confirmed} disabled={blocked}
          onChange={event => setConfirmed(event.target.checked)} />} label={t("workspaces.moveConfirm")} />
        {unsavedNotice}{error}
      </DialogContent>
      <DialogActions>
        <Button disabled={store.isBusy} onClick={onClose}>{t("workspaces.close")}</Button>
        <Button disabled={blocked || invalid || !confirmed} onClick={handleMove}>{t("workspaces.move")}</Button>
      </DialogActions>
    </Dialog>
  );
}
export const WorkspaceMoveDialogX = observer(WorkspaceMoveDialog);

/** Compares preview paths without relying on the Electron host's filesystem syntax. */
function samePath(left: string, right: string): boolean {
  if (left.startsWith("/")) return left.replace(/\/+$/u, "") === right.replace(/\/+$/u, "");
  return left.replaceAll("/", "\\").replace(/\\+$/u, "").toLowerCase()
    === right.replaceAll("/", "\\").replace(/\\+$/u, "").toLowerCase();
}
