import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexWorkspaceStart } from "@open-codex-ui/opencodex-protocol";
import type { ProjectWorkspacesStore } from "../../stores/project/ProjectWorkspacesStore";

/** Collects an explicit source-native destination and Git starting point. */
export function WorkspaceCreateDialog({ store, onClose }: {
  store: ProjectWorkspacesStore; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [rootId, setRootId] = useState(store.storageRoots.find((root) => root.isDefault)?.id ?? "custom");
  const [destination, setDestination] = useState("");
  const [mode, setMode] = useState<OpenCodexWorkspaceStart["mode"]>("newBranch");
  const [branch, setBranch] = useState("");
  const [revision, setRevision] = useState("HEAD");
  const root = store.storageRoots.find((item) => item.id === rootId);
  const rootOptions = store.storageRoots.map((item) => <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>);
  const destinationInput = rootId === "custom" ? (
    <TextField label={t("workspaces.destination")} value={destination} disabled={store.isBusy}
      fullWidth margin="normal" onChange={(event) => setDestination(event.target.value)} />
  ) : (
    <TextField label={t("workspaceStorage.pathPreview")} value={store.storagePreview(rootId)} fullWidth margin="normal"
      slotProps={{ input: { readOnly: true } }} helperText={t("workspaceStorage.layoutHelp")} />
  );
  const storageHint = store.storageRoots.length === 0
    ? <Alert severity="info">{t("workspaceStorage.configureHint")}</Alert> : null;
  const branchInput = mode === "detached" ? null : (
    <TextField label={t("workspaces.branch")} value={branch} disabled={store.isBusy} fullWidth margin="normal"
      onChange={(event) => setBranch(event.target.value)} />
  );
  const revisionInput = mode === "existingBranch" ? null : (
    <TextField label={t("workspaces.revision")} value={revision} disabled={store.isBusy} fullWidth margin="normal"
      onChange={(event) => setRevision(event.target.value)} />
  );
  const error = store.error === null ? null : <Alert severity="error">{store.error}</Alert>;
  const invalid = name.trim().length === 0 || name.trim().length > 100 || (rootId === "custom" ? destination.trim().length === 0 : root === undefined)
    || (mode !== "detached" && branch.trim().length === 0)
    || (mode !== "existingBranch" && revision.trim().length === 0);

  /** Keeps the dialog open when the durable operation needs attention. */
  async function handleCreate(): Promise<void> {
    let start: OpenCodexWorkspaceStart;
    if (mode === "existingBranch") start = { mode, branchName: branch };
    else if (mode === "detached") start = { mode, startPoint: revision };
    else start = { mode, branchName: branch, startPoint: revision };
    if (rootId === "custom") await store.create(destination, start, name);
    else await store.create(undefined, start, name, rootId);
    if (store.error === null) onClose();
  }

  return (
    <Dialog open onClose={store.isBusy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("workspaces.create")}</DialogTitle>
      <DialogContent>
        <Alert severity="info">{t("workspaces.destinationHelp")}</Alert>
        <TextField autoFocus label={t("workspaces.name")} value={name} fullWidth margin="normal"
          disabled={store.isBusy} onChange={(event) => setName(event.target.value)} />
        {storageHint}
        <TextField select label={t("workspaceStorage.location")} value={rootId} fullWidth margin="normal"
          disabled={store.isBusy} onChange={(event) => setRootId(event.target.value)}>
          {rootOptions}
          <MenuItem value="custom">{t("workspaceStorage.custom")}</MenuItem>
        </TextField>
        {destinationInput}
        <TextField select label={t("workspaces.start")} value={mode} disabled={store.isBusy} fullWidth margin="normal"
          onChange={(event) => setMode(event.target.value as OpenCodexWorkspaceStart["mode"])}>
          <MenuItem value="newBranch">{t("workspaces.newBranch")}</MenuItem>
          <MenuItem value="existingBranch">{t("workspaces.existingBranch")}</MenuItem>
          <MenuItem value="detached">{t("workspaces.detached")}</MenuItem>
        </TextField>
        {branchInput}{revisionInput}{error}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={store.isBusy}>{t("workspaces.close")}</Button>
        <Button onClick={handleCreate} disabled={store.isBusy || invalid}>{t("workspaces.create")}</Button>
      </DialogActions>
    </Dialog>
  );
}
export const WorkspaceCreateDialogX = observer(WorkspaceCreateDialog);
