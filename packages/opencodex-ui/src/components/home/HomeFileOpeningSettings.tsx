import { useApplicationErrorReporter } from "../app/applicationErrorContext";
import { useState, type ChangeEvent } from "react";
import { MenuItem, Stack, TextField } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { RootStore } from "../../stores/RootStore";

/** Selects the persisted default for file references, independently of explicit external actions. */
export function HomeFileOpeningSettings({ store }: { store: RootStore }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const reportError = useApplicationErrorReporter();
  const settings = store.appStore.settingsStore;
  /** Retains the old preference when persistence fails. */
  async function change(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const mode = event.target.value;
    if (saving || (mode !== "integrated" && mode !== "external")) return;
    setSaving(true);
    try { await settings.setFileOpeningMode(mode); }
    catch (reason) { reportError(reason); }
    finally { setSaving(false); }
  }
  /** Saves folder handling without changing the file preference. */
  async function changeFolder(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const mode = event.target.value;
    if (saving || (mode !== "system" && mode !== "external")) return;
    setSaving(true);
    try { await settings.setFolderOpeningMode(mode); }
    catch (reason) { reportError(reason); }
    finally { setSaving(false); }
  }

  return (
    <Stack spacing={1}>
      <TextField select fullWidth size="small" disabled={saving}
        label={t("files.openingMode")} value={settings.settings.fileOpeningMode ?? "integrated"}
        helperText={t("files.openingDescription")} onChange={change}>
        <MenuItem value="integrated">{t("files.openingIntegrated")}</MenuItem>
        <MenuItem value="external">{t("files.openingExternal")}</MenuItem>
      </TextField>
      <TextField select fullWidth size="small" disabled={saving}
        label={t("files.folderOpeningMode")} value={settings.settings.folderOpeningMode ?? "external"}
        helperText={t("files.folderOpeningDescription")} onChange={changeFolder}>
        <MenuItem value="external">{t("files.openingExternal")}</MenuItem>
        <MenuItem value="system">{t("files.folderOpeningSystem")}</MenuItem>
      </TextField>
      </Stack>
  );
}
export const HomeFileOpeningSettingsX = observer(HomeFileOpeningSettings);
