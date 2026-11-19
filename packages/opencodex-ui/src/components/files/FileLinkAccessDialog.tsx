import { useApplicationErrorReporter } from "../app/applicationErrorContext";
import { useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexFileAccess, OpenCodexFileLinkAccess } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceTreeStore } from "../../stores/files/WorkspaceTreeStore";
import type { ProjectFilesStore } from "../../stores/files/ProjectFilesStore";

/** Edits a canonical external destination's permission in the captured workspace. */
export function FileLinkAccessDialog({ tree, files, path, link, onClose }: {
  tree: WorkspaceTreeStore;
  files: ProjectFilesStore;
  path: string;
  link: OpenCodexFileLinkAccess;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [access, setAccess] = useState<OpenCodexFileAccess>(link.access);
  const [saving, setSaving] = useState(false);
  const reportError = useApplicationErrorReporter();

  /** Persists first, then updates open documents without replacing their buffers. */
  async function save(): Promise<void> {
    setSaving(true);
    try {
      await tree.setLinkAccess(path, link.destination, access);
      await files.refreshAccess(tree.context);
      onClose();
      tree.refresh();
    } catch (cause) {
      reportError(cause);
    } finally {
      setSaving(false);
    }
  }

  /** Prevents dismissal while the permission update is being acknowledged. */
  function close(): void {
    if (!saving) onClose();
  }

  return <Dialog open onClose={close} maxWidth="sm" fullWidth>
    <DialogTitle>{t("files.access.manage")}</DialogTitle>
    <DialogContent>
      <Stack spacing={2}>
        <Typography sx={{ overflowWrap: "anywhere" }}>{link.destination}</Typography>
        <Typography variant="body2">{t("files.access.description")}</Typography>
        <RadioGroup value={access} onChange={(_event, value) => setAccess(value as OpenCodexFileAccess)}>
          <FormControlLabel value="denied" control={<Radio />} disabled={saving} label={t("files.access.denied")} />
          <FormControlLabel value="readOnly" control={<Radio />} disabled={saving} label={t("files.access.readOnly")} />
          <FormControlLabel value="readWrite" control={<Radio />} disabled={saving} label={t("files.access.readWrite")} />
        </RadioGroup>

      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={close} disabled={saving}>{t("files.access.cancel")}</Button>
      <Button onClick={save} disabled={saving} loading={saving}>{t("files.save")}</Button>
    </DialogActions>
  </Dialog>;
}
export const FileLinkAccessDialogX = observer(FileLinkAccessDialog);
