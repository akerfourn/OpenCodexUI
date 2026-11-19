import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { WorkspaceRemovalInspectionState } from "./useWorkspaceRemovalInspection";

/** Explains disk contents separately from conversations and collects explicit file-loss consent. */
export function WorkspaceRemovalInspection({ inspection, disabled, forceAuthorized = false }: {
  inspection: WorkspaceRemovalInspectionState; disabled: boolean; forceAuthorized?: boolean;
}) {
  const { t } = useTranslation();
  let content = null;
  if (inspection.loading) content = <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
    <CircularProgress size={18} /><Typography variant="body2">{t("workspaces.removalChecking")}</Typography></Stack>;
  if (inspection.result !== null) {
    const { files, totalFileCount } = inspection.result;
    let localFiles = <Typography variant="body2">{t("workspaces.removalClean")}</Typography>;
    if (totalFileCount > 0) {
      const remaining = totalFileCount - files.length;
      const more = remaining > 0 ? <Typography variant="caption">{t("workspaces.removalMoreFiles", { count: remaining })}</Typography> : null;
      localFiles = <>
        <Alert severity="warning">{t("workspaces.removalFiles", { count: totalFileCount })}</Alert>
        <Typography variant="body2">{t("workspaces.removalFilesHelp")}</Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5, maxHeight: 180, overflow: "auto" }}>
          {files.map(file => <li key={file.path}><Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
            {file.path} — {t(`workspaces.removalFileKinds.${file.kind}`)}</Typography></li>)}
        </Box>{more}
      </>;
    }
    let consent = null;
    if (totalFileCount > 0 && !forceAuthorized) consent = <FormControlLabel label={t("workspaces.forceRemovalConfirm")} control={
      <Checkbox checked={inspection.force} disabled={disabled} onChange={event => inspection.setForce(event.target.checked)} />
    } />;
    const warning = inspection.force || forceAuthorized ? <Alert severity="error">{t("workspaces.forceRemovalHelp")}</Alert> : null;
    content = <>{localFiles}{consent}{warning}</>;
  }
  return <Stack spacing={1} sx={{ mt: 2 }}>
    {content}
    <Button size="small" disabled={disabled || inspection.loading} onClick={inspection.refresh} sx={{ alignSelf: "flex-start" }}>
      {t("workspaces.removalCheckAgain")}</Button>
  </Stack>;
}
