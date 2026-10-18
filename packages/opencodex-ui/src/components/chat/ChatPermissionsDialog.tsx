import { Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, Typography,
  type SelectChangeEvent } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ChatPermissionsStore } from "../../stores/chat/ChatPermissionsStore";

interface ChatPermissionsDialogProps {
  store: ChatPermissionsStore;
  onClose(): void;
}

/** Shows native values and applies only an explicit change to the existing conversation. */
export function ChatPermissionsDialog({ store, onClose }: ChatPermissionsDialogProps) {
  const { t } = useTranslation();
  useEffect(() => { void store.load(); }, [store]);

  /** Prevents dismissing the form while a settings mutation is in flight. */
  function handleClose(): void { if (!store.isSaving) onClose(); }
  /** Reloads the effective native settings after conflicts or remote changes. */
  function handleRefresh(): void { void store.load(); }
  /** Applies the selections while keeping the confirmed values visible. */
  function handleApply(): void { void store.save(); }
  /** Accepts only the two supported filesystem access modes. */
  function handleFilesystem(event: SelectChangeEvent): void {
    const value = event.target.value;
    if (value === "read-only" || value === "workspace-write") store.setFilesystem(value);
  }
  /** Changes the explicit network selection. */
  function handleNetwork(_event: unknown, checked: boolean): void { store.setNetworkAccess(checked); }
  /** Chooses the reviewer without changing the native approval policy. */
  function handleReviewer(event: SelectChangeEvent): void {
    const value = event.target.value;
    if (value === "user" || value === "auto_review") store.setReviewer(value);
  }

  const snapshot = store.snapshot;
  let details = null;
  let progress = null;
  let errorContent = null;
  let busyContent = null;
  let successContent = null;
  if (store.isLoading || store.isSaving) progress = <CircularProgress size={22} aria-label={t("threadPermissions.loading")} />;
  if (store.error !== null) errorContent = <Alert severity="error">{store.error}</Alert>;
  if (!store.isAvailable) busyContent = <Alert severity="info">{t("threadPermissions.waitForIdle")}</Alert>;
  if (store.didSave) successContent = <Alert severity="success">{t("threadPermissions.saved")}</Alert>;
  if (snapshot !== null) {
    let protectedContent = null;
    let profileContent = null;
    let customOption = null;
    if (!snapshot.canChangeAccess) protectedContent = <Alert severity="info">{t("threadPermissions.protectedProfile")}</Alert>;
    if (snapshot.profileId !== null) profileContent = <Typography variant="body2">{t("threadPermissions.profile", { name: snapshot.profileId })}</Typography>;
    if (snapshot.filesystem === "custom") customOption = <MenuItem value="custom">{t("threadPermissions.custom")}</MenuItem>;
    const filesystemValue = snapshot.filesystem === "custom" ? "custom" : store.filesystem;
    const accessDisabled = !store.canEdit || !snapshot.canChangeAccess;
    let networkContent = <Typography variant="body2">{t("threadPermissions.managedNetwork")}</Typography>;
    if (snapshot.networkAccess !== null) {
      networkContent = <FormControlLabel label={t("threadPermissions.network")}
        control={<Checkbox checked={store.networkAccess} disabled={accessDisabled} onChange={handleNetwork} />} />;
    }
    let policyLabel = t("threadPermissions.custom");
    if (snapshot.approvalPolicy === "on-request") policyLabel = t("threadPermissions.onRequest");
    if (snapshot.approvalPolicy === "never") policyLabel = t("threadPermissions.never");
    details = <>
      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{t("threadPermissions.workspace", { path: snapshot.cwd })}</Typography>
      {profileContent}
      {protectedContent}
      <FormControl fullWidth size="small" disabled={accessDisabled}>
        <InputLabel id="chat-permission-access-label">{t("threadPermissions.filesystem")}</InputLabel>
        <Select labelId="chat-permission-access-label" value={filesystemValue}
          label={t("threadPermissions.filesystem")} onChange={handleFilesystem}>
          <MenuItem value="read-only">{t("threadPermissions.readOnly")}</MenuItem>
          <MenuItem value="workspace-write">{t("threadPermissions.workspaceWrite")}</MenuItem>
          {customOption}
        </Select>
      </FormControl>
      {networkContent}
      <FormControl fullWidth size="small" disabled={!store.canEdit}>
        <InputLabel id="chat-permission-reviewer-label">{t("threadPermissions.reviewer")}</InputLabel>
        <Select labelId="chat-permission-reviewer-label" value={store.approvalsReviewer}
          label={t("threadPermissions.reviewer")} onChange={handleReviewer}>
          <MenuItem value="user">{t("threadPermissions.manual")}</MenuItem>
          <MenuItem value="auto_review">{t("threadPermissions.automatic")}</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="body2" color="text.secondary">{t("threadPermissions.policy", { policy: policyLabel })}</Typography>
      <Typography variant="body2" color="text.secondary">{t("threadPermissions.scope")}</Typography>
    </>;
  }

  return <Dialog open fullWidth maxWidth="sm" onClose={handleClose} aria-labelledby="chat-permissions-title">
    <DialogTitle id="chat-permissions-title">{t("threadPermissions.title")}</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={2}>
        <Typography variant="body2">{t("threadPermissions.description")}</Typography>
        {busyContent}{errorContent}{successContent}{progress}{details}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={handleRefresh} disabled={!store.isAvailable || store.isLoading || store.isSaving}>{t("threadPermissions.refresh")}</Button>
      <Button onClick={handleClose} disabled={store.isSaving}>{t("threadPermissions.close")}</Button>
      <Button variant="contained" onClick={handleApply} disabled={!store.canEdit || !store.hasChanges}>{t("threadPermissions.apply")}</Button>
    </DialogActions>
  </Dialog>;
}

export const ChatPermissionsDialogX = observer(ChatPermissionsDialog);
