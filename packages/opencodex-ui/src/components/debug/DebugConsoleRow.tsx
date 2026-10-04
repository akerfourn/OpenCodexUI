import { Box, Button } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { DebugOutput } from "@open-codex-ui/opencodex-protocol";
import type { DebugStore } from "../../stores/debug/DebugStore";

/** Keeps raw output selectable and distinguishes errors, entered expressions and results. */
export function DebugConsoleRow({ store, item }: { store: DebugStore; item: DebugOutput }) {
  let color = "text.primary";
  let prefix = "";
  if (item.category === "stderr") color = "error.main";
  else if (item.category === "input") { color = "info.main"; prefix = "> "; }
  else if (item.category === "result") { color = "success.main"; prefix = "← "; }
  else if (item.category === "console") color = "text.secondary";
  let source;
  if (item.source) source = <Button size="small" sx={{ textTransform: "none", fontFamily: "inherit" }}
    onClick={() => { if (item.source) void store.openConsoleSource(item.source, item.line, item.column); }}>
    {item.source.name ?? item.source.path}:{item.line}
  </Button>;
  return <Box sx={{ color, whiteSpace: "pre-wrap", overflowWrap: "anywhere", minHeight: "1em" }}>
    {prefix}{item.text}{source}
  </Box>;
}
export const DebugConsoleRowX = observer(DebugConsoleRow);
