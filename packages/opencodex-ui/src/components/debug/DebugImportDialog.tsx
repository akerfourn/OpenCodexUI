import { useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress,
  MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { DebugConfiguration, DebugImportIssue } from "@open-codex-ui/opencodex-protocol";
import type { DebugImportStore } from "../../stores/debug/DebugImportStore";
import type { DebugStore } from "../../stores/debug/DebugStore";
import { DebugConfigurationDialogX } from "./DebugConfigurationDialog";
import { DebugImportIssuesX } from "./DebugImportIssues";

/** Requires an explicit selection and then opens the normal editable configuration form. */
export function DebugImportDialog({ store, debug, onClose }: {
  store: DebugImportStore; debug: DebugStore; onClose(): void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState<{ configuration: DebugConfiguration; issues: DebugImportIssue[] } | null>(null);
  const entries = store.preview?.entries ?? [];
  const entry = entries[selected];
  const issues = [...(store.preview?.issues ?? []), ...(entry?.issues ?? [])];

  /** The draft keeps its original workspace even if a later UI selection changes. */
  function handleContinue(): void {
    if (entry?.configuration !== undefined && entry.configuration !== null) {
      setEditing({ configuration: entry.configuration, issues });
    }
  }

  /** Retries reading the file and discards the previous selection index. */
  function handleRetry(): void {
    setSelected(0);
    void store.load();
  }

  if (editing !== null) {
    return <DebugConfigurationDialogX store={debug} context={store.context}
      configuration={editing.configuration} importIssues={editing.issues} onClose={onClose} />;
  }
  let content: ReactNode = null;
  if (store.loading) content = <LinearProgress aria-label={t("debug.import.loading")} />;
  else if (store.error !== null) content = <Alert severity="error">{store.error}</Alert>;
  else if (entries.length === 0) content = <Alert severity="info">{t("debug.import.empty")}</Alert>;
  else {
    const choices = entries.map((candidate, index) => {
      let status: "complete" | "unsupported" | "partial" = "complete";
      if (candidate.configuration === null) status = "unsupported";
      else if (candidate.issues.length > 0 || (store.preview?.issues.length ?? 0) > 0) status = "partial";
      return <MenuItem key={index} value={index}>
        {candidate.name} — {t(`debug.import.${status}`)}
      </MenuItem>;
    });
    content = <>
      <TextField select fullWidth label={t("debug.configuration")} value={selected}
        onChange={event => setSelected(Number(event.target.value))}>{choices}</TextField>
      <DebugImportIssuesX issues={issues} />
    </>;
  }
  return <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
    <DialogTitle>{t("debug.import.title")}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
      <Typography variant="body2">{t("debug.import.description")}</Typography>
      <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>
        {store.context.workspacePath} — .vscode/launch.json
      </Typography>
      {content}
    </Stack></DialogContent>
    <DialogActions>
      <Button onClick={onClose}>{t("debug.cancel")}</Button>
      <Button onClick={handleRetry} disabled={store.loading}>{t("debug.import.reload")}</Button>
      <Button onClick={handleContinue}
        disabled={store.loading || entry?.configuration === undefined || entry.configuration === null}>
        {t("debug.import.review")}
      </Button>
    </DialogActions>
  </Dialog>;
}
export const DebugImportDialogX = observer(DebugImportDialog);
