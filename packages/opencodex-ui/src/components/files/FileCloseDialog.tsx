import { observer } from "mobx-react-lite";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";
import type { FileCloseStore } from "../../stores/files/FileCloseStore";
import { FileErrorX } from "./FileError";

/** Shared loss-prevention dialog for every close/reload/restart entry point. */
export function FileCloseDialog({ store }: { store: FileCloseStore }) {
  const { t } = useTranslation();
  const busy = store.isSaving || store.documents.some((document) => document.isSaving);
  /** Keeps all buffers and cancels the pending close action. */
  function cancel(): void {
    store.cancel();
  }
  /** Continues only after explicit abandonment. */
  function discard(): void {
    store.discard();
  }
  /** Runs the guarded save sequence. */
  function save(): void {
    void store.save();
  }
  const rows = store.documents.map((document) => {
    const error = document.error === null ? null : <FileErrorX error={document.error} />;
    return (
      <div key={document.id}>
        <Typography variant="body2" sx={{ overflowWrap: "anywhere", mt: 1 }}>
          {document.workspaceName} · {document.target?.path ?? document.name}
        </Typography>
        {error}
      </div>
    );
  });
  const progress = busy ? <LinearProgress /> : null;
  return (
    <Dialog open={store.documents.length > 0} onClose={cancel} fullWidth maxWidth="sm">
      <DialogTitle>{t("files.unsavedTitle")}</DialogTitle>
      <DialogContent>
        <Typography>{t("files.unsavedDescription")}</Typography>
        {rows}
        {progress}
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel} disabled={store.isSaving}>
          {t("common.cancel")}
        </Button>
        <Button onClick={discard} disabled={busy} color="warning">
          {t("files.discard")}
        </Button>
        <Button onClick={save} disabled={busy} variant="contained">
          {t("files.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
export const FileCloseDialogX = observer(FileCloseDialog);
