import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexWorkspaceRoot } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../../stores/RootStore";

/** Collects a storage location in an explicit source; native picking is limited to local access. */
export function WorkspaceRootDialog({ store, initial, onSave, onClose, busy, error }: {
  store: RootStore; initial: OpenCodexWorkspaceRoot | null; onSave: (root: OpenCodexWorkspaceRoot) => Promise<void>;
  onClose: () => void; busy: boolean; error: string | null;
}) {
  const { t } = useTranslation();
  const sources = store.sourcesStore.sources;
  const [sourceId, setSourceId] = useState(initial?.sourceId ?? sources[0]?.id ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [path, setPath] = useState(initial?.path ?? "");
  const [picking, setPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const disabled = busy || picking;
  const options = sources.map((source) => <MenuItem key={source.id} value={source.id}>{source.name}</MenuItem>);
  const missingSource = sourceId !== "" && !sources.some((source) => source.id === sourceId)
    ? <MenuItem value={sourceId}>{sourceId}</MenuItem> : null;
  const failure = error ?? pickerError;
  const errorContent = failure === null ? null : <Alert severity="error">{failure}</Alert>;
  const picker = store.sourcesStore.hasLocalAccess(sourceId)
    ? <Button disabled={disabled} onClick={handlePick}>{t("workspaceStorage.browse")}</Button> : null;

  /** Native paths are used only when the source explicitly shares the host filesystem. */
  async function handlePick(): Promise<void> {
    setPicking(true);
    setPickerError(null);
    try {
      const picked = await store.request<string | null>({ type: "projects.context.pickFolder" });
      if (picked !== null) setPath(picked);
    } catch (failure) {
      setPickerError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setPicking(false);
    }
  }
  /** Sends plain metadata; adding a location never creates or moves any worktree. */
  async function handleSave(): Promise<void> {
    await onSave({ id: initial?.id ?? crypto.randomUUID(), sourceId, label, path,
      isDefault: initial?.isDefault ?? false });
  }
  return (
    <Dialog open fullWidth maxWidth="sm" onClose={disabled ? undefined : onClose}>
      <DialogTitle>{t("workspaceStorage.edit")}</DialogTitle>
      <DialogContent>
        <Alert severity="info">{t("workspaceStorage.pathHelp")}</Alert>
        <TextField select label={t("workspaceStorage.source")} value={sourceId} fullWidth margin="normal"
          disabled={disabled || initial !== null} onChange={(event) => setSourceId(event.target.value)}>
          {options}{missingSource}
        </TextField>
        <TextField autoFocus label={t("workspaceStorage.label")} value={label} fullWidth margin="normal"
          disabled={disabled} onChange={(event) => setLabel(event.target.value)} />
        <TextField label={t("workspaces.destination")} value={path} fullWidth margin="normal"
          disabled={disabled} onChange={(event) => setPath(event.target.value)} />
        {picker}{errorContent}
      </DialogContent>
      <DialogActions>
        <Button disabled={disabled} onClick={onClose}>{t("workspaces.close")}</Button>
        <Button disabled={disabled || sourceId === "" || label.trim().length === 0 || path.trim().length === 0}
          onClick={handleSave}>{t("workspaces.save")}</Button>
      </DialogActions>
    </Dialog>
  );
}
export const WorkspaceRootDialogX = observer(WorkspaceRootDialog);
