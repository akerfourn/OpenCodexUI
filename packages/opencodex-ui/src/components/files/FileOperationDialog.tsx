import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent, FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { FileOperationsStore } from "../../stores/files/FileOperationsStore";
import { FileErrorX } from "./FileError";

/** Collects names and explicit deletion consent while retaining source errors for retry. */
export function FileOperationDialog({ operations }: { operations: FileOperationsStore }) {
  const { t } = useTranslation();
  const dialog = operations.dialog;
  if (dialog === null) return null;
  const deleting = dialog.kind === "delete";

  /** Delegates dirty-buffer protection and source mutation to the operation store. */
  function submit(event: FormEvent): void {
    event.preventDefault();
    void operations.submit();
  }
  /** Cancels only when no source operation or save confirmation is pending. */
  function close(): void {
    operations.close();
  }
  /** Preserves the exact entered filename for source-side validation. */
  function changeName(event: ChangeEvent<HTMLInputElement>): void {
    operations.setName(event.target.value);
  }

  const nameField = deleting ? null : <TextField autoFocus fullWidth label={t("files.operations.name")}
    value={operations.name} onChange={changeName} disabled={operations.isBusy} />;
  const deleteWarning = dialog.isSymbolicLink === true
    ? t("files.operations.deleteLinkWarning") : t("files.operations.deleteWarning");
  const warning = deleting ? <Alert severity="warning">{deleteWarning}</Alert> : null;
  const error = operations.error === null ? null : <FileErrorX error={operations.error} />;
  const destination = dialog.kind === "copy" ? (
    <Typography variant="body2">{t("files.operations.destination", { path: dialog.destinationPath || "/" })}</Typography>
  ) : null;
  const action = deleting ? t("files.operations.delete") : t("files.operations.confirm");
  const title = dialog.kind === "copy" ? t("files.operations.paste") : t(`files.operations.${dialog.kind}`);

  return <Dialog open onClose={close} maxWidth="sm" fullWidth>
    <form onSubmit={submit}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography sx={{ overflowWrap: "anywhere" }}>{dialog.target.path}</Typography>
          {destination}
          {warning}
          {nameField}
          {error}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={operations.isBusy}>{t("files.operations.cancel")}</Button>
        <Button type="submit" color={deleting ? "error" : "primary"} loading={operations.isBusy}
          disabled={operations.isBusy || (!deleting && operations.name.length === 0)}>{action}</Button>
      </DialogActions>
    </form>
  </Dialog>;
}

export const FileOperationDialogX = observer(FileOperationDialog);
