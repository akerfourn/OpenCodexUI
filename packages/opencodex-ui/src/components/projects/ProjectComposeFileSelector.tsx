import { Alert, MenuItem, Stack, TextField } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { ChangeEvent } from "react";
import type { ProjectComposeStore } from "../../stores/project/ProjectComposeStore";

/** Makes the exact configuration visible before exposing any service lifecycle controls. */
export function ProjectComposeFileSelector({ store }: { store: ProjectComposeStore }) {
  const { t } = useTranslation();
  const files = store.composeFiles;
  const selected = store.selectedComposeFile ?? "";
  if (files.length === 0 && selected === "") return null;

  /** Selection resets old service details and snapshots before requesting the new configuration. */
  function change(event: ChangeEvent<HTMLInputElement>): void {
    void store.selectComposeFile(event.target.value);
  }
  const options = files.map(file => <MenuItem key={file} value={file}>{file}</MenuItem>);
  if (selected !== "" && !files.includes(selected)) {
    options.push(<MenuItem key={selected} value={selected} disabled>{selected}</MenuItem>);
  }
  let feedback = null;
  if (store.snapshot?.selectionIssue === "missing") {
    feedback = <Alert severity="warning">{t("docker.compose.fileMissing")}</Alert>;
  }
  return <Stack spacing={1} sx={{ py: 1, px: 1.5, flex: "0 0 auto" }}>
    <TextField select fullWidth size="small" label={t("docker.compose.fileSelection")}
      value={selected} onChange={change}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
      disabled={!store.isAvailable || store.pendingServiceNames.size > 0}
      helperText={t("docker.compose.fileSelectionHelp")}>
      <MenuItem value="" disabled>{t("docker.compose.chooseFile")}</MenuItem>
      {options}
    </TextField>
    {feedback}
  </Stack>;
}
export const ProjectComposeFileSelectorX = observer(ProjectComposeFileSelector);
