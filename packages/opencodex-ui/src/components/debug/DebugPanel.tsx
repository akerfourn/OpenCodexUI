import { Alert, Box, Chip, Dialog, DialogContent, DialogTitle, IconButton, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import Close from "@mui/icons-material/Close";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { sameDebugContext } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { DebugError } from "./DebugError";
import { DebugControlsX } from "./DebugControls";
import { DebugStackX } from "./DebugStack";
import { DebugBreakpointsX } from "./DebugBreakpoints";
import { DebugWatchesX } from "./DebugWatches";
import { DebugConsoleX } from "./DebugConsole";
import { DebugConfigurationBarX } from "./DebugConfigurationBar";
import { DebugSection } from "./DebugSection";

/** Prioritizes execution and console output while keeping setup and inspection discoverable. */
export function DebugPanel({ store: root, projectStore }: { store: RootStore; projectStore: ProjectStore }) {
  const { t } = useTranslation();
  const store = root.debugStore;
  const workspace = projectStore.workspaces.current;
  const [help, setHelp] = useState(false);
  useEffect(() => { void store.load(); }, [store]);
  const context = workspace?.sourceId ? { sourceId: workspace.sourceId, projectId: projectStore.project.id,
    workspaceId: workspace.id, workspacePath: workspace.path } : null;
  const session = store.snapshot.session;
  const error = store.error === null ? null : <DebugError details={store.error} onClose={() => { store.error = null; }} />;
  let sessionContent;
  let stack;
  if (session !== null) {
    const failure = session.error === undefined ? null : <DebugError details={session.error} />;
    const progress = ["preparing", "connecting", "stopping"].includes(session.state) ? <LinearProgress /> : null;
    let color: "warning" | "success" | "default" = "default";
    if (session.state === "paused") color = "warning";
    if (session.state === "running") color = "success";
    const otherWorkspace = context === null || !sameDebugContext(session.configuration.context, context);
    const workspaceHint = otherWorkspace ? <Alert severity="info" sx={{ py: 0 }}>{t("debug.sessionOtherWorkspace")}</Alert> : null;
    const controls = store.active ? <DebugControlsX store={store} /> : null;
    sessionContent = <Stack spacing={0.5} sx={{ flexShrink: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <Tooltip title={session.configuration.context.workspacePath}><Typography variant="body2" noWrap sx={{ flex: 1 }}>
          {session.configuration.name}
        </Typography></Tooltip>
        <Chip size="small" color={color} label={t(`debug.states.${session.state}`)} />
      </Stack>
      {workspaceHint}{progress}{failure}{controls}
    </Stack>;
    if (session.state === "paused") stack = <DebugSection key={`${session.id}:${session.epoch}`} title={t("debug.stack")} count={store.frames.length} defaultExpanded>
      <DebugStackX store={store} hideTitle />
    </DebugSection>;
  }
  let configuration;
  let breakpoints;
  if (context !== null) {
    configuration = <DebugConfigurationBarX key={JSON.stringify(context)} root={root} context={context} />;
    const count = store.snapshot.preferences.breakpoints.filter(item => sameDebugContext(item.context, context)).length;
    breakpoints = <DebugSection title={t("debug.breakpoints")} count={count}>
      <DebugBreakpointsX store={store} context={context} hideTitle />
    </DebugSection>;
  }
  return <Box sx={{ overflow: "auto", flex: 1, minWidth: 0, minHeight: 0, p: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
    <Stack spacing={1} sx={{ flexShrink: 0 }}>
      <Stack direction="row" sx={{ alignItems: "center" }}>
        <Typography variant="subtitle1" sx={{ flex: 1 }}>{t("debug.title")}</Typography>
        <Tooltip title={t("debug.about")}><IconButton size="small" aria-label={t("debug.about")} onClick={() => setHelp(true)}><InfoOutlined fontSize="small" /></IconButton></Tooltip>
      </Stack>
      <Tooltip title={workspace?.path ?? ""}><Typography variant="caption" noWrap color="text.secondary">
        {workspace?.name || workspace?.path}
      </Typography></Tooltip>
      {error}{configuration}
    </Stack>
    {sessionContent}
    <Box sx={{ flexShrink: 0 }}>{stack}{breakpoints}
      <DebugSection title={t("debug.watches")} count={store.snapshot.preferences.watches.length}>
        <DebugWatchesX store={store} hideTitle />
      </DebugSection>
    </Box>
    <DebugConsoleX store={store} />
    <Dialog open={help} onClose={() => setHelp(false)} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center" }}>{t("debug.about")}
        <IconButton size="small" aria-label={t("debug.close")} sx={{ ml: "auto" }} onClick={() => setHelp(false)}><Close /></IconButton>
      </DialogTitle><DialogContent><Typography variant="body2">{t("debug.limits")}</Typography></DialogContent>
    </Dialog>
  </Box>;
}
export const DebugPanelX = observer(DebugPanel);
