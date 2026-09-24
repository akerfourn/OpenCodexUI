import { Box, List, ListItemButton, ListItemText, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { DebugStore } from "../../stores/debug/DebugStore";
import { DebugVariableNodeX } from "./DebugVariableNode";

/** Displays a bounded call stack and lazily expandable scopes for the selected frame. */
export function DebugStack({ store }: { store: DebugStore }) {
  const { t } = useTranslation();
  return <Box>
    <Typography variant="subtitle2">{t("debug.stack")}</Typography>
    <List dense disablePadding sx={{ maxHeight: 220, overflow: "auto" }}>{store.frames.map(frame =>
      <ListItemButton key={frame.id} selected={store.selectedFrame?.id === frame.id} onClick={() => void store.selectFrame(frame)}>
        <ListItemText primary={frame.name} secondary={`${frame.source?.name ?? frame.source?.path ?? ""}:${frame.line}`}
          slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }} />
      </ListItemButton>)}</List>
    <Typography variant="subtitle2">{t("debug.variables")}</Typography>
    {store.scopes.map(scope => <DebugVariableNodeX key={`${store.snapshot.session?.id}:${store.snapshot.session?.epoch}:${store.selectedFrame?.id}:${scope.variablesReference}`}
      store={store} variable={{ name: scope.name, value: "", variablesReference: scope.variablesReference }} />)}
  </Box>;
}
export const DebugStackX = observer(DebugStack);
