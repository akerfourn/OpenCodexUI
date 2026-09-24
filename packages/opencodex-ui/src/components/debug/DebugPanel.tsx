import { DebugError } from "./DebugError";
import { Alert, Box, Button, Divider, LinearProgress, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { sameDebugContext } from "@open-codex-ui/opencodex-protocol";
import type { DebugConfiguration, OpenCodexFileContext } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { DebugConfigurationDialogX } from "./DebugConfigurationDialog";
import { DebugControlsX } from "./DebugControls";
import { DebugStackX } from "./DebugStack";
import { DebugBreakpointsX } from "./DebugBreakpoints";
import { DebugWatchesX } from "./DebugWatches";
import { DebugConsoleX } from "./DebugConsole";

/** Workspace configuration selector with application-owned execution state below it. */
export function DebugPanel({ store: root, projectStore }: { store: RootStore; projectStore: ProjectStore }) {
  const { t } = useTranslation();
  const store = root.debugStore;
  const workspace = projectStore.workspaces.current;
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<{ context: OpenCodexFileContext; configuration?: DebugConfiguration } | null>(null);
  useEffect(() => { void store.load(); }, [store]);
  const context = workspace?.sourceId ? { sourceId: workspace.sourceId, projectId: projectStore.project.id,
    workspaceId: workspace.id, workspacePath: workspace.path } : null;
  const configurations = store.snapshot.preferences.configurations.filter(item => context && sameDebugContext(item.context, context));
  const current = configurations.find(item => item.id === selected) ?? configurations[0];
  const session = store.snapshot.session;
  let dialog;
  if (editing) dialog = <DebugConfigurationDialogX store={store} context={editing.context}
    configuration={editing.configuration} onClose={() => setEditing(null)} />;
  let error;
  if (store.error) error = <DebugError details={store.error} onClose={() => { store.error = null; }} />;
  let sessionContent;
  if (session) {
    let failure;
    if (session.error) failure = <DebugError details={session.error} />;
    let progress;
    if (["preparing", "connecting", "stopping"].includes(session.state)) progress = <LinearProgress />;
    sessionContent = <>
      <Typography variant="body2">{session.configuration.name} — {t(`debug.states.${session.state}`)}</Typography>
      <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>{session.configuration.context.workspacePath}</Typography>
      {progress}{failure}<DebugControlsX store={store} /><DebugStackX store={store} />
    </>;
  }
  let breakpointContent;
  if (context) breakpointContent = <DebugBreakpointsX store={store} context={context} />;
  return <Box sx={{ overflow: "auto", flex: 1, minWidth: 0, p: 1.5 }}>
    <Stack spacing={1.5} divider={<Divider />}>
      <Stack spacing={1}>
        <Typography variant="subtitle1">{t("debug.title")}</Typography>
        <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>{workspace?.name} — {workspace?.path}</Typography>
        <Alert severity="info" sx={{ fontSize: 12 }}>{t("debug.limits")}</Alert>
        {error}
        <TextField size="small" select fullWidth label={t("debug.configuration")} value={current?.id ?? ""}
          onChange={event => setSelected(event.target.value)}>
          <MenuItem value="" disabled>{t("debug.noConfiguration")}</MenuItem>
          {configurations.map(config => <MenuItem key={config.id} value={config.id}>{config.name}</MenuItem>)}
        </TextField>
        <Stack direction="row" sx={{ flexWrap: "wrap" }}>
          <Button disabled={!context} onClick={() => { if (context) setEditing({ context }); }}>{t("debug.add")}</Button>
          <Button disabled={!current} onClick={() => { if (current && context) setEditing({ context, configuration: current }); }}>{t("debug.edit")}</Button>
          <Button disabled={!current || store.active} onClick={() => { if (current) void store.run({ kind: "deleteConfiguration", id: current.id }); }}>{t("debug.remove")}</Button>
          <Button variant="contained" disabled={!current || store.active || store.busy} onClick={() => { if (current) void store.start(current.id); }}>{t("debug.start")}</Button>
        </Stack>
      </Stack>
      {sessionContent}{breakpointContent}<DebugWatchesX store={store} /><DebugConsoleX store={store} />
    </Stack>{dialog}
  </Box>;
}
export const DebugPanelX = observer(DebugPanel);
