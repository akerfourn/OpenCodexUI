import { Box, IconButton, Stack, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineOutlined";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DebugStore } from "../../stores/debug/DebugStore";

/** Retains expressions between sessions and shows values only for the current paused frame. */
export function DebugWatches({ store }: { store: DebugStore }) {
  const { t } = useTranslation();
  const [expression, setExpression] = useState("");
  /** Adds without evaluating outside a suspended execution context. */
  function add(): void {
    if (!expression.trim()) return;
    void store.setWatches([...store.snapshot.preferences.watches, expression.trim()]);
    setExpression("");
  }
  return <Box><Typography variant="subtitle2">{t("debug.watches")}</Typography>
    {store.snapshot.preferences.watches.map(item => <Stack key={item} direction="row" sx={{ alignItems: "center" }}>
      <Typography variant="caption" sx={{ flex: 1, overflowWrap: "anywhere", fontFamily: "monospace" }}>{item}: {store.watches[item] ?? "—"}</Typography>
      <IconButton size="small" aria-label={t("debug.remove")} onClick={() => void store.setWatches(store.snapshot.preferences.watches.filter(entry => entry !== item))}><DeleteOutlineIcon fontSize="small" /></IconButton>
    </Stack>)}
    <Stack direction="row"><TextField fullWidth size="small" label={t("debug.expression")} value={expression}
      onChange={event => setExpression(event.target.value)} onKeyDown={event => { if (event.key === "Enter") add(); }} />
      <IconButton aria-label={t("debug.add")} onClick={add} disabled={!expression.trim()}><AddIcon /></IconButton></Stack>
  </Box>;
}
export const DebugWatchesX = observer(DebugWatches);
