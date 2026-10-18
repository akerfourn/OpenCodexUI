import { Alert, Button, Checkbox, CircularProgress, DialogActions, DialogContent,
  FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, Typography,
  type SelectChangeEvent } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { SourcePermissionsStore } from "../../stores/app/SourcePermissionsStore";
import type { RootStore } from "../../stores/RootStore";

/** Edits only native user defaults; no current conversation is reloaded or replaced. */
export function SourcePermissionsPanel({ permissions, root, onClose }: {
  permissions: SourcePermissionsStore; root: RootStore; onClose(): void;
}) {
  const { t } = useTranslation();
  useEffect(() => { void permissions.load(); }, [permissions]);

  /** Reloads after a conflict or an external configuration edit. */
  function handleRefresh(): void { void permissions.load(); }
  /** Keeps the dialog open until the native values are confirmed. */
  function handleApply(): void { void permissions.save(); }
  /** Accepts only supported explicit filesystem defaults. */
  function handleFilesystem(event: SelectChangeEvent): void {
    const value = event.target.value;
    if (value === "read-only" || value === "workspace-write") permissions.setValue("filesystem", value);
  }
  /** Network selection is offered only for workspace-write access. */
  function handleNetwork(_event: unknown, checked: boolean): void { permissions.setValue("networkAccess", checked); }
  /** Changes when approvals are required, independently of who reviews them. */
  function handlePolicy(event: SelectChangeEvent): void {
    const value = event.target.value;
    if (value === "on-request" || value === "untrusted" || value === "never") permissions.setValue("approvalPolicy", value);
  }
  /** Changes the destination of approval requests. */
  function handleReviewer(event: SelectChangeEvent): void {
    const value = event.target.value;
    if (value === "user" || value === "auto_review") permissions.setValue("approvalsReviewer", value);
  }

  const snapshot = permissions.snapshot;
  let details = null;
  let errorContent = null;
  let successContent = null;
  let progress = null;
  if (permissions.error !== null) errorContent = <Alert severity="error">{permissions.error}</Alert>;
  if (permissions.didSave) successContent = <Alert severity="success">{t("sourcePermissions.saved")}</Alert>;
  if (permissions.isLoading || permissions.isSaving) progress = <CircularProgress size={22} aria-label={t("sourcePermissions.loading")} />;
  if (snapshot !== null) {
    const values = permissions.values;
    const disabled = !permissions.canEdit;
    const sharedNames = snapshot.sharedSourceIds.map(id => root.sourcesStore.findSource(id)?.name ?? id).join(", ");
    let sharedContent = null;
    let protectedContent = null;
    let profileContent = null;
    let rootsContent = null;
    let filesystemOption = null;
    let policyOption = null;
    let reviewerOption = null;
    let networkContent = <Typography variant="body2">{t("sourcePermissions.managedNetwork")}</Typography>;
    if (values.filesystem === "read-only" || values.filesystem === "workspace-write") {
      networkContent = <>
        <FormControlLabel label={t("sourcePermissions.network")} control={<Checkbox
          checked={values.networkAccess === true} onChange={handleNetwork}
          disabled={disabled || !snapshot.editable.networkAccess || values.filesystem !== "workspace-write"} />} />
        <Typography variant="caption" color="text.secondary">{t("sourcePermissions.networkHelp")}</Typography>
      </>;
    }
    if (sharedNames.length > 0) sharedContent = <Alert severity="info">{t("sourcePermissions.sharedWith", { names: sharedNames })}</Alert>;
    if (Object.values(snapshot.editable).includes(false)) protectedContent = <Alert severity="info">{t("sourcePermissions.protected")}</Alert>;
    if (snapshot.profileId !== null) profileContent = <Typography variant="body2">{t("sourcePermissions.profile", { name: snapshot.profileId })}</Typography>;
    if (snapshot.writableRoots.length > 0) rootsContent = <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
      {t("sourcePermissions.roots", { paths: snapshot.writableRoots.join(", ") })}</Typography>;
    if (values.filesystem === "inherited" || values.filesystem === "custom") {
      filesystemOption = <MenuItem value={values.filesystem} disabled>{t(`sourcePermissions.${values.filesystem}`)}</MenuItem>;
    }
    if (values.approvalPolicy === "inherited" || values.approvalPolicy === "custom") {
      policyOption = <MenuItem value={values.approvalPolicy} disabled>{t(`sourcePermissions.${values.approvalPolicy}`)}</MenuItem>;
    }
    if (values.approvalsReviewer === "inherited") reviewerOption = <MenuItem value="inherited" disabled>{t("sourcePermissions.inherited")}</MenuItem>;
    details = <>
      {sharedContent}{protectedContent}{profileContent}
      <FormControl fullWidth size="small" disabled={disabled || !snapshot.editable.filesystem}>
        <InputLabel id="source-permission-filesystem-label">{t("sourcePermissions.filesystem")}</InputLabel>
        <Select labelId="source-permission-filesystem-label" value={values.filesystem}
          label={t("sourcePermissions.filesystem")} onChange={handleFilesystem}>
          {filesystemOption}
          <MenuItem value="read-only" disabled={!snapshot.allowedFilesystems.includes("read-only")}>{t("sourcePermissions.readOnly")}</MenuItem>
          <MenuItem value="workspace-write" disabled={!snapshot.allowedFilesystems.includes("workspace-write")}>{t("sourcePermissions.workspaceWrite")}</MenuItem>
        </Select>
      </FormControl>
      {rootsContent}
      {networkContent}
      <FormControl fullWidth size="small" disabled={disabled || !snapshot.editable.approvalPolicy}>
        <InputLabel id="source-permission-policy-label">{t("sourcePermissions.policy")}</InputLabel>
        <Select labelId="source-permission-policy-label" value={values.approvalPolicy}
          label={t("sourcePermissions.policy")} onChange={handlePolicy}>
          {policyOption}
          <MenuItem value="on-request" disabled={!snapshot.allowedPolicies.includes("on-request")}>{t("sourcePermissions.onRequest")}</MenuItem>
          <MenuItem value="untrusted" disabled={!snapshot.allowedPolicies.includes("untrusted")}>{t("sourcePermissions.untrusted")}</MenuItem>
          <MenuItem value="never" disabled={!snapshot.allowedPolicies.includes("never")}>{t("sourcePermissions.never")}</MenuItem>
        </Select>
      </FormControl>
      <FormControl fullWidth size="small" disabled={disabled || !snapshot.editable.approvalsReviewer}>
        <InputLabel id="source-permission-reviewer-label">{t("sourcePermissions.reviewer")}</InputLabel>
        <Select labelId="source-permission-reviewer-label" value={values.approvalsReviewer}
          label={t("sourcePermissions.reviewer")} onChange={handleReviewer}>
          {reviewerOption}
          <MenuItem value="user" disabled={!snapshot.allowedReviewers.includes("user")}>{t("sourcePermissions.user")}</MenuItem>
          <MenuItem value="auto_review" disabled={!snapshot.allowedReviewers.includes("auto_review")}>{t("sourcePermissions.automatic")}</MenuItem>
        </Select>
      </FormControl>
      <Typography variant="body2" color="text.secondary">{t("sourcePermissions.reviewerHelp")}</Typography>
      <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>{t("sourcePermissions.file", { path: snapshot.configPath })}</Typography>
      <Typography variant="caption" color="text.secondary">{t("sourcePermissions.sharing")}</Typography>
    </>;
  }
  return <>
    <DialogContent dividers>
      <Stack spacing={2}>
        <Typography variant="body2">{t("sourcePermissions.scope")}</Typography>
        {errorContent}{successContent}{progress}{details}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={handleRefresh} disabled={permissions.isLoading || permissions.isSaving}>{t("sourcePermissions.refresh")}</Button>
      <Button onClick={onClose} disabled={permissions.isSaving}>{t("sourcePermissions.cancel")}</Button>
      <Button variant="contained" onClick={handleApply} disabled={!permissions.canEdit || !permissions.hasChanges}>{t("sourcePermissions.apply")}</Button>
    </DialogActions>
  </>;
}

export const SourcePermissionsPanelX = observer(SourcePermissionsPanel);
