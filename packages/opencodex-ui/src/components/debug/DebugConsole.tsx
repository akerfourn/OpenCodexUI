import { Box, Button, CircularProgress, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from "@mui/material";
import ContentCopy from "@mui/icons-material/ContentCopy";
import DeleteSweepOutlined from "@mui/icons-material/DeleteSweepOutlined";
import OpenInNew from "@mui/icons-material/OpenInNew";
import VerticalAlignBottom from "@mui/icons-material/VerticalAlignBottom";
import Send from "@mui/icons-material/Send";
import { observer } from "mobx-react-lite";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { DebugStore } from "../../stores/debug/DebugStore";
import { DebugConsoleRowX } from "./DebugConsoleRow";

/** Expands into available space and follows new output only while the reader is at the bottom. */
export function DebugConsole({ store, detached = false }: { store: DebugStore; detached?: boolean }) {
  const { t } = useTranslation();
  const output = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const session = store.snapshot.session;
  const rows = session?.output ?? [];
  const lastOutputId = rows.at(-1)?.id;
  const hasFrame = session?.state === "paused" && store.selectedFrame !== null;
  const canEvaluate = hasFrame && !store.consolePending;
  const isDetached = !detached && store.consoleWindow.host !== null;
  useEffect(() => {
    if (following && output.current !== null) output.current.scrollTop = output.current.scrollHeight;
  }, [lastOutputId, session?.id, rows.length, following, isDetached]);

  useEffect(() => setFollowing(true), [session?.id]);

  /** Preserves scrollback while new output arrives. */
  function handleScroll(): void {
    const element = output.current;
    if (element !== null) setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 24);
  }
  /** Explicitly resumes automatic scrolling. */
  function follow(): void {
    setFollowing(true);
    if (output.current !== null) output.current.scrollTop = output.current.scrollHeight;
  }
  /** Uses the focused window's clipboard when the console is detached. */
  async function copy(event: MouseEvent<HTMLButtonElement>): Promise<void> {
    try {
      const clipboard = event.currentTarget.ownerDocument.defaultView?.navigator.clipboard;
      if (clipboard === undefined) throw new Error(t("debug.clipboardUnavailable"));
      await clipboard.writeText(rows.map(item => item.text).join("\n"));
    } catch (error) { store.error = String(error); }
  }
  /** Opens a second view of the same state; popup failures do not hide the inline console. */
  function detach(): void {
    try {
      if (!store.consoleWindow.open(t("debug.console"))) store.error = t("debug.windowBlocked");
    } catch (error) { store.error = String(error); }
  }
  const empty = rows.length === 0 ? (
    <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: "center" }}>{t("debug.consoleEmpty")}</Typography>
  ) : null;
  const detachButton = detached ? null : (
    <Tooltip title={t("debug.openConsoleWindow")}>
      <IconButton size="small" aria-label={t("debug.openConsoleWindow")} onClick={detach}><OpenInNew fontSize="small" /></IconButton>
    </Tooltip>
  );
  const controls = [
    { label: t("debug.followOutput"), icon: <VerticalAlignBottom fontSize="small" />, disabled: following, action: follow },
    { label: t("debug.copy"), icon: <ContentCopy fontSize="small" />, disabled: rows.length === 0, action: copy },
    { label: t("debug.clear"), icon: <DeleteSweepOutlined fontSize="small" />, disabled: rows.length === 0,
      action: () => { if (session) void store.run({ kind: "clearConsole", sessionId: session.id }); } }
  ];
  const evaluateIcon = store.consolePending ? <CircularProgress size={16} /> : <Send fontSize="small" />;
  const helper = hasFrame ? t("debug.consoleFrame", { name: store.selectedFrame?.name }) : t("debug.consolePauseHint");
  if (isDetached) return <Stack spacing={1} sx={{ p: 1, alignItems: "flex-start" }}>
    <Typography variant="subtitle2">{t("debug.console")}</Typography>
    <Typography variant="body2" color="text.secondary">{t("debug.consoleDetached")}</Typography>
    <Stack direction="row" spacing={1}>
      <Button size="small" startIcon={<OpenInNew />} onClick={detach}>{t("debug.showWindow")}</Button>
      <Button size="small" onClick={store.consoleWindow.close}>{t("debug.dockConsole")}</Button>
    </Stack>
  </Stack>;
  return <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: detached ? 0 : 300 }}>
    <Stack direction="row" sx={{ alignItems: "center", mb: 0.5 }}>
      <Typography variant="subtitle2" sx={{ flex: 1 }}>{t("debug.console")}</Typography>
      {controls.map(control => <Tooltip key={control.label} title={control.label} slotProps={{ popper: { container: output.current?.ownerDocument.body } }}>
        <span><IconButton size="small" aria-label={control.label} disabled={control.disabled} onClick={control.action}>
          {control.icon}
        </IconButton></span>
      </Tooltip>)}
      {detachButton}
    </Stack>
    <Box ref={output} role="log" aria-label={t("debug.console")} aria-live="off" tabIndex={0} onScroll={handleScroll}
      sx={{ flex: 1, minHeight: detached ? 0 : 200, overflow: "auto", bgcolor: "action.hover", p: 1,
        border: 1, borderColor: "divider", borderRadius: 1, fontFamily: "monospace", fontSize: 13, lineHeight: 1.6 }}>
      {empty}{rows.map(item => <DebugConsoleRowX key={item.id} store={store} item={item} />)}
    </Box>
    <TextField fullWidth size="small" placeholder={t("debug.evaluate")} value={store.consoleInput}
      sx={{ mt: 1 }} helperText={helper} disabled={!canEvaluate}
      slotProps={{ htmlInput: { "aria-label": t("debug.evaluate") }, input: { endAdornment: (
        <InputAdornment position="end"><IconButton size="small" aria-label={t("debug.evaluate")}
          disabled={!canEvaluate || store.consoleInput.trim().length === 0} onClick={() => void store.evaluateConsole()}>
          {evaluateIcon}
        </IconButton></InputAdornment>
      ) } }} onChange={event => { store.consoleInput = event.target.value; }}
      onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) void store.evaluateConsole(); }} />
  </Box>;
}
export const DebugConsoleX = observer(DebugConsole);
