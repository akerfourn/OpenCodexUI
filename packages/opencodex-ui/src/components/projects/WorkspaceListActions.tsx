import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Menu, MenuItem, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { WorkspaceCreateDialogX } from "./WorkspaceCreateDialog";

/** Sidebar catalogue actions keep import and recovery separate from conversation properties. */
export function WorkspaceListActions({ project }: { project: ProjectStore }) {
  const { t } = useTranslation();
  const store = project.workspaces;
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => { void store.load(); }, [store]);
  const disabled = store.isBusy || project.isReadOnlyFromCache;
  const error = store.error === null ? null : <Alert severity="error">{store.error}</Alert>;
  const pending = store.pending.map((item) => (
    <Alert severity="warning" key={item.id} action={
      <Button disabled={disabled} onClick={() => void store.recoverCreation(item.id)}>{t("workspaces.recover")}</Button>
    }>{t("workspaces.pending", { path: item.destinationPath })}</Alert>
  ));
  const skipped = store.skipped.map((item) => (
    <Typography variant="caption" component="div" key={item.path}>
      {t("workspaces.skipped", { path: item.path, reason: item.reason })}
    </Typography>
  ));
  const creationDialog = creating ? <WorkspaceCreateDialogX store={store} onClose={() => setCreating(false)} /> : null;
  /** Makes the scope of the explicit import visible before contacting the source. */
  function handleOpenImport(): void {
    setAnchor(null);
    setImporting(true);
  }
  /** Registers source-verified worktrees, retaining names of already known workspaces. */
  async function handleImport(): Promise<void> {
    await store.discover();
    if (store.error === null) setImporting(false);
  }
  return (
    <Box sx={{ px: 1.5, pb: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <Button size="small" disabled={disabled} onClick={() => setCreating(true)}
          startIcon={<AddOutlinedIcon />} sx={{ flex: 1, justifyContent: "flex-start" }}>
          {t("workspaces.create")}
        </Button>
        <IconButton size="small" aria-label={t("workspaces.manage")} onClick={(event) => setAnchor(event.currentTarget)}>
          <MoreVertOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>
      {error}{pending}{skipped}{creationDialog}
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <MenuItem disabled={disabled} onClick={handleOpenImport}>{t("workspaces.discover")}</MenuItem>
      </Menu>
      <Dialog open={importing} onClose={store.isBusy ? undefined : () => setImporting(false)} fullWidth maxWidth="sm">
        <DialogTitle>{t("workspaces.importTitle")}</DialogTitle>
        <DialogContent>{t("workspaces.importHelp")}{error}</DialogContent>
        <DialogActions>
          <Button disabled={store.isBusy} onClick={() => setImporting(false)}>{t("workspaces.close")}</Button>
          <Button disabled={disabled} onClick={handleImport}>{t("workspaces.discover")}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
export const WorkspaceListActionsX = observer(WorkspaceListActions);
