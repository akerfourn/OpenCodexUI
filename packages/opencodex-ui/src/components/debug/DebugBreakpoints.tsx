import { Box, Button, Checkbox, IconButton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { sameDebugContext } from "@open-codex-ui/opencodex-protocol";
import type { DebugBreakpoint, OpenCodexFileContext } from "@open-codex-ui/opencodex-protocol";
import type { DebugStore } from "../../stores/debug/DebugStore";

/** Workspace-scoped breakpoint catalogue, including refused and not-yet-resolved requests. */
export function DebugBreakpoints({ store, context }: { store: DebugStore; context: OpenCodexFileContext }) {
  const { t } = useTranslation();
  const breakpoints = store.snapshot.preferences.breakpoints.filter(item => sameDebugContext(item.context, context));
  const session = store.snapshot.session;
  const sessionMatches = session !== null && sameDebugContext(session.configuration.context, context);
  /** Full replacement preserves the current source/worktree identity. */
  function update(item: DebugBreakpoint, patch: Partial<DebugBreakpoint>): void {
    void store.setBreakpoints(context, breakpoints.map(entry => entry.id === item.id ? { ...entry, ...patch } : entry));
  }
  /** Opens the original file using the source-aware Files service. */
  function open(item: DebugBreakpoint): void {
    const project = store.root.projectsStore.projectStoresById.get(item.context.projectId);
    void project?.files.open({ ...item.context, path: item.path }, context.workspacePath, { line: item.line }, { origin: "link" });
  }
  const rows = breakpoints.map(item => {
    const status = sessionMatches ? session.breakpoints.find(entry => entry.id === item.id) : undefined;
    let state = t("debug.breakpointRequested");
    if (!item.enabled) state = t("debug.breakpointDisabled");
    else if (status) state = status.verified ? t("debug.breakpointVerified") : t("debug.breakpointUnresolved");
    return <Box key={item.id} sx={{ mb: 1 }}>
      <Stack direction="row" sx={{ alignItems: "center" }}>
        <Checkbox size="small" checked={item.enabled} slotProps={{ input: { "aria-label": t("debug.enableBreakpoint") } }}
          onChange={(_event, enabled) => update(item, { enabled })} />
        <Button onClick={() => open(item)} size="small" sx={{ textTransform: "none", flex: 1, justifyContent: "flex-start", overflowWrap: "anywhere" }}>
          {item.path}:{status?.line ?? item.line}</Button>
        <Tooltip title={t("debug.remove")}><IconButton size="small" aria-label={t("debug.remove")}
          onClick={() => void store.setBreakpoints(context, breakpoints.filter(entry => entry.id !== item.id))}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
      </Stack>
      <Typography variant="caption" color="text.secondary">{state} {status?.message}</Typography>
      <TextField fullWidth size="small" label={t("debug.condition")} defaultValue={item.condition ?? ""}
        disabled={sessionMatches && store.active && session.capabilities.supportsConditionalBreakpoints !== true}
        onBlur={event => { if (event.target.value !== (item.condition ?? "")) update(item, { condition: event.target.value }); }} />
    </Box>;
  });
  return <Box><Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
    <Typography variant="subtitle2">{t("debug.breakpoints")}</Typography>
    <Button size="small" disabled={breakpoints.length === 0} onClick={() => void store.setBreakpoints(context, [])}>{t("debug.clear")}</Button>
  </Stack><Typography variant="caption" color="text.secondary">{t("debug.breakpointHelp")}</Typography>{rows}</Box>;
}
export const DebugBreakpointsX = observer(DebugBreakpoints);
