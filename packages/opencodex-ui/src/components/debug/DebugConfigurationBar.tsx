import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, ListItemIcon,
  ListItemText, Menu, MenuItem, Stack, TextField, Tooltip, Typography } from "@mui/material";
import MoreVert from "@mui/icons-material/MoreVert";
import Add from "@mui/icons-material/Add";
import EditOutlined from "@mui/icons-material/EditOutlined";
import DeleteOutline from "@mui/icons-material/DeleteOutlineOutlined";
import FileDownloadOutlined from "@mui/icons-material/FileDownloadOutlined";
import PlayArrow from "@mui/icons-material/PlayArrow";
import { useTranslation } from "react-i18next";
import { sameDebugContext, type DebugConfiguration, type OpenCodexFileContext } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../../stores/RootStore";
import { DebugImportStore } from "../../stores/debug/DebugImportStore";
import { DebugConfigurationDialogX } from "./DebugConfigurationDialog";
import { DebugError } from "./DebugError";
import { DebugImportDialogX } from "./DebugImportDialog";

/** Keeps launching prominent while configuration management lives in one workspace-bound menu. */
export function DebugConfigurationBar({ root, context }: { root: RootStore; context: OpenCodexFileContext }) {
  const { t } = useTranslation();
  const store = root.debugStore;
  const [selected, setSelected] = useState("");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState<{ configuration?: DebugConfiguration } | null>(null);
  const [removing, setRemoving] = useState<DebugConfiguration | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importer] = useState(() => new DebugImportStore(root, context));
  useEffect(() => () => importer.dispose(), [importer]);
  const configurations = store.snapshot.preferences.configurations.filter(item => sameDebugContext(item.context, context));
  const current = configurations.find(item => item.id === selected) ?? configurations[0];
  /** Opens configuration management; detection is deferred until it is actually useful. */
  function openMenu(element: HTMLElement): void { setAnchor(element); void importer.detect(); }
  /** Reads the source file only on the explicit import action. */
  function importConfigurations(): void { setAnchor(null); setImportOpen(true); void importer.load(); }
  /** A failed deletion retains its target and the shared diagnostic. */
  async function remove(): Promise<void> {
    if (removing === null || store.active || deleting) return;
    setDeleting(true);
    try { if (await store.run({ kind: "deleteConfiguration", id: removing.id })) setRemoving(null); }
    finally { setDeleting(false); }
  }
  let editDialog;
  if (editing !== null) editDialog = <DebugConfigurationDialogX store={store} context={context}
    configuration={editing.configuration} onSaved={setSelected} onClose={() => setEditing(null)} />;
  const importDialog = importOpen ? <DebugImportDialogX store={importer} debug={store} onClose={() => setImportOpen(false)} /> : null;
  const deletionError = removing !== null && store.error !== null ? <DebugError details={store.error} /> : null;
  const emptyHint = configurations.length === 0 ? <Typography variant="caption" color="text.secondary">
    {t("debug.configurationHint")}
  </Typography> : null;
  return <Stack spacing={1}>
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <TextField size="small" select fullWidth label={t("debug.configuration")} value={current?.id ?? ""}
        onChange={event => setSelected(event.target.value)}>
        <MenuItem value="" disabled>{t("debug.noConfiguration")}</MenuItem>
        {configurations.map(config => <MenuItem key={config.id} value={config.id}>{config.name}</MenuItem>)}
      </TextField>
      <Tooltip title={t("debug.manageConfigurations")}><IconButton size="small" aria-label={t("debug.manageConfigurations")}
        aria-haspopup="menu" aria-expanded={anchor !== null} onClick={event => openMenu(event.currentTarget)}><MoreVert /></IconButton></Tooltip>
      <Tooltip title={t("debug.start")}><span><IconButton color="primary" aria-label={t("debug.start")}
        disabled={current === undefined || store.active || store.busy}
        onClick={() => { if (current !== undefined) void store.start(current.id); }}><PlayArrow /></IconButton></span></Tooltip>
    </Stack>
    {emptyHint}
    <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
      <MenuItem onClick={() => { setAnchor(null); setEditing({}); }}>
        <ListItemIcon><Add fontSize="small" /></ListItemIcon><ListItemText>{t("debug.addConfiguration")}</ListItemText>
      </MenuItem>
      <MenuItem disabled={current === undefined} onClick={() => { setAnchor(null); setEditing({ configuration: current }); }}>
        <ListItemIcon><EditOutlined fontSize="small" /></ListItemIcon><ListItemText>{t("debug.edit")}</ListItemText>
      </MenuItem>
      <MenuItem disabled={current === undefined || store.active} onClick={() => { setAnchor(null); store.error = null; setRemoving(current ?? null); }}>
        <ListItemIcon><DeleteOutline fontSize="small" /></ListItemIcon><ListItemText>{t("debug.remove")}</ListItemText>
      </MenuItem>
      <Divider />
      <MenuItem onClick={importConfigurations}>
        <ListItemIcon><FileDownloadOutlined fontSize="small" /></ListItemIcon>
        <ListItemText primary={t("debug.import.button")} secondary={importer.detected ? t("debug.import.detected") : undefined} />
      </MenuItem>
    </Menu>
    <Dialog open={removing !== null} onClose={() => { if (!deleting) setRemoving(null); }} maxWidth="xs" fullWidth>
      <DialogTitle>{t("debug.remove")}</DialogTitle>
      <DialogContent>{t("debug.removeConfigurationConfirm", { name: removing?.name })}{deletionError}</DialogContent>
      <DialogActions><Button disabled={deleting} onClick={() => setRemoving(null)}>{t("debug.cancel")}</Button>
        <Button disabled={deleting || store.active} color="error" onClick={() => void remove()}>{t("debug.remove")}</Button></DialogActions>
    </Dialog>
    {editDialog}{importDialog}
  </Stack>;
}
export const DebugConfigurationBarX = observer(DebugConfigurationBar);
