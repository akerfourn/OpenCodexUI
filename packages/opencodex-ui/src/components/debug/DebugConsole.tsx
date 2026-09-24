import { Box, Button, Stack, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DebugStore } from "../../stores/debug/DebugStore";

/** Bounded, resizable output view; expression evaluation is not a terminal input stream. */
export function DebugConsole({ store }: { store: DebugStore }) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const session = store.snapshot.session;
  /** Clears input only after the evaluation request completes. */
  async function evaluate(): Promise<void> {
    if (!input.trim() || pending) return;
    setPending(true);
    try { if (await store.evaluate(input)) setInput(""); }
    finally { setPending(false); }
  }
  /** Clipboard failures remain visible in the owning panel. */
  async function copy(): Promise<void> {
    try { await navigator.clipboard.writeText(session?.output.map(item => item.text).join("\n") ?? ""); }
    catch (error) { store.error = String(error); }
  }
  const rows = (session?.output ?? []).map(item => {
    const color = item.category === "stderr" ? "error.main" : "text.primary";
    let source;
    if (item.source) source = <Button size="small"
      onClick={() => { if (item.source) void store.openConsoleSource(item.source, item.line, item.column); }}>{item.source.name ?? item.source.path}:{item.line}</Button>;
    return <Box key={item.id} sx={{ color, whiteSpace: "pre-wrap", overflowWrap: "anywhere", mb: 0.5 }}>
      <Typography component="span" variant="caption" color="text.secondary">[{item.category}] </Typography>{item.text}{source}
    </Box>;
  });
  return <Box><Stack direction="row" sx={{ alignItems: "center" }}>
    <Typography variant="subtitle2" sx={{ flex: 1 }}>{t("debug.console")}</Typography>
    <Button size="small" onClick={() => void copy()}>{t("debug.copy")}</Button>
    <Button size="small" disabled={!session} onClick={() => { if (session) void store.run({ kind: "clearConsole", sessionId: session.id }); }}>{t("debug.clear")}</Button>
  </Stack><Box role="log" aria-label={t("debug.console")} sx={{ height: 170, minHeight: 80, maxHeight: 600,
    resize: "vertical", overflow: "auto", bgcolor: "action.hover", p: 1, fontFamily: "monospace", fontSize: 12 }}>{rows}</Box>
    <TextField fullWidth size="small" label={t("debug.evaluate")} value={input}
      disabled={session?.state !== "paused" || store.selectedFrame === null || pending}
      onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void evaluate(); }} />
  </Box>;
}
export const DebugConsoleX = observer(DebugConsole);
