import { Box, Button, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DebugVariable } from "@open-codex-ui/opencodex-protocol";
import type { DebugStore } from "../../stores/debug/DebugStore";

/** Loads at most one page when expanded; children are invalidated on frame/epoch change. */
export function DebugVariableNode({ store, variable, depth = 0 }: {
  store: DebugStore; variable: DebugVariable; depth?: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [children, setChildren] = useState<DebugVariable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const epoch = store.snapshot.session?.epoch;
  const frame = store.selectedFrame?.id;
  useEffect(() => {
    if (!open) return;
    let current = true;
    setLoading(true); setError(null);
    const filter = variable.indexedVariables ? "indexed" : undefined;
    void store.variables(variable.variablesReference, page * 100, filter).then(values => {
      if (current) setChildren(values);
    }).catch(failure => { if (current) setError(String(failure)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [store, variable.variablesReference, variable.indexedVariables, open, page, epoch, frame]);
  let body;
  if (open) {
    let feedback;
    if (loading) feedback = <Typography variant="caption">{t("debug.loading")}</Typography>;
    if (error) feedback = <Typography color="error" variant="caption">{error}</Typography>;
    let more;
    const total = variable.indexedVariables ?? variable.namedVariables ?? 0;
    if (total > 100) more = <Box><Button disabled={page === 0} onClick={() => setPage(page - 1)}>{t("debug.previous")}</Button>
      <Button disabled={(page + 1) * 100 >= total} onClick={() => setPage(page + 1)}>{t("debug.more")}</Button></Box>;
    body = <Box sx={{ pl: 1, borderLeft: 1, borderColor: "divider" }}>{feedback}
      {children.map((child, index) => <DebugVariableNodeX key={`${page}:${index}:${child.name}`} store={store} variable={child} depth={depth + 1} />)}
      {more}
    </Box>;
  }
  let label = <Typography variant="caption" sx={{ fontFamily: "monospace", overflowWrap: "anywhere" }}>
    {variable.name}: {variable.value.slice(0, 2000)}</Typography>;
  if (variable.variablesReference > 0 && depth < 12) label = <Button size="small" onClick={() => setOpen(!open)}
    sx={{ textTransform: "none", textAlign: "left", justifyContent: "flex-start", overflowWrap: "anywhere" }}>
    {open ? "▾" : "▸"} {variable.name}: {variable.value.slice(0, 300)}</Button>;
  return <Box>{label}{body}</Box>;
}
export const DebugVariableNodeX = observer(DebugVariableNode);
